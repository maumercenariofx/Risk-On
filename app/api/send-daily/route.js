import { Resend } from "resend";
import yahooFinance from "yahoo-finance2";
import { getAllPostsMeta } from "../../../lib/posts";

export const dynamic = "force-dynamic";

const SUBSCRIBERS = ["mauriciomn2002@gmail.com"];

const TICKERS = {
  "S&P 500 Fut.": "ES=F",
  "Nasdaq 100 Fut.": "NQ=F",
  "Dow Jones Fut.": "YM=F",
  VIX: "^VIX",
  "DXY (Dólar)": "DX-Y.NYB",
  "T-Note 10Y": "^TNX",
  Oro: "GC=F",
  "Petróleo WTI": "CL=F",
  Bitcoin: "BTC-USD",
};

const RISK_STATES = [
  { label: "RISK-OFF",     color: "#4A6FA5", min: 0,  max: 25  },
  { label: "DEFENSIVE",    color: "#C99A2E", min: 26, max: 50  },
  { label: "CONSTRUCTIVE", color: "#3A9E8F", min: 51, max: 75  },
  { label: "RISK-ON",      color: "#00D4A8", min: 76, max: 100 },
];

function riskStateFromScore(score) {
  return RISK_STATES.find((s) => score >= s.min && score <= s.max) ?? RISK_STATES[2];
}

function fmtPct(v) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function emptyRow(name) {
  return `<tr>
    <td style="padding:5px 14px;color:#aaa;font-family:monospace">${name}</td>
    <td style="padding:5px 14px;text-align:right;font-family:monospace">—</td>
    <td style="padding:5px 14px;text-align:right;font-family:monospace">—</td>
    <td style="padding:5px 14px;text-align:right;font-family:monospace">—</td>
  </tr>`;
}

