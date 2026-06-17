import { Resend } from "resend";
import { getAllPostsMeta } from "../../../lib/posts";

export const dynamic = "force-dynamic";

const SUBSCRIBERS = ["mauriciomn2002@gmail.com"];

// 9 activos clave para el premarket. Orden = orden en la tabla del correo.
const TICKERS = [
  { name: "S&P 500 Fut.",   symbol: "ES=F",      kind: "index" },
  { name: "Nasdaq 100 Fut.", symbol: "NQ=F",     kind: "index" },
  { name: "Dow Jones Fut.", symbol: "YM=F",      kind: "index" },
  { name: "VIX",            symbol: "^VIX",      kind: "decimal" },
  { name: "DXY (Dólar)",    symbol: "DX-Y.NYB",  kind: "decimal" },
  { name: "T-Note 10Y",     symbol: "^TNX",      kind: "yield" },
  { name: "Oro",            symbol: "GC=F",      kind: "index" },
  { name: "Petróleo WTI",   symbol: "CL=F",      kind: "decimal" },
  { name: "Bitcoin",        symbol: "BTC-USD",   kind: "index" },
];

const RISK_STATES = [
  { label: "RISK-OFF",     color: "#3A5A8F", min: 0,  max: 25  },
  { label: "DEFENSIVE",    color: "#B8860B", min: 26, max: 50  },
  { label: "CONSTRUCTIVE", color: "#2A8576", min: 51, max: 75  },
  { label: "RISK-ON",      color: "#00A37F", min: 76, max: 100 },
];

// Paleta editorial clara
const C = {
  bg:      "#FAF8F3", // crema (fondo exterior)
  card:    "#FFFFFF",
  border:  "#E8E3D9",
  text:    "#1A1A1A",
  muted:   "#6B6B6B",
  faint:   "#9A9488",
  up:      "#0A7D3C",
  down:    "#C0392B",
};

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function riskStateFromScore(score) {
  return RISK_STATES.find((s) => score >= s.min && score <= s.max) ?? RISK_STATES[2];
}

// Mismo patrón que app/api/market/route.js: la v7 quote API exige crumb/cookie y
// devuelve 401 desde servidores; el v8 chart sigue siendo público.
async function yahooChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta ?? {};
    const rawC = result.indicators?.quote?.[0]?.close ?? [];
    const closes = rawC.filter((c) => c != null && !isNaN(c));

    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;

    let chgPct = null;
    if (closes.length >= 2) {
      const prev = closes[closes.length - 2];
      const last = closes[closes.length - 1];
      if (prev) chgPct = ((last - prev) / prev) * 100;
    }
    return { price, chgPct };
  } catch {
    return null;
  }
}

