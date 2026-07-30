// app/api/send-recap/route.js
// Envía el RECAP SEMANAL (viernes por la tarde) a la lista completa. El content
// lo genera GitHub Actions (content/recaps/<viernes>.md); aquí solo se lee, se
// arma el correo y se envía — cabe holgado en los 60s de Vercel. Guarda
// anti-doble-envío FAIL-CLOSED con marcador sent/recap-<slug>.json (misma
// mecánica del diario). Pruebas: ?only=correo (no marca), ?slug=YYYY-MM-DD.
import { Resend } from "resend";
import { remark } from "remark";
import html from "remark-html";
import { checkSentMarker, publishFileToGitHub, REPO } from "../../../lib/dailyView";
import { stripBold, boldToHtml } from "../../../lib/mdInline";
import { alertAdmin } from "../../../lib/alertAdmin";
import { clean, personalizeGreeting, getSubscribers } from "../../../lib/subscribers";
import { gatherWeek } from "../../../lib/weeklyRecap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://riskon.lat";
const CALENDLY = "https://calendly.com/mauriciomercenariofx/30min";
const UNSUB = "__UNSUB_URL__";
const GREET_TOKEN = "@@GREETING@@";
const C = {
  bg: "#FAF8F3", card: "#FFFFFF", border: "#E8E3D9", masthead: "#14141A",
  text: "#1A1A1A", muted: "#6B6B6B", faint: "#9A9488", bone: "#F5F1E8",
  up: "#0A7D3C", down: "#C0392B",
};

// Mismas 4 bandas del diario (colores de lib/riskScore vía send-daily).
const RISK_STATES = [
  { label: "RISK-OFF",     color: "#3A5A8F", min: 0,  max: 25  },
  { label: "DEFENSIVE",    color: "#B8860B", min: 26, max: 50  },
  { label: "CONSTRUCTIVE", color: "#2A8576", min: 51, max: 75  },
  { label: "RISK-ON",      color: "#00A37F", min: 76, max: 100 },
];
const bandOf = (score) => RISK_STATES.find((s) => score >= s.min && score <= s.max) ?? RISK_STATES[2];

// Lee el recap: fs (mismo deploy) → contents API con token → raw (último).
async function readRecap(slug) {
  try {
    const fs = await import("node:fs");
    const p = `${process.cwd()}/content/recaps/${slug}.md`;
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  } catch {}
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/contents/content/recaps/${slug}.md?ref=main`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "User-Agent": "riskon-daily-cron" },
          cache: "no-store",
        }
      );
      if (res.ok) return await res.text();
    } catch {}
  }
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/content/recaps/${slug}.md`, { cache: "no-store" });
    if (res.ok) return await res.text();
  } catch {}
  return null;
}

