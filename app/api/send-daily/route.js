import { Resend } from "resend";
import { getAllPostsMeta } from "../../../lib/posts";
import { fetchLiveData, generateDailyView, buildMarkdown, publishToGitHub } from "../../../lib/dailyView";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lista temporal (mientras se conecta la lectura del Google Sheet vía doGet).
const SUBSCRIBERS = [
  "mauriciomn2002@gmail.com",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
  "suscriptor-purgado@riskon.lat",
];
const SITE = "https://riskon.lat";
const CALENDLY = "https://calendly.com/mauriciomercenariofx/30min";
const UNSUB = "__UNSUB_URL__"; // placeholder reemplazado por destinatario

// 9 activos clave para la tabla del premarket.
const TICKERS = [
  { name: "S&P 500 Fut.",    symbol: "ES=F",     kind: "index" },
  { name: "Nasdaq 100 Fut.", symbol: "NQ=F",     kind: "index" },
  { name: "Dow Jones Fut.",  symbol: "YM=F",     kind: "index" },
  { name: "VIX",             symbol: "^VIX",     kind: "decimal" },
  { name: "DXY (Dólar)",     symbol: "DX-Y.NYB", kind: "decimal" },
  { name: "T-Note 10Y",      symbol: "^TNX",     kind: "yield" },
  { name: "Oro",             symbol: "GC=F",     kind: "index" },
  { name: "Petróleo WTI",    symbol: "CL=F",     kind: "decimal" },
  { name: "Bitcoin",         symbol: "BTC-USD",  kind: "index" },
];

const RISK_STATES = [
  { label: "RISK-OFF",     color: "#3A5A8F", min: 0,  max: 25  },
  { label: "DEFENSIVE",    color: "#B8860B", min: 26, max: 50  },
  { label: "CONSTRUCTIVE", color: "#2A8576", min: 51, max: 75  },
  { label: "RISK-ON",      color: "#00A37F", min: 76, max: 100 },
];

const C = {
  bg: "#FAF8F3", card: "#FFFFFF", border: "#E8E3D9", masthead: "#14141A",
  text: "#1A1A1A", muted: "#6B6B6B", faint: "#9A9488", bone: "#F5F1E8",
  up: "#0A7D3C", down: "#C0392B",
};

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function riskStateFromScore(score) {
  return RISK_STATES.find((s) => score >= s.min && score <= s.max) ?? RISK_STATES[2];
}

const clean = (e) => String(e).trim().toLowerCase();

// Lista final de destinatarios = (los 12 de respaldo ∪ activos del Sheet) − bajas del Sheet.
// El Sheet (SHEETS_LIST_URL, doGet con token) es la fuente para altas/bajas nuevas;
// la lista fija SUBSCRIBERS es un piso de seguridad para que nadie se pierda si el
// Sheet falla o aún no tiene a los 12 sembrados. El doGet puede devolver:
//   - un arreglo de correos activos (compat), o
//   - { active: [...], unsub: [...] } para poder dar de baja también a los del piso.
async function getSubscribers() {
  const base = new Set(SUBSCRIBERS.map(clean));
  const url = process.env.SHEETS_LIST_URL;
  if (url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const active = Array.isArray(data) ? data : (data?.active ?? []);
        const unsub  = Array.isArray(data) ? []   : (data?.unsub  ?? []);
        active.map(clean).filter(Boolean).forEach((e) => base.add(e));
        unsub.map(clean).filter(Boolean).forEach((e) => base.delete(e));
      }
    } catch {}
  }
  return [...base];
}

async function yahooChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const result = (await res.json())?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta ?? {};
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter((c) => c != null && !isNaN(c));
    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;
    let chgPct = null;
    if (closes.length >= 2 && closes[closes.length - 2]) {
      chgPct = ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100;
    }
    return { price, chgPct };
  } catch {
    return null;
  }
}

const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
function fmtPrice(v, kind) {
  if (v == null) return "—";
  if (kind === "yield") return `${v.toFixed(2)}%`;
  if (kind === "decimal") return v.toFixed(2);
  return v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 });
}