function fmtPct(v) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtPrice(v, kind) {
  if (v == null) return "—";
  if (kind === "yield") return `${v.toFixed(2)}%`;
  if (kind === "decimal") return v.toFixed(2);
  // index: separador de miles
  return v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 });
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

  // ── 2. Fetch market data (v8 chart, confiable desde servidor) ───────────────
  const charts = await Promise.all(TICKERS.map((t) => yahooChart(t.symbol)));
  const market = TICKERS.map((t, i) => ({ ...t, ...(charts[i] ?? {}) }));

  // ── 3. Build email HTML — editorial claro ───────────────────────────────────
  const dateStr = new Date().toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Mexico_City",
  });

  const tableRows = market.map((d, i) => {
    const last = i === market.length - 1;
    const bb = last ? "" : `border-bottom:1px solid ${C.border};`;
    const pct = d.chgPct;
    const pctColor = pct == null ? C.faint : pct >= 0 ? C.up : C.down;
    return `<tr>
      <td style="padding:11px 0;${bb}color:${C.text};font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px">${d.name}</td>
      <td style="padding:11px 0;${bb}text-align:right;color:${C.text};font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums">${fmtPrice(d.price, d.kind)}</td>
      <td style="padding:11px 0;${bb}text-align:right;color:${pctColor};font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;font-variant-numeric:tabular-nums">${fmtPct(pct)}</td>
    </tr>`;
  }).join("");

  const watchRows = watch_es.map((item) => `
    <tr>
      <td style="padding:0;vertical-align:top;width:18px">
        <div style="width:6px;height:6px;border-radius:50%;background:${color};margin-top:8px"></div>
      </td>
      <td style="padding:0 0 14px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#3a3a3a;line-height:1.65">${item}</td>
    </tr>`).join("");

  const sansFont = "'Helvetica Neue',Arial,sans-serif";
  const serifFont = "Georgia,'Times New Roman',serif";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">◇ ${riskState} · ${score}/100 — ${title_es}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-radius:4px">
          <tr>
            <td style="padding:40px 44px">

              <!-- Header -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:${sansFont};font-size:12px;letter-spacing:3px;color:${C.faint};text-transform:uppercase;font-weight:700">RISKON.LAT</td>
                  <td style="text-align:right;font-family:${sansFont};font-size:12px;color:${C.muted};text-transform:capitalize">${dateStr}</td>
                </tr>
              </table>
              <div style="border-bottom:2px solid ${C.text};margin:14px 0 28px 0"></div>

              <!-- Risk state + score -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                <tr>
                  <td style="background:${color};border-radius:3px;padding:7px 14px;font-family:${sansFont};font-size:13px;font-weight:700;letter-spacing:1px;color:#ffffff">◇ ${riskState}</td>
                  <td style="padding-left:14px;font-family:${sansFont};font-size:13px;color:${C.muted};letter-spacing:1px">SCORE <span style="color:${C.text};font-weight:700;font-size:15px">${score}</span>/100</td>
                </tr>
              </table>

              <!-- Headline -->
              <div style="font-family:${serifFont};font-size:26px;line-height:1.25;color:${C.text};font-weight:700;margin-bottom:18px">${title_es}</div>

              <!-- Summary -->
              <div style="font-family:${sansFont};font-size:15px;line-height:1.7;color:#3a3a3a;margin-bottom:34px">${summary_es}</div>

              <!-- Market data -->
              <div style="font-family:${sansFont};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:6px">DATOS DE MERCADO</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.text};margin-bottom:34px">
                ${tableRows}
              </table>

              ${watch_es.length ? `
              <!-- A vigilar -->
              <div style="font-family:${sansFont};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:14px">A VIGILAR</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:34px">
                ${watchRows}
              </table>` : ""}

              ${support || resistance ? `
              <!-- Niveles -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};border-radius:4px;margin-bottom:8px">
                <tr><td style="padding:18px 22px">
                  <div style="font-family:${sansFont};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:12px">USD/MXN · NIVELES</div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-family:${sansFont};font-size:13px;color:${C.muted}">Soporte</td>
                      <td style="text-align:right;font-family:${sansFont};font-size:15px;font-weight:700;color:${C.up};font-variant-numeric:tabular-nums">${support ?? "—"}</td>
                    </tr>
                    <tr>
                      <td style="font-family:${sansFont};font-size:13px;color:${C.muted};padding-top:6px">Resistencia</td>
                      <td style="text-align:right;font-family:${sansFont};font-size:15px;font-weight:700;color:${C.down};padding-top:6px;font-variant-numeric:tabular-nums">${resistance ?? "—"}</td>
                    </tr>
                  </table>
                </td></tr>
              </table>` : ""}

            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
          <tr><td style="padding:20px 44px;text-align:center;font-family:${sansFont};font-size:11px;letter-spacing:1px;color:${C.faint};line-height:1.7">
            RISKON.LAT · PREMARKET DIARIO<br>
            <a href="https://riskon.lat" style="color:${C.muted};text-decoration:none">riskon.lat</a>
          </td></tr>
        </table>

      </td>
    </tr>
  </table>
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