async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const only = url.searchParams.get("only");
  const slug = url.searchParams.get("slug")
    ?? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  const markerSlug = `recap-${slug}`;

  // Guarda fail-closed (idéntica al diario): solo un 404 explícito autoriza.
  if (!only) {
    const marker = await checkSentMarker(markerSlug);
    if (marker.status === "sent") {
      return Response.json({ ok: true, skipped: "recap already sent", slug, marker });
    }
    if (marker.status === "unknown") {
      await alertAdmin(`guarda del recap no verificable (${slug})`, { slug, marker });
      return Response.json({ ok: false, skipped: "marker unverifiable", slug, marker }, { status: 503 });
    }
  }

  const raw = await readRecap(slug);
  if (!raw) {
    if (!only) await alertAdmin(`recap ${slug} no encontrado al enviar`, { slug });
    return Response.json({ ok: false, error: `content/recaps/${slug}.md no existe` }, { status: 503 });
  }
  const matter = (await import("gray-matter")).default;
  const { data: front, content: bodyEs } = matter(raw);

  // Material estructurado de la semana (best-effort): tabla Lun-Vie, FX
  // semanal, posturas resueltas y agenda de la próxima semana. Si falla,
  // el recap sale como antes (solo el artículo).
  let wk = null;
  try { wk = await gatherWeek(slug); } catch {}

  // Destinatarios (misma lógica del diario, con ?only= para pruebas). Si el
  // Sheet no responde tras los reintentos, alerta y sale con el piso de respaldo.
  let recipients = await getSubscribers({
    onDegraded: (err) =>
      alertAdmin(`Sheet de suscriptores inalcanzable (recap ${slug}) — envío degradado al piso de respaldo`, { slug, err }),
  });
  if (only) {
    const wanted = only.split(",").map((s) => clean(s)).filter(Boolean);
    recipients = wanted.map((e) => recipients.find((s) => s.email === e) ?? { email: e });
  }
  if (!recipients.length) return Response.json({ ok: false, error: "sin destinatarios" }, { status: 500 });

  const anyEn = recipients.some((s) => s.lang === "en");
  const toHtml = async (md) => (await remark().use(html).process(md)).toString();

  const buildEmail = async (lang) => {
    const en = lang === "en";
    const pick = (esV, enV) => (en && String(enV ?? "").trim() ? enV : esV);
    const title = stripBold(pick(front.title_es, front.title_en));
    const body = pick(bodyEs, front.body_en);
    const bodyHtml = (await toHtml(body))
      .replace(/<h3>/g, `<h3 class="em-text" style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:${C.text};margin:26px 0 10px">`)
      .replace(/<p>/g, `<p class="em-body" style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a3a3a;margin:0 0 14px">`)
      .replace(/<li>/g, `<li class="em-body" style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.65;color:#3a3a3a;margin-bottom:8px">`);
    const dateLongL = new Date(`${slug}T12:00:00Z`).toLocaleDateString(en ? "en-US" : "es-MX", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
    const L = en
      ? { tag: "WEEKLY RECAP", cta: "See the public scoreboard →", unsub: "Unsubscribe",
          greeting: "Happy Friday!", week: "THE WEEK, DAY BY DAY", fxWeek: "USD/MXN · THE WEEK",
          open: "Monday close", close: "Friday close", range: "Weekly range", scoreArc: "Score",
          posturas: "LATEST STANCES RESOLVED", val: "VALIDATED", inval: "MISSED",
          recordOf: "stances validated", nextWeek: "NEXT WEEK (HIGH IMPACT)",
          explore: "EXPLORE", markets: "Markets", learn: "Learn",
          advisory: "Book advisory", advisoryCta: "📅 Book a 1-on-1 advisory",
          footerTag: "WEEKLY RECAP" }
      : { tag: "RECAP SEMANAL", cta: "Ver el marcador público →", unsub: "Darse de baja",
          greeting: "¡Feliz viernes!", week: "LA SEMANA, DÍA A DÍA", fxWeek: "USD/MXN · LA SEMANA",
          open: "Cierre del lunes", close: "Cierre del viernes", range: "Rango semanal", scoreArc: "Score",
          posturas: "ÚLTIMAS POSTURAS RESUELTAS", val: "VALIDADA", inval: "FALLÓ",
          recordOf: "posturas validadas", nextWeek: "PRÓXIMA SEMANA (ALTO IMPACTO)",
          explore: "EXPLORA", markets: "Mercados", learn: "Aprende",
          advisory: "Agenda asesoría", advisoryCta: "📅 Agenda una asesoría 1:1",
          footerTag: "RECAP SEMANAL" };
    const sans = "'Helvetica Neue',Arial,sans-serif";
    const serif = "Georgia,'Times New Roman',serif";
    const locale = en ? "en-US" : "es-MX";
    const dayName = (s) => new Date(`${s}T12:00:00Z`)
      .toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }).replace(".", "");
    const shortDate = (s) => new Date(`${s}T12:00:00Z`)
      .toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

    // ── La semana en filas: día · score coloreado · titular linkeado ──────────
    const weekRows = (wk?.week ?? []).map((v, i, arr) => {
      const b = bandOf(v.score);
      const bb = i === arr.length - 1 ? "" : `border-bottom:1px solid ${C.border};`;
      const t = stripBold(v.title_es); // gatherWeek solo trae el titular ES
      const tShort = t.length > 72 ? `${t.slice(0, 69)}…` : t;
      return `<tr>
        <td class="em-muted em-border" style="padding:10px 0;${bb}width:44px;vertical-align:top;font-family:${sans};font-size:12px;color:${C.muted};text-transform:capitalize">${dayName(v.slug)}</td>
        <td class="em-border" style="padding:10px 8px 10px 0;${bb}width:34px;vertical-align:top;text-align:center"><span style="display:inline-block;min-width:26px;padding:3px 5px;border-radius:3px;background:${b.color};color:#FFFFFF;font-family:${sans};font-size:12px;font-weight:700">${v.score}</span></td>
        <td class="em-border" style="padding:10px 0;${bb}font-family:${sans};font-size:13px;line-height:1.45"><a href="${SITE}/archive/${v.slug}" class="em-body" style="color:#3a3a3a;text-decoration:none">${tShort}</a></td>
      </tr>`;
    }).join("");
    const weekHtml = weekRows ? `
        <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin:28px 0 8px">${L.week}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-rule" style="border-top:1px solid ${C.text};margin-bottom:6px">${weekRows}</table>` : "";

    // ── USD/MXN de la semana: centavos, rango, arco del score ─────────────────
    let fxHtml = "";
    if (wk?.fx?.path?.length) {
      const { open, close, path } = wk.fx;
      const cents = (close - open) * 100;
      const centsTxt = `${cents >= 0 ? "+" : "−"}${Math.abs(cents).toFixed(0)}¢`;
      const centsCol = cents >= 0 ? C.down : C.up; // sube USD/MXN = peso pierde
      const centsCls = cents >= 0 ? "em-down" : "em-up";
      // Rango real de la semana (highs/lows de las velas); fallback a cierres.
      const hi = wk.fx.hi ?? Math.max(...path.map((p) => p.c));
      const lo = wk.fx.lo ?? Math.min(...path.map((p) => p.c));
      const s0 = wk.week?.[0]?.score, s1 = wk.week?.[wk.week.length - 1]?.score;
      const row = (k, vHtml, last) => `<tr><td class="em-muted" style="font-family:${sans};font-size:13px;color:${C.muted};padding:${last ? "6px 0 0" : "0 0 6px"}">${k}</td><td style="text-align:right;font-family:${sans};font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;padding:${last ? "6px 0 0" : "0 0 6px"}">${vHtml}</td></tr>`;
      fxHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-soft" style="background:${C.bg};border-radius:4px;margin:24px 0 4px">
          <tr><td style="padding:18px 22px">
            <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:12px">${L.fxWeek}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${row(L.open, `<span class="em-text" style="color:${C.text}">${open.toFixed(4)}</span>`)}
              ${row(L.close, `<span class="em-text" style="color:${C.text}">${close.toFixed(4)}</span> <span class="${centsCls}" style="color:${centsCol}">(${centsTxt})</span>`)}
              ${row(L.range, `<span class="em-text" style="color:${C.text}">${lo.toFixed(4)} – ${hi.toFixed(4)}</span>`)}
              ${Number.isFinite(s0) && Number.isFinite(s1) ? row(L.scoreArc, `<span style="color:${bandOf(s0).color}">${s0}</span> <span class="em-faint" style="color:${C.faint}">→</span> <span style="color:${bandOf(s1).color}">${s1} ${bandOf(s1).label}</span>`, true) : ""}
            </table>
          </td></tr>
        </table>`;
    }

    // ── Posturas resueltas (las 3 más recientes) + marcador global ────────────
    let posturasHtml = "";
    // Las 3 resueltas MÁS RECIENTES (record.rows viene ascendente — el
    // resueltas de gatherWeek toma slice(0,5) del lado viejo, no sirve aquí).
    const resueltas = (wk?.record?.rows ?? [])
      .filter((r) => r.verdict != null)
      .sort((a, b) => String(b.slug).localeCompare(String(a.slug)))
      .slice(0, 3);
    if (resueltas.length) {
      const rows = resueltas.map((r) => `
        <tr>
          <td class="em-muted" style="padding:0 0 7px;width:78px;font-family:${sans};font-size:12px;color:${C.muted}">${shortDate(r.slug)}</td>
          <td class="em-text" style="padding:0 0 7px;font-family:${sans};font-size:13px;color:${C.text};font-weight:600">${r.bias}</td>
          <td style="padding:0 0 7px;text-align:right;font-family:${sans};font-size:12.5px;font-weight:700;color:${r.verdict ? C.up : C.down}" class="${r.verdict ? "em-up" : "em-down"}">${r.verdict ? "✓ " + L.val : "✗ " + L.inval}${r.mxn5 != null ? ` <span class="em-muted" style="color:${C.muted};font-weight:400">(USD/MXN ${r.mxn5 >= 0 ? "+" : ""}${r.mxn5.toFixed(2)}% 5d)</span>` : ""}</td>
        </tr>`).join("");
      const rec = wk?.record;
      posturasHtml = `
        <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin:26px 0 10px">🎯 ${L.posturas}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        ${rec?.resolved ? `<div class="em-muted" style="font-family:${sans};font-size:12px;color:${C.muted};margin-top:4px"><strong class="em-text" style="color:${C.text}">${rec.hits}/${rec.resolved}</strong> ${L.recordOf} · <a href="${SITE}/indice" class="em-muted" style="color:${C.muted};text-decoration:underline">${L.cta.toLowerCase()}</a></div>` : ""}`;
    }

    // ── Agenda de la próxima semana ───────────────────────────────────────────
    const nextEvents = (wk?.calendar ?? []).slice(0, 5);
    const nextHtml = nextEvents.length ? `
        <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin:26px 0 10px">📅 ${L.nextWeek}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${nextEvents.map((e) => `<tr>
            <td class="em-text" style="padding:0 0 7px;width:78px;font-family:${sans};font-size:12.5px;font-weight:700;color:${C.text};text-transform:capitalize">${shortDate(e.date)}</td>
            <td class="em-body" style="padding:0 0 7px;font-family:${sans};font-size:13px;color:#3a3a3a">${e.flag ?? ""} ${en ? (e.event_en ?? e.event_es) : e.event_es}${e.time ? ` <span class="em-muted" style="color:${C.muted}">· ${e.time} CDMX</span>` : ""}</td>
          </tr>`).join("")}
        </table>` : "";

    const darkCss = `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .em-bg    { background: #101014 !important; }
      .em-card  { background: #17171C !important; border-color: #26262E !important; }
      .em-soft  { background: #1E1E24 !important; }
      .em-bone  { background: #FFFFFF !important; }
      .em-text  { color: #ECEAE4 !important; }
      .em-body  { color: #C9C5BD !important; }
      .em-muted { color: #A39E96 !important; }
      .em-faint { color: #7E7970 !important; }
      .em-border{ border-color: #26262E !important; }
      .em-rule  { border-color: #ECEAE4 !important; }
      .em-up    { color: #2FB89A !important; }
      .em-down  { color: #E4735F !important; }
      .em-btn     { background: #ECEAE4 !important; }
      .em-btn-txt { color: #17171C !important; }
      .em-outline { border-color: #ECEAE4 !important; color: #ECEAE4 !important; }
    }`;

    const navLink = (href, label) =>
      `<a href="${href}" class="em-text" style="font-family:${sans};font-size:13px;color:${C.text};text-decoration:none;font-weight:600">${label}</a>`;

    const htmlDoc = `<!doctype html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${darkCss}</style></head>
<body class="em-bg" style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${title}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" style="background:${C.bg}"><tr><td align="center" style="padding:28px 16px">

    <!-- Masthead (mismo look que el diario; claro también en dark: el logo es tinta) -->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="em-bone em-border" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-bottom:none;border-radius:4px 4px 0 0">
      <tr><td align="center" style="padding:34px 44px 22px 44px">
        <img src="${SITE}/riskon-logo.png" width="148" alt="Risk On" style="display:block;width:148px;max-width:55%;height:auto;margin:0 auto" />
        <div style="font-family:${sans};font-size:10px;letter-spacing:3px;color:${C.faint};text-transform:uppercase;margin-top:14px">${L.tag} · ${dateLongL}</div>
      </td></tr>
    </table>

    <!-- Card -->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="em-card" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 4px 4px">
      <tr><td style="padding:36px 44px 40px 44px">

        <div class="em-text" style="font-family:${serif};font-size:16px;font-style:italic;color:${C.text};margin-bottom:22px">${GREET_TOKEN}</div>

        <div class="em-text" style="font-family:${serif};font-size:25px;line-height:1.25;color:${C.text};font-weight:700;margin-bottom:8px">${title}</div>

        ${weekHtml}
        ${fxHtml}
        ${posturasHtml}

        <div class="em-border" style="border-bottom:1px solid ${C.border};margin:26px 0"></div>

        ${bodyHtml}

        ${nextHtml}

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 30px"><tr><td class="em-btn" style="background:${C.text};border-radius:4px">
          <a href="${SITE}/indice" class="em-btn-txt" style="display:inline-block;padding:13px 26px;font-family:${sans};font-size:14px;font-weight:600;color:${C.bone};text-decoration:none">${L.cta}</a>
        </td></tr></table>

        <!-- Nav (idéntico al diario) -->
        <div class="em-border" style="border-top:1px solid ${C.border};padding-top:24px;text-align:center">
          <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:14px">${L.explore}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
            <td style="padding:0 14px">${navLink(SITE + "/markets", L.markets)}</td>
            <td class="em-faint" style="color:${C.border}">|</td>
            <td style="padding:0 14px">${navLink(SITE + "/learn", L.learn)}</td>
            <td class="em-faint" style="color:${C.border}">|</td>
            <td style="padding:0 14px">${navLink(CALENDLY, L.advisory)}</td>
          </tr></table>
          <div style="margin-top:18px">
            <a href="${CALENDLY}" class="em-outline" style="display:inline-block;padding:11px 22px;border:1.5px solid ${C.text};border-radius:4px;font-family:${sans};font-size:13px;font-weight:600;color:${C.text};text-decoration:none">${L.advisoryCta}</a>
          </div>
        </div>

      </td></tr>
    </table>

    <!-- Footer -->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td class="em-faint" style="padding:20px 44px;text-align:center;font-family:${sans};font-size:11px;letter-spacing:1px;color:${C.faint};line-height:1.7">
        RISKON.LAT · ${L.footerTag}<br>
        <a href="${SITE}" class="em-muted" style="color:${C.muted};text-decoration:none">riskon.lat</a>
        &nbsp;·&nbsp;
        <a href="${UNSUB}" class="em-faint" style="color:${C.faint};text-decoration:underline">${L.unsub}</a>
      </td></tr>
    </table>

  </td></tr></table>
</body></html>`;

    const cents = wk?.fx ? (wk.fx.close - wk.fx.open) * 100 : null;
    const text = [
      `RISK ON · ${L.tag} · ${dateLongL}`, "",
      GREET_TOKEN, "",
      title, "",
      ...(wk?.week?.length ? [
        L.week,
        ...wk.week.map((v) => `  ${dayName(v.slug)} · ${v.score} ${bandOf(v.score).label} · ${stripBold(v.title_es)}`),
        "",
      ] : []),
      ...(wk?.fx ? [`${L.fxWeek}: ${wk.fx.open.toFixed(4)} → ${wk.fx.close.toFixed(4)} (${cents >= 0 ? "+" : "−"}${Math.abs(cents).toFixed(0)}¢)`, ""] : []),
      stripBold(body).replace(/^###\s*/gm, "— "), "",
      ...(nextEvents.length ? [L.nextWeek, ...nextEvents.map((e) => `  ${shortDate(e.date)} · ${e.event_es}`), ""] : []),
      `${L.cta.replace(" →", "")}: ${SITE}/indice`, "", `${L.unsub}: ${UNSUB}`,
    ].join("\n");

    const hook = stripBold(pick(front.hook_es, front.hook_en) ?? title).slice(0, 60);
    return { html: htmlDoc, text, subject: `Recap semanal · ${hook}`, greeting: L.greeting };
  };

  const vEs = await buildEmail("es");
  const vEn = anyEn ? await buildEmail("en") : null;

  // ?html=1 (solo con ?only=): devuelve el HTML sin enviar — QA visual.
  if (only && url.searchParams.get("html")) {
    const rendered = vEs.html
      .split(UNSUB).join(`${SITE}/api/unsubscribe?email=test`)
      .split(GREET_TOKEN).join(personalizeGreeting(vEs.greeting, recipients[0] ?? {}) ?? vEs.greeting);
    return new Response(rendered, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const from = '"Mauricio | Risk-On" <view@riskon.lat>';
  const payloads = recipients.map((sub) => {
    const v = sub.lang === "en" && vEn ? vEn : vEs;
    const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(sub.email)}`;
    const greet = personalizeGreeting(v.greeting, sub) ?? v.greeting;
    return {
      from, to: sub.email, subject: v.subject,
      html: v.html.split(UNSUB).join(unsubUrl).split(GREET_TOKEN).join(greet),
      text: v.text.split(UNSUB).join(unsubUrl).split(GREET_TOKEN).join(greet),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>, <mailto:view@riskon.lat?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  const resendClient = new Resend(process.env.RESEND_API_KEY);
  let sent;
  try {
    const { data, error } = await resendClient.batch.send(payloads);
    sent = { ok: !error, count: data?.data?.length ?? (error ? 0 : recipients.length), error: error?.message };
  } catch (e) {
    sent = { ok: false, error: String(e?.message ?? e) };
  }

  if (sent.ok && !only) {
    const marker = JSON.stringify({ slug: markerSlug, sentAt: new Date().toISOString(), count: recipients.length }) + "\n";
    const mk = await publishFileToGitHub(`sent/${markerSlug}.json`, marker, `auto: sent marker ${markerSlug}`);
    sent.marker = mk.ok ? "ok" : mk.error;
  }
  if (!only && !sent.ok) await alertAdmin(`envío del RECAP falló (${slug})`, { slug, sent });

  return Response.json({ ok: sent.ok, slug, recipients: recipients.length, sent });
}

export { handler as GET, handler as POST };
