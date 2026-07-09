import { Resend } from "resend";
import { getAllPostsMeta } from "../../../lib/posts";
import { fetchLiveData, generateDailyView, buildMarkdown, publishToGitHub, publishFileToGitHub, REPO } from "../../../lib/dailyView";
import { alertAdmin } from "../../../lib/alertAdmin";

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
  { name: "DXY (Dólar)",     name_en: "DXY (Dollar)", symbol: "DX-Y.NYB", kind: "decimal" },
  { name: "T-Note 10Y",      symbol: "^TNX",     kind: "yield" },
  { name: "Oro",             name_en: "Gold",    symbol: "GC=F",     kind: "index" },
  { name: "Petróleo WTI",    name_en: "WTI Crude", symbol: "CL=F",   kind: "decimal" },
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

// Limpia un campo de nombre/trato que viene del formulario (anti-XSS en el HTML
// del correo + recorte de longitud). Devuelve "" si no hay nada útil.
const cleanName = (s) =>
  String(s ?? "").replace(/[<>&"'`]/g, "").trim().slice(0, 60);

// Token reemplazable: el saludo se renderiza una vez en la plantilla y se
// personaliza por destinatario en el loop de envío (igual que UNSUB).
const GREET_TOKEN = "@@GREETING@@";

// Cómo nombrar al suscriptor en el saludo. Con trato (Sr./Sra.) usa el apellido
// (o el nombre si no dio apellidos) → "Sr. González"; si solo dio nombre, usa el
// nombre de pila → "Mauricio". Sin datos, "" → saludo genérico.
function saludoNombre(sub) {
  const trato     = cleanName(sub?.trato);
  const nombre    = cleanName(sub?.nombre);
  const apellidos = cleanName(sub?.apellidos);
  if (trato && apellidos) return `${trato} ${apellidos}`;
  if (trato && nombre)    return `${trato} ${nombre}`;
  return nombre;
}

// Inserta el nombre dentro del saludo base: "¡Buenos días!" → "¡Buenos días, Mauricio!".
// .replace con string reemplaza solo la PRIMERA "!", así respeta sufijos (feriados, etc.).
function personalizeGreeting(greeting, sub) {
  const name = saludoNombre(sub);
  if (!name || !greeting) return greeting;
  return greeting.includes("!") ? greeting.replace("!", `, ${name}!`) : `${greeting} ${name}`;
}

// Lista final de destinatarios = (los 12 de respaldo ∪ activos del Sheet) − bajas del Sheet.
// El Sheet (SHEETS_LIST_URL, doGet con token) es la fuente para altas/bajas nuevas;
// la lista fija SUBSCRIBERS es un piso de seguridad para que nadie se pierda si el
// Sheet falla o aún no tiene a los 12 sembrados. El doGet puede devolver:
//   - un arreglo de correos activos (compat), o
//   - { active: [...], unsub: [...] } para poder dar de baja también a los del piso.
// Diagnóstico: golpea SHEETS_LIST_URL y reporta exactamente qué responde,
// para distinguir entre doGet ausente, token equivocado, o parseo OK.
async function probeSheet() {
  const url = process.env.SHEETS_LIST_URL;
  if (!url) return { configured: false };
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    const text = await res.text();
    let parsed = null, activeCount = null, unsubCount = null, parseError = null;
    try {
      parsed = JSON.parse(text);
      const active = Array.isArray(parsed) ? parsed : (parsed?.active ?? []);
      const unsub  = Array.isArray(parsed) ? []     : (parsed?.unsub  ?? []);
      activeCount = Array.isArray(active) ? active.length : null;
      unsubCount  = Array.isArray(unsub)  ? unsub.length  : null;
    } catch (e) {
      parseError = String(e?.message ?? e);
    }
    return {
      configured: true,
      httpStatus: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      bodySnippet: text.slice(0, 400),
      activeCount,
      unsubCount,
      parseError,
    };
  } catch (e) {
    return { configured: true, fetchError: String(e?.message ?? e) };
  }
}

// Devuelve [{ email, nombre, apellidos, trato }]. El Sheet puede mandar `active`
// como arreglo de correos (compat) o de objetos { email, nombre, apellidos, trato }
// (cuando el suscriptor llenó los campos opcionales del formulario). Los nombres
// solo viven en el Sheet; la lista fija de respaldo va sin nombre (saludo genérico).
async function getSubscribers() {
  const map = new Map(); // email → { email, nombre, apellidos, trato }
  SUBSCRIBERS.map(clean).forEach((e) => map.set(e, { email: e }));
  const url = process.env.SHEETS_LIST_URL;
  if (url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const active = Array.isArray(data) ? data : (data?.active ?? []);
        const unsub  = Array.isArray(data) ? []   : (data?.unsub  ?? []);
        active.forEach((item) => {
          const email = clean(typeof item === "string" ? item : item?.email);
          if (!email) return;
          map.set(email, {
            email,
            nombre:    typeof item === "object" ? cleanName(item?.nombre)    : "",
            apellidos: typeof item === "object" ? cleanName(item?.apellidos) : "",
            trato:     typeof item === "object" ? cleanName(item?.trato)     : "",
            // Idioma del correo diario. Solo "en" cambia algo; cualquier otra
            // cosa (columna vacía, filas viejas) cae a español.
            lang:      typeof item === "object" && item?.lang === "en" ? "en" : "es",
          });
        });
        unsub.map((e) => clean(typeof e === "string" ? e : e?.email)).filter(Boolean).forEach((e) => map.delete(e));
      }
    } catch {}
  }
  return [...map.values()];
}