async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Get today's daily view ───────────────────────────────────────────────
  const posts = getAllPostsMeta();
  if (!posts.length) {
    return Response.json({ error: "no posts found" }, { status: 404 });
  }
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  const post = posts.find((p) => String(p.date).slice(0, 10) === today) ?? posts[0];

  const { title_es, summary_es, watch_es = [], support, resistance, score = 70 } = post;
  const { label: riskState, color } = riskStateFromScore(score);

  // ── 2. Fetch market data ────────────────────────────────────────────────────
  const market = {};
  await Promise.all(
    Object.entries(TICKERS).map(async ([name, ticker]) => {
      try {
        const q = await yahooFinance.quote(ticker, {}, { validateResult: false });
        market[name] = {
          price:    q.regularMarketPrice,
          pct:      q.regularMarketChangePercent,
          prePrice: q.preMarketPrice ?? null,
          prePct:   q.preMarketChangePercent ?? null,
        };
      } catch {
        market[name] = null;
      }
    })
  );

  // ── 3. Build email HTML ─────────────────────────────────────────────────────
  const dateStr = new Date().toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Mexico_City",
  });

  const tableRows = Object.entries(market).map(([name, d]) => {
    if (!d) return emptyRow(name);
    const pctColor = (d.pct ?? 0) >= 0 ? "#00D4A8" : "#ff5555";
    const preColor = (d.prePct ?? 0) >= 0 ? "#00D4A8" : "#ff5555";
    return `<tr>
      <td style="padding:5px 14px;color:#aaa;font-family:monospace">${name}</td>
      <td style="padding:5px 14px;text-align:right;font-family:monospace">${d.price?.toFixed(2) ?? "—"}</td>
      <td style="padding:5px 14px;text-align:right;color:${pctColor};font-family:monospace">${fmtPct(d.pct)}</td>
      <td style="padding:5px 14px;text-align:right;color:${preColor};font-family:monospace">${d.prePrice != null ? `${d.prePrice.toFixed(2)} (${fmtPct(d.prePct)})` : "—"}</td>
    </tr>`;
  }).join("");

  const watchRows = watch_es.map((item) => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid #111;font-size:13px;color:#ccc;line-height:1.6;vertical-align:top">
        <span style="color:${color};margin-right:8px">›</span>${item}
      </td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#08080f;color:#e0e0e0;font-family:monospace">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px">

    <div style="border-bottom:1px solid ${color};padding-bottom:16px;margin-bottom:24px">
      <div style="font-size:11px;color:#555;letter-spacing:3px;text-transform:uppercase">riskon.lat</div>
      <div style="font-size:22px;font-weight:700;color:${color};margin:6px 0">◇ ${riskState}</div>
      <div style="font-size:12px;color:#666;text-transform:capitalize">${dateStr}</div>
    </div>

    <div style="margin-bottom:24px">
      <span style="font-size:10px;color:#555;letter-spacing:2px">RISK ON SCORE </span>
      <span style="font-size:16px;font-weight:700;color:${color}">${score}</span>
      <span style="font-size:10px;color:#444">/100</span>
    </div>

    <div style="margin-bottom:28px">
      <div style="font-size:10px;color:#555;letter-spacing:2px;margin-bottom:10px">DATOS DE MERCADO</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid #1e1e2e">
            <th style="padding:4px 14px;text-align:left;color:#555;font-weight:400;font-size:10px;letter-spacing:1px">ACTIVO</th>
            <th style="padding:4px 14px;text-align:right;color:#555;font-weight:400;font-size:10px;letter-spacing:1px">PRECIO</th>
            <th style="padding:4px 14px;text-align:right;color:#555;font-weight:400;font-size:10px;letter-spacing:1px">CAMBIO</th>
            <th style="padding:4px 14px;text-align:right;color:#555;font-weight:400;font-size:10px;letter-spacing:1px">PREMARKET</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>

    <div style="margin-bottom:28px">
      <div style="font-size:10px;color:#555;letter-spacing:2px;margin-bottom:12px">EL VIEW DE HOY</div>
      <div style="font-size:15px;font-weight:700;color:${color};margin-bottom:12px;line-height:1.4">${title_es}</div>
      <div style="font-size:14px;line-height:1.7;color:#ccc;border-left:2px solid ${color};padding-left:16px">${summary_es}</div>
    </div>

    ${watch_es.length ? `
    <div style="margin-bottom:28px">
      <div style="font-size:10px;color:#555;letter-spacing:2px;margin-bottom:10px">A VIGILAR</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${watchRows}</tbody></table>
    </div>` : ""}

    ${support || resistance ? `
    <div style="margin-bottom:28px;padding:12px 16px;border:1px solid #1e1e2e">
      <div style="font-size:10px;color:#555;letter-spacing:2px;margin-bottom:10px">USD/MXN — NIVELES</div>
      <table style="width:100%;font-size:13px;font-family:monospace"><tbody>
        <tr><td style="color:#555;padding:3px 0">SOPORTE</td><td style="text-align:right;color:#00D4A8">${support}</td></tr>
        <tr><td style="color:#555;padding:3px 0">RESISTENCIA</td><td style="text-align:right;color:#ff5555">${resistance}</td></tr>
      </tbody></table>
    </div>` : ""}

    <div style="border-top:1px solid #1e1e2e;padding-top:16px;font-size:10px;color:#444;letter-spacing:1px">
      RISKON.LAT · PREMARKET DIARIO · <a href="https://riskon.lat" style="color:#555;text-decoration:none">VER SITIO</a>
    </div>

  </div>
</body>
</html>`;

  // ── 4. Send emails ─────────────────────────────────────────────────────────
  const resend = new Resend(process.env.RESEND_API_KEY);
  const results = [];

  for (const email of SUBSCRIBERS) {
    const { error } = await resend.emails.send({
      from: "RISKON.LAT <view@riskon.lat>",
      to: email,
      subject: `◇ ${riskState} | ${title_es.slice(0, 60)}${title_es.length > 60 ? "…" : ""}`,
      html,
    });
    results.push({ email, ok: !error, error: error?.message });
  }

  return Response.json({ ok: true, riskState, score, sent: results });
}

export { handler as GET, handler as POST };