async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }); // YYYY-MM-DD
  const dateLong = new Date().toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Mexico_City",
  });
  const dateShort = new Date().toLocaleDateString("es-MX", {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City",
  });

  const reqUrl = new URL(request.url);
  const only   = reqUrl.searchParams.get("only");    // ?only=a@x.com,b@y.com (subconjunto)
  const force  = reqUrl.searchParams.get("force");   // ?force=1 ignora la guarda
  const resend = reqUrl.searchParams.get("resend");  // ?resend=1 re-envía el view YA publicado (sin regenerar)

  // ── Idempotencia: si el view de hoy ya se publicó, no re-generar/enviar. Permite
  // tener el disparador externo (puntual 7:00) + el cron de Vercel (respaldo tardío)
  // sin que el correo salga dos veces. ?only, ?force y ?resend la saltan.
  if (!only && !force && !resend) {
    const exists = await fetch(
      `https://raw.githubusercontent.com/maumercenariofx/Risk-On/main/content/${slug}.md`,
      { cache: "no-store" }
    ).then((r) => r.ok).catch(() => false);
    if (exists) {
      return Response.json({ ok: true, skipped: "already published today", slug });
    }
  }

  // ── 1. Obtener el view: re-enviar el publicado, o generar uno nuevo ──────────
  let post = null;
  const steps = { generated: false, published: false };
  if (resend) {
    const posts = getAllPostsMeta();
    post = posts.find((p) => String(p.date).slice(0, 10) === slug) ?? posts[0] ?? null;
  } else {
    try {
      const data = await fetchLiveData(SITE);
      const view = await generateDailyView(data, dateLong);
      const md = buildMarkdown(view, slug);
      const pub = await publishToGitHub(slug, md);
      steps.generated = true;
      steps.published = pub.ok;
      if (!pub.ok) steps.publishError = pub.error;
      post = { slug, ...view };
    } catch (e) {
      steps.genError = String(e?.message ?? e);
    }
  }

  // Fallback: si la generación falló, usa el último view existente.
  if (!post) {
    const posts = getAllPostsMeta();
    if (!posts.length) return Response.json({ error: "no view available", steps }, { status: 500 });
    post = posts.find((p) => String(p.date).slice(0, 10) === slug) ?? posts[0];
  }

  const { title_es, summary_es, watch_es = [], support, resistance, score = 70 } = post;
  const { label: riskState, color } = riskStateFromScore(score);
  const articleUrl = `${SITE}/archive/${post.slug}`;

  // ── 2. Datos para la tabla (v8 chart, confiable desde servidor) ─────────────
  const charts = await Promise.all(TICKERS.map((t) => yahooChart(t.symbol)));
  const market = TICKERS.map((t, i) => ({ ...t, ...(charts[i] ?? {}) }));

  // ── 3. Construir el correo ──────────────────────────────────────────────────
  const sans = "'Helvetica Neue',Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";

  const tableRows = market.map((d, i) => {
    const bb = i === market.length - 1 ? "" : `border-bottom:1px solid ${C.border};`;
    const pc = d.chgPct == null ? C.faint : d.chgPct >= 0 ? C.up : C.down;
    return `<tr>
      <td style="padding:11px 0;${bb}color:${C.text};font-family:${sans};font-size:14px">${d.name}</td>
      <td style="padding:11px 0;${bb}text-align:right;color:${C.text};font-family:${sans};font-size:14px;font-weight:600;font-variant-numeric:tabular-nums">${fmtPrice(d.price, d.kind)}</td>
      <td style="padding:11px 0;${bb}text-align:right;color:${pc};font-family:${sans};font-size:14px;font-variant-numeric:tabular-nums">${fmtPct(d.chgPct)}</td>
    </tr>`;
  }).join("");

  const watchRows = watch_es.map((item) => `
    <tr>
      <td style="padding:0;vertical-align:top;width:18px"><div style="width:6px;height:6px;border-radius:50%;background:${color};margin-top:8px"></div></td>
      <td style="padding:0 0 14px 0;font-family:${sans};font-size:14px;color:#3a3a3a;line-height:1.65">${item}</td>
    </tr>`).join("");

  const navLink = (href, label) =>
    `<a href="${href}" style="font-family:${sans};font-size:13px;color:${C.text};text-decoration:none;font-weight:600">${label}</a>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">◇ ${riskState} · ${score}/100 — ${title_es}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
    <tr><td align="center" style="padding:28px 16px">

      <!-- Masthead -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-bottom:none;border-radius:4px 4px 0 0">
        <tr><td align="center" style="padding:34px 44px 22px 44px">
          <img src="${SITE}/riskon-logo.png" width="148" alt="Risk On" style="display:block;width:148px;max-width:55%;height:auto;margin:0 auto" />
          <div style="font-family:${sans};font-size:10px;letter-spacing:3px;color:${C.faint};text-transform:uppercase;margin-top:14px">Daily views by Mauricio Mercenario</div>
        </td></tr>
      </table>

      <!-- Card -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 4px 4px">
        <tr><td style="padding:36px 44px 40px 44px">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;text-transform:uppercase">El Pre-Market</td>
              <td style="text-align:right;font-family:${sans};font-size:12px;color:${C.muted};text-transform:capitalize">${dateLong}</td>
            </tr>
          </table>
          <div style="border-bottom:2px solid ${C.text};margin:12px 0 26px 0"></div>

          <!-- Score gauge -->
          <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:10px">RISK ON SCORE</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:7px"><tr>
            <td style="background:#ECE8DF;border-radius:7px;padding:0;font-size:0;line-height:0">
              <table role="presentation" width="${score}%" cellpadding="0" cellspacing="0"><tr>
                <td style="background:${color};border-radius:7px;height:14px;font-size:0;line-height:0">&nbsp;</td>
              </tr></table>
            </td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
            <td style="font-family:${sans};font-size:10px;color:${C.faint};letter-spacing:0.5px">0 · risk-off</td>
            <td style="text-align:center;white-space:nowrap"><span style="font-family:${sans};font-size:22px;font-weight:700;color:${color}">${score}</span> <span style="font-family:${sans};font-size:12px;font-weight:700;color:${color};letter-spacing:1px">◇ ${riskState}</span></td>
            <td style="text-align:right;font-family:${sans};font-size:10px;color:${C.faint};letter-spacing:0.5px">risk-on · 100</td>
          </tr></table>

          <!-- Headline + summary -->
          <div style="font-family:${serif};font-size:26px;line-height:1.25;color:${C.text};font-weight:700;margin-bottom:18px">${title_es}</div>
          <div style="font-family:${sans};font-size:15px;line-height:1.7;color:#3a3a3a;margin-bottom:26px">${summary_es}</div>

          <!-- Article CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:34px">
            <tr><td style="background:${C.text};border-radius:4px">
              <a href="${articleUrl}" style="display:inline-block;padding:13px 26px;font-family:${sans};font-size:14px;font-weight:600;color:${C.bone};text-decoration:none">Leer el view completo →</a>
            </td></tr>
          </table>

          <!-- Market data -->
          <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:6px">DATOS DE MERCADO</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.text};margin-bottom:34px">${tableRows}</table>

          ${watch_es.length ? `
          <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:14px">A VIGILAR</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:34px">${watchRows}</table>` : ""}

          ${support || resistance ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};border-radius:4px;margin-bottom:36px">
            <tr><td style="padding:18px 22px">
              <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:12px">USD/MXN · NIVELES</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="font-family:${sans};font-size:13px;color:${C.muted}">Soporte</td><td style="text-align:right;font-family:${sans};font-size:15px;font-weight:700;color:${C.up};font-variant-numeric:tabular-nums">${support ?? "—"}</td></tr>
                <tr><td style="font-family:${sans};font-size:13px;color:${C.muted};padding-top:6px">Resistencia</td><td style="text-align:right;font-family:${sans};font-size:15px;font-weight:700;color:${C.down};padding-top:6px;font-variant-numeric:tabular-nums">${resistance ?? "—"}</td></tr>
              </table>
            </td></tr>
          </table>` : ""}

          <!-- Nav -->
          <div style="border-top:1px solid ${C.border};padding-top:24px;text-align:center">
            <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:14px">EXPLORA</div>
            <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
              <td style="padding:0 14px">${navLink(SITE + "/markets", "Mercados")}</td>
              <td style="color:${C.border}">|</td>
              <td style="padding:0 14px">${navLink(SITE + "/learn", "Aprende")}</td>
              <td style="color:${C.border}">|</td>
              <td style="padding:0 14px">${navLink(CALENDLY, "Agenda asesoría")}</td>
            </tr></table>
            <div style="margin-top:18px">
              <a href="${CALENDLY}" style="display:inline-block;padding:11px 22px;border:1.5px solid ${C.text};border-radius:4px;font-family:${sans};font-size:13px;font-weight:600;color:${C.text};text-decoration:none">📅 Agenda una asesoría 1:1</a>
            </div>
          </div>

        </td></tr>
      </table>

      <!-- Footer -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="padding:20px 44px;text-align:center;font-family:${sans};font-size:11px;letter-spacing:1px;color:${C.faint};line-height:1.7">
          RISKON.LAT · PREMARKET DIARIO<br>
          <a href="${SITE}" style="color:${C.muted};text-decoration:none">riskon.lat</a>
          &nbsp;·&nbsp;
          <a href="${UNSUB}" style="color:${C.faint};text-decoration:underline">Darse de baja</a>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;

  // Versión texto plano (deliverability + accesibilidad)
  const text = [
    `EL PRE-MARKET · ${dateLong}`,
    `Risk On score ${score}/100 · ${riskState}`,
    "",
    title_es,
    "",
    summary_es,
    "",
    `Leer el view completo: ${articleUrl}`,
    "",
    "DATOS DE MERCADO",
    ...market.map((d) => `  ${d.name}: ${fmtPrice(d.price, d.kind)} (${fmtPct(d.chgPct)})`),
    "",
    ...(watch_es.length ? ["A VIGILAR", ...watch_es.map((w) => `  - ${w}`), ""] : []),
    `USD/MXN — Soporte ${support ?? "—"} / Resistencia ${resistance ?? "—"}`,
    "",
    `Mercados: ${SITE}/markets`,
    `Aprende: ${SITE}/learn`,
    `Agenda una asesoría: ${CALENDLY}`,
    "",
    `Darse de baja: ${UNSUB}`,
    "riskon.lat",
  ].join("\n");

  // ── 4. Enviar (batch: 1 request para todos → sin rate-limit ni timeout) ──────
  const recipients = only
    ? only.split(",").map((s) => s.trim()).filter(Boolean)
    : await getSubscribers();

  const from = '"Análisis FX · Mauricio Mercenario | Riskon" <view@riskon.lat>';
  const subject = `El Pre-Market · ${riskState} ${score} · ${dateShort}`;
  const payloads = recipients.map((email) => {
    const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}`;
    return {
      from, to: email, subject,
      html: html.split(UNSUB).join(unsubUrl),
      text: text.split(UNSUB).join(unsubUrl),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>, <mailto:view@riskon.lat?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  const resendClient = new Resend(process.env.RESEND_API_KEY);
  let sent;
  try {
    // Resend batch: hasta 100 correos por llamada.
    const { data, error } = await resendClient.batch.send(payloads);
    sent = { ok: !error, count: data?.data?.length ?? (error ? 0 : recipients.length), error: error?.message };
  } catch (e) {
    sent = { ok: false, error: String(e?.message ?? e) };
  }

  return Response.json({ ok: true, riskState, score, steps, recipients: recipients.length, sent });
}

export { handler as GET, handler as POST };