// ¿Ya salió el correo de hoy? Marcador sent/<slug>.json commiteado tras cada
// envío exitoso a la lista completa. Se consulta vía contents API (no el raw
// CDN) porque el raw cachea ~5 min y taparía un doble disparo de cronjob.org.
async function sentMarkerExists(slug) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/sent/${slug}.json?ref=main`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "riskon-daily-cron",
        },
        cache: "no-store",
      }
    );
    return res.ok;
  } catch {
    return false;
  }
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
  const t0 = Date.now(); // presupuesto de la invocación (Vercel Hobby mata a los 60s)
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?list=1 → diagnóstico: devuelve la lista resuelta SIN enviar nada.
  // Incluye sheetProbe: prueba SHEETS_LIST_URL en vivo y reporta el status real
  // (HTTP, cuerpo crudo, conteos parseados) para depurar el doGet del Apps Script.
  if (new URL(request.url).searchParams.get("list")) {
    const recipients = await getSubscribers();
    const sheetProbe = await probeSheet();
    return Response.json({
      ok: true,
      sheetConfigured: Boolean(process.env.SHEETS_LIST_URL),
      sheetProbe,
      count: recipients.length,
      recipients,
    });
  }

  const slug = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }); // YYYY-MM-DD
  const dateLong = new Date().toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Mexico_City",
  });

  const reqUrl  = new URL(request.url);
  const only    = reqUrl.searchParams.get("only");    // ?only=a@x.com,b@y.com (subconjunto)
  const force   = reqUrl.searchParams.get("force");   // ?force=1 ignora la guarda
  const resend  = reqUrl.searchParams.get("resend");  // ?resend=1 re-envía el view YA publicado (sin regenerar)
  const preview = reqUrl.searchParams.get("preview"); // ?preview=1 diagnóstico sin enviar
  // ?draft=1 (SOLO junto con ?only= y ?resend=1): en vez del view publicado lee
  // content/drafts/<slug>-v2.md — para mandarse una prueba de un view alterno
  // sin tocar el histórico ni la lista. drafts/ no aparece en el sitio.
  const draft = reqUrl.searchParams.get("draft") && only ? true : false;
  // ?subject= / ?fromname= (SOLO con ?only=): overrides para probarse en la
  // bandeja variantes de asunto/remitente sin tocar el envío real.
  const subjectOverride  = only ? reqUrl.searchParams.get("subject") : null;
  const fromNameOverride = only
    ? cleanName(reqUrl.searchParams.get("fromname"))
    : "";

  // ── Guard anti-doble-envío: ?resend=1 salta la guarda de content, así que si
  // cronjob.org dispara dos veces mandaría dos veces. El marcador sent/<slug>.json
  // (commiteado tras cada envío exitoso a la lista completa) lo impide.
  // ?force=1 lo salta a propósito; ?only y ?preview no envían a la lista completa.
  if (resend && !force && !only && !preview) {
    if (await sentMarkerExists(slug)) {
      return Response.json({ ok: true, skipped: "already sent today", slug });
    }
  }

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
    // Lee el view de HOY directo de GitHub. Contents API con token (sin el
    // CDN de raw, que cachea ~5 min y puede servir un 404 viejo); raw queda
    // de fallback si la API falla.
    const contentPath = draft ? `content/drafts/${slug}-v2.md` : `content/${slug}.md`;
    try {
      let text = null;
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        const apiRes = await fetch(
          `https://api.github.com/repos/${REPO}/contents/${contentPath}?ref=main`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.raw",
              "User-Agent": "riskon-daily-cron",
            },
            cache: "no-store",
          }
        );
        if (apiRes.ok) text = await apiRes.text();
      }
      if (text == null) {
        const rawRes = await fetch(
          `https://raw.githubusercontent.com/${REPO}/main/${contentPath}`,
          { cache: "no-store" }
        );
        if (rawRes.ok) text = await rawRes.text();
      }
      if (text != null) {
        const matter = (await import("gray-matter")).default;
        const { data } = matter(text);
        post = { slug, ...data };
      }
    } catch {}
    // Un draft ausente NUNCA debe caer a la generación inline: es una prueba,
    // no el envío del día. 404 claro y ya.
    if (draft && !post) {
      return Response.json({ error: `draft no encontrado: ${contentPath}`, slug }, { status: 404 });
    }
    // Si el view de HOY aún NO está publicado (gen-daily falló o va tarde),
    // genéralo AHORA mismo. NUNCA caer a un post viejo.
    if (!post) {
      try {
        const data = await fetchLiveData(SITE);
        const view = await generateDailyView(data, dateLong, slug);
        const md = buildMarkdown(view, slug);
        const pub = await publishToGitHub(slug, md);
        steps.generated = true;
        steps.published = pub.ok;
        if (!pub.ok) steps.publishError = pub.error;
        post = { slug, ...view };

        // ── Presupuesto 60s (Vercel Hobby): si la generación se comió la
        // ventana, NO intentar enviar en esta invocación — el 2026-07-03 la
        // función murió publicando a los ~78s y el correo nunca salió. Se
        // publica, se avisa, y el envío lo hace el siguiente disparo (retry de
        // cronjob.org o el respaldo de Vercel 7:10), que ya encontrará el
        // content listo y entrará por el camino rápido.
        const elapsedS = (Date.now() - t0) / 1000;
        if (elapsedS > 30) {
          await alertAdmin(
            `view generado TARDE (${slug}) — envío diferido al siguiente disparo`,
            { elapsedS: Math.round(elapsedS), steps,
              nota: "gen-daily no publicó a tiempo; send generó el view pero difiere el correo para no morir en el límite de 60s" }
          );
          return Response.json({
            ok: true, slug, steps, deferred: true,
            detail: "view publicado; el correo lo enviará el reintento/respaldo",
          });
        }
      } catch (e) {
        steps.genError = String(e?.message ?? e);
      }
    }
  } else {
    try {
      const data = await fetchLiveData(SITE);
      const view = await generateDailyView(data, dateLong, slug);
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

  // Última red de seguridad: SOLO se envía el view de HOY. Si por lo que sea no
  // se obtuvo (GitHub caído + generación fallida), buscar el de hoy en el build;
  // si tampoco está, ABORTAR el envío. Jamás mandar el view de otro día.
  if (!post || String(post.slug ?? post.date).slice(0, 10) !== slug) {
    const posts = getAllPostsMeta();
    post = posts.find((p) => String(p.date).slice(0, 10) === slug) ?? null;
  }
  if (!post) {
    await alertAdmin(`envío diario ABORTADO — no hay view de hoy (${slug})`, {
      slug, steps,
      accion: "Revisar gen-daily y reintentar: curl -X POST https://riskon.lat/api/send-daily?resend=1 con el Bearer",
    });
    return Response.json(
      { error: "no se pudo obtener el view de HOY; envío abortado para no mandar uno viejo", slug, steps },
      { status: 503 }
    );
  }

  const { support, resistance, score = 70 } = post;
  const { label: riskState, color } = riskStateFromScore(score);
  const articleUrl = `${SITE}/archive/${post.slug}`;

  // ── 2. Datos para la tabla (v8 chart, confiable desde servidor) ─────────────
  const charts = await Promise.all(TICKERS.map((t) => yahooChart(t.symbol)));
  const market = TICKERS.map((t, i) => ({ ...t, ...(charts[i] ?? {}) }));

  // ── 3. Construir el correo — una versión por idioma (EN solo si alguien la pide;
  // los campos EN caen al ES si el view no trae traducción, views viejos incluidos).
  const buildEmail = (lang) => {
  const en = lang === "en";
  const pick = (esV, enV) => (en && String(enV ?? "").trim() ? enV : esV);
  const title    = pick(post.title_es, post.title_en);
  const summary  = pick(post.summary_es, post.summary_en);
  const greeting = pick(post.greeting_es, post.greeting_en);
  const signoff  = pick(post.signoff_es, post.signoff_en);
  const watch    = en && Array.isArray(post.watch_en) && post.watch_en.length
    ? post.watch_en
    : (post.watch_es ?? []);
  const locale = en ? "en-US" : "es-MX";
  const dateLongL = new Date().toLocaleDateString(locale, {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Mexico_City",
  });
  const dateShortL = new Date().toLocaleDateString(locale, {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City",
  });
  const L = en ? {
    premarket: "The Pre-Market",
    bandsQ: `What does “${riskState}” mean? Meet the index's 4 bands →`,
    bandsQPlain: `What does "${riskState}" mean? The index's 4 bands:`,
    cta: "Read the full view →",
    marketData: "MARKET DATA",
    watch: "WATCHLIST",
    levels: "USD/MXN · LEVELS",
    support: "Support", resistance: "Resistance",
    explore: "EXPLORE", markets: "Markets", learn: "Learn",
    advisory: "Book advisory", advisoryCta: "📅 Book a 1-on-1 advisory",
    advisoryPlain: "Book an advisory",
    unsub: "Unsubscribe", footerTag: "DAILY PREMARKET",
  } : {
    premarket: "El Pre-Market",
    bandsQ: `¿Qué significa “${riskState}”? Conoce las 4 bandas del índice →`,
    bandsQPlain: `¿Qué significa "${riskState}"? Las 4 bandas del índice:`,
    cta: "Leer el view completo →",
    marketData: "DATOS DE MERCADO",
    watch: "A VIGILAR",
    levels: "USD/MXN · NIVELES",
    support: "Soporte", resistance: "Resistencia",
    explore: "EXPLORA", markets: "Mercados", learn: "Aprende",
    advisory: "Agenda asesoría", advisoryCta: "📅 Agenda una asesoría 1:1",
    advisoryPlain: "Agenda una asesoría",
    unsub: "Darse de baja", footerTag: "PREMARKET DIARIO",
  };
  const sans = "'Helvetica Neue',Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";

  const tableRows = market.map((d, i) => {
    const bb = i === market.length - 1 ? "" : `border-bottom:1px solid ${C.border};`;
    const pc = d.chgPct == null ? C.faint : d.chgPct >= 0 ? C.up : C.down;
    return `<tr>
      <td style="padding:11px 0;${bb}color:${C.text};font-family:${sans};font-size:14px">${en ? (d.name_en ?? d.name) : d.name}</td>
      <td style="padding:11px 0;${bb}text-align:right;color:${C.text};font-family:${sans};font-size:14px;font-weight:600;font-variant-numeric:tabular-nums">${fmtPrice(d.price, d.kind)}</td>
      <td style="padding:11px 0;${bb}text-align:right;color:${pc};font-family:${sans};font-size:14px;font-variant-numeric:tabular-nums">${fmtPct(d.chgPct)}</td>
    </tr>`;
  }).join("");

  const watchRows = watch.map((item) => `
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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">◇ ${riskState} · ${score}/100 — ${title}</div>
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
              <td style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;text-transform:uppercase">${L.premarket}</td>
              <td style="text-align:right;font-family:${sans};font-size:12px;color:${C.muted};text-transform:capitalize">${dateLongL}</td>
            </tr>
          </table>
          <div style="border-bottom:2px solid ${C.text};margin:12px 0 ${greeting ? "18px" : "26px"} 0"></div>

          ${greeting ? `<div style="font-family:${serif};font-size:16px;font-style:italic;color:${C.text};margin-bottom:24px">${GREET_TOKEN}</div>` : ""}

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

          <!-- Qué significa: link a la explicación de las bandas -->
          <div style="font-family:${sans};font-size:11px;color:${C.muted};margin:-14px 0 24px 0">
            <a href="${SITE}/#bandas" style="color:${C.muted};text-decoration:underline">${L.bandsQ}</a>
          </div>

          <!-- Headline + summary -->
          <div style="font-family:${serif};font-size:26px;line-height:1.25;color:${C.text};font-weight:700;margin-bottom:18px">${title}</div>
          <div style="font-family:${sans};font-size:15px;line-height:1.7;color:#3a3a3a;margin-bottom:26px">${summary}</div>

          <!-- Article CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:34px">
            <tr><td style="background:${C.text};border-radius:4px">
              <a href="${articleUrl}" style="display:inline-block;padding:13px 26px;font-family:${sans};font-size:14px;font-weight:600;color:${C.bone};text-decoration:none">${L.cta}</a>
            </td></tr>
          </table>

          <!-- Market data -->
          <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:6px">${L.marketData}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.text};margin-bottom:34px">${tableRows}</table>

          ${watch.length ? `
          <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:14px">${L.watch}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:34px">${watchRows}</table>` : ""}

          ${support || resistance ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};border-radius:4px;margin-bottom:36px">
            <tr><td style="padding:18px 22px">
              <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:12px">${L.levels}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="font-family:${sans};font-size:13px;color:${C.muted}">${L.support}</td><td style="text-align:right;font-family:${sans};font-size:15px;font-weight:700;color:${C.up};font-variant-numeric:tabular-nums">${support ?? "—"}</td></tr>
                <tr><td style="font-family:${sans};font-size:13px;color:${C.muted};padding-top:6px">${L.resistance}</td><td style="text-align:right;font-family:${sans};font-size:15px;font-weight:700;color:${C.down};padding-top:6px;font-variant-numeric:tabular-nums">${resistance ?? "—"}</td></tr>
              </table>
            </td></tr>
          </table>` : ""}

          ${signoff ? `<div style="font-family:${serif};font-size:15px;font-style:italic;color:${C.muted};text-align:center;padding:4px 10px 28px 10px">— ${signoff}</div>` : ""}

          <!-- Nav -->
          <div style="border-top:1px solid ${C.border};padding-top:24px;text-align:center">
            <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:14px">${L.explore}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
              <td style="padding:0 14px">${navLink(SITE + "/markets", L.markets)}</td>
              <td style="color:${C.border}">|</td>
              <td style="padding:0 14px">${navLink(SITE + "/learn", L.learn)}</td>
              <td style="color:${C.border}">|</td>
              <td style="padding:0 14px">${navLink(CALENDLY, L.advisory)}</td>
            </tr></table>
            <div style="margin-top:18px">
              <a href="${CALENDLY}" style="display:inline-block;padding:11px 22px;border:1.5px solid ${C.text};border-radius:4px;font-family:${sans};font-size:13px;font-weight:600;color:${C.text};text-decoration:none">${L.advisoryCta}</a>
            </div>
          </div>

        </td></tr>
      </table>

      <!-- Footer -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="padding:20px 44px;text-align:center;font-family:${sans};font-size:11px;letter-spacing:1px;color:${C.faint};line-height:1.7">
          RISKON.LAT · ${L.footerTag}<br>
          <a href="${SITE}" style="color:${C.muted};text-decoration:none">riskon.lat</a>
          &nbsp;·&nbsp;
          <a href="${UNSUB}" style="color:${C.faint};text-decoration:underline">${L.unsub}</a>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;

  // Versión texto plano (deliverability + accesibilidad)
  const text = [
    `${L.premarket.toUpperCase()} · ${dateLongL}`,
    `Risk On score ${score}/100 · ${riskState}`,
    `${L.bandsQPlain} ${SITE}/#bandas`,
    "",
    ...(greeting ? [GREET_TOKEN, ""] : []),
    title,
    "",
    summary,
    "",
    `${L.cta.replace(" →", "")}: ${articleUrl}`,
    "",
    L.marketData,
    ...market.map((d) => `  ${en ? (d.name_en ?? d.name) : d.name}: ${fmtPrice(d.price, d.kind)} (${fmtPct(d.chgPct)})`),
    "",
    ...(watch.length ? [L.watch, ...watch.map((w) => `  - ${w}`), ""] : []),
    `USD/MXN — ${L.support} ${support ?? "—"} / ${L.resistance} ${resistance ?? "—"}`,
    "",
    `${L.markets}: ${SITE}/markets`,
    `${L.learn}: ${SITE}/learn`,
    `${L.advisoryPlain}: ${CALENDLY}`,
    "",
    ...(signoff ? [`— ${signoff}`, ""] : []),
    `${L.unsub}: ${UNSUB}`,
    "riskon.lat",
  ].join("\n");

  // Asunto normal + guiño ÚNICO la víspera de México–Inglaterra (octavos, dom 5
  // jul 2026). Solo aplica al envío del viernes 3 jul; los demás días es el de
  // siempre — se auto-revierte.
  const subject = slug === "2026-07-03"
    ? (en
        ? "🇲🇽 What if this is the year? · Mexico–England on Sunday — The Pre-Market"
        : "🇲🇽 ¿Y si sí? · México–Inglaterra el domingo — El Pre-Market")
    : `${L.premarket} · ${riskState} ${score} · ${dateShortL}`;

  return { subject, html, text, greeting };
  }; // fin buildEmail

  // ── 4. Enviar (batch: 1 request para todos → sin rate-limit ni timeout) ──────
  // Con ?only mandamos solo al subconjunto pedido, pero tomamos su nombre del
  // Sheet (si existe) para que el saludo siga personalizado; los correos que no
  // estén en la lista van con saludo genérico.
  let recipients;
  if (only) {
    const wanted = only.split(",").map((s) => clean(s)).filter(Boolean);
    const byEmail = new Map((await getSubscribers()).map((s) => [s.email, s]));
    recipients = wanted.map((e) => byEmail.get(e) ?? { email: e });
  } else {
    recipients = await getSubscribers();
  }

  // Versión por idioma: la ES siempre; la EN solo si algún destinatario la pide.
  const emails = { es: buildEmail("es") };
  if (recipients.some((s) => s.lang === "en")) emails.en = buildEmail("en");
  const emailFor = (sub) => (sub.lang === "en" && emails.en ? emails.en : emails.es);

  // ?preview=1 → diagnóstico: devuelve asunto/saludo YA resueltos por
  // destinatario (con su idioma) SIN enviar. Úsalo con &resend=1&only=correo.
  if (preview) {
    return Response.json({
      ok: true, preview: true, greeting_es: emails.es.greeting,
      recipients: recipients.map((s) => {
        const v = emailFor(s);
        return {
          email: s.email, nombre: s.nombre ?? "", lang: s.lang ?? "es",
          subject: v.subject,
          greeting: personalizeGreeting(v.greeting, s),
        };
      }),
    });
  }

  const from = fromNameOverride
    ? `"${fromNameOverride}" <view@riskon.lat>`
    : '"Análisis FX · Mauricio Mercenario | Riskon" <view@riskon.lat>';
  const payloads = recipients.map((sub) => {
    const v = emailFor(sub);
    const email = sub.email;
    const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}`;
    // Saludo personalizado por destinatario (genérico si no llenó su nombre).
    const greet = personalizeGreeting(v.greeting, sub);
    return {
      from, to: email, subject: subjectOverride ?? v.subject,
      html: v.html.split(UNSUB).join(unsubUrl).split(GREET_TOKEN).join(greet ?? ""),
      text: v.text.split(UNSUB).join(unsubUrl).split(GREET_TOKEN).join(greet ?? ""),
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

  // Marcador anti-doble-envío: solo tras envío exitoso a la lista COMPLETA
  // (las pruebas ?only= no cuentan). El commit dispara un redeploy extra, ok.
  if (sent.ok && !only) {
    const marker = JSON.stringify({ slug, sentAt: new Date().toISOString(), count: recipients.length }) + "\n";
    const mk = await publishFileToGitHub(`sent/${slug}.json`, marker, `auto: sent marker ${slug}`);
    sent.marker = mk.ok ? "ok" : mk.error;
  }

  // Alertas operativas a Mauricio (solo en envíos reales, no en pruebas ?only=).
  if (!only) {
    if (!sent.ok) {
      await alertAdmin(`envío diario FALLÓ (${slug})`, { slug, sent, steps });
    } else if (steps.genError || steps.publishError) {
      await alertAdmin(`envío OK pero el pipeline tuvo errores (${slug})`, { slug, steps });
    }
  }

  return Response.json({ ok: true, riskState, score, steps, recipients: recipients.length, sent });
}

export { handler as GET, handler as POST };
