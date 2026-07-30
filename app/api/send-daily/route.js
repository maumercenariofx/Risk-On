import { Resend } from "resend";
import { getAllPostsMeta } from "../../../lib/posts";
import { fetchLiveData, generateDailyView, buildMarkdown, publishToGitHub, publishFileToGitHub, checkSentMarker, REPO } from "../../../lib/dailyView";
import { stripBold, boldToHtml } from "../../../lib/mdInline";
import { posturaRecord } from "../../../lib/forwardReturns";
import { alertAdmin } from "../../../lib/alertAdmin";
import { clean, cleanName, personalizeGreeting, probeSheet, getSubscribers } from "../../../lib/subscribers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Suscriptores y personalización: lib/subscribers.js (compartido con el recap).
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

// Token reemplazable: el saludo se renderiza una vez en la plantilla y se
// personaliza por destinatario en el loop de envío (igual que UNSUB).
const GREET_TOKEN = "@@GREETING@@";

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
// Con flecha direccional para la tabla (▲/▼ + el % firmado).
const fmtPctArrow = (v) => (v == null ? "—" : `${v >= 0 ? "▲" : "▼"} ${fmtPct(v)}`);
function fmtPrice(v, kind) {
  if (v == null) return "—";
  if (kind === "yield") return `${v.toFixed(2)}%`;
  if (kind === "decimal") return v.toFixed(2);
  return v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 });
}

// Sesgo de la postura → etiqueta + color (tonos de banda, nada alarmista:
// pro-dólar NO es "malo", es una lectura — azul acero como RISK-OFF).
const BIAS_META = {
  "pro-peso":  { es: "PRO-PESO",  en: "PRO-PESO",   color: "#0A7D3C" },
  "neutral":   { es: "NEUTRAL",   en: "NEUTRAL",    color: "#B8860B" },
  "pro-dolar": { es: "PRO-DÓLAR", en: "PRO-DOLLAR", color: "#3A5A8F" },
};

// Tweet pre-armado para el link "Compártelo en X" — mismo formato que el botón
// X del sitio (components/PostView.jsx composeTweet): score+banda, titular,
// postura, link. Presupuesto 280 (URL pesa 23, no-ASCII pesa 2).
function composeTweetUrl(post, lang, riskState) {
  const en = lang === "en";
  const title = stripBold((en ? post.title_en : post.title_es) || post.title_es || "");
  const url = `${SITE}/archive/${post.slug}`;
  const biasEs = { "pro-peso": "pro-peso", "pro-dolar": "pro-dólar", neutral: "neutral" };
  const bias = biasEs[post.postura_bias] ?? post.postura_bias;
  const cond = String(post.postura_condicion ?? "").replace(/\s+/g, " ").trim();
  const condShort = cond.length > 70 ? cond.slice(0, 67) + "…" : cond;
  const posturaLine = bias ? `🎯 ${en ? "View" : "Postura"} ${bias}${condShort ? ` · ${condShort}` : ""}` : null;
  const footer = en ? `Full view 👇\n${url}` : `El view completo 👇\n${url}`;
  const weight = (t) => [...t.replace(/https?:\/\/\S+/g, "x".repeat(23))]
    .reduce((n, ch) => n + (ch.codePointAt(0) > 0x2000 ? 2 : 1), 0);
  const variants = [
    [`📊 Pre-Market ${post.score}/100 · ${riskState}`, "", title, "", posturaLine, "", footer],
    [`📊 Pre-Market ${post.score}/100 · ${riskState}`, "", title, "", footer],
    [`📊 Pre-Market ${post.score}/100 · ${riskState}`, "", footer],
  ];
  for (const v of variants) {
    const text = v.filter((l) => l != null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (weight(text) <= 280) return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }
  return `https://x.com/intent/tweet?text=${encodeURIComponent(`📊 Pre-Market · ${url}`)}`;
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
  // FAIL-CLOSED (incidente 2026-07-13): solo un 404 explícito autoriza enviar.
  // Si GitHub no responde tras 3 intentos, NO enviamos — un duplicado a la lista
  // completa es irreversible; un skip solo difiere al siguiente respaldo (7:10).
  if (resend && !force && !only && !preview) {
    const marker = await checkSentMarker(slug);
    if (marker.status === "sent") {
      return Response.json({ ok: true, skipped: "already sent today", slug, marker });
    }
    if (marker.status === "unknown") {
      await alertAdmin(`guarda de doble envío no verificable (${slug})`, {
        slug,
        marker,
        accion:
          "GitHub no respondió al consultar sent/<slug>.json; NO se envió por seguridad. " +
          "Si el correo de hoy no salió, reintenta con ?resend=1 cuando GitHub responda, " +
          "o ?force=1 bajo tu criterio (los respaldos 7:00/7:10 reintentan solos).",
      });
      return Response.json(
        { ok: false, skipped: "marker unverifiable", slug, marker },
        { status: 503 }
      );
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

  // Flecha del asunto: score de hoy vs el del último view publicado antes de
  // hoy (meta del build — ayer siempre está deployado). Sin dato → sin flecha.
  // prevScore además alimenta el caption de la tira de régimen ("ayer 52 → hoy 57").
  let arrow = "";
  let prevScore = null;
  try {
    const prevPost = getAllPostsMeta()
      .filter((p) => String(p.date).slice(0, 10) < slug)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const ps = Number(prevPost?.score);
    if (Number.isFinite(ps)) {
      prevScore = ps;
      if (ps !== score) arrow = score > ps ? " ▲" : " ▼";
    }
  } catch {}

  // ── Datos extra del correo (mejoras 2026-07-27) — todos best-effort: si algo
  // falla, su bloque simplemente no se renderiza y el correo sale igual. ──────
  const metaPosts = (() => { try { return getAllPostsMeta(); } catch { return []; } })();

  // Tira de régimen: últimos ~22 views (≈1 mes hábil) coloreados por banda,
  // con el de hoy al final (puede no estar aún en el build del deploy).
  let stripPoints = [];
  try {
    stripPoints = metaPosts
      .filter((p) => Number.isFinite(Number(p.score)))
      .slice(0, 22)
      .map((p) => ({ slug: String(p.date ?? p.slug).slice(0, 10), score: Number(p.score) }))
      .reverse();
    if (!stripPoints.length || stripPoints[stripPoints.length - 1].slug !== slug) {
      stripPoints.push({ slug, score });
    }
    stripPoints = stripPoints.slice(-22);
  } catch {}

  // Récord de posturas (mismo motor que el marcador público de /indice; solo
  // cuentan las resueltas, ≥5 días hábiles, así que el build siempre alcanza).
  let record = null;
  try {
    record = await posturaRecord(metaPosts.map((p) => ({
      slug: p.slug ?? String(p.date).slice(0, 10),
      postura_bias: p.postura_bias, postura_condicion: p.postura_condicion,
      title_es: p.title_es, title_en: p.title_en,
    })));
  } catch {}

  // Agenda de HOY (alto impacto, hora CDMX); si está vacía, el próximo evento.
  let agendaToday = [], agendaNext = null;
  try {
    const cal = await fetch(`${SITE}/api/calendar?days=8`, { cache: "no-store" }).then((r) => r.json());
    const evs = Array.isArray(cal) ? cal : [];
    agendaToday = evs.filter((e) => e.date === slug && e.impact === "high").slice(0, 4);
    if (!agendaToday.length) agendaNext = evs.find((e) => e.date > slug && e.impact === "high") ?? null;
  } catch {}

  // Fila USD/MXN de la tabla: spot + % contra cierre previo VERIFICADO
  // (/api/market cruza diario vs intradía desde el incidente del 24-jul).
  let mxnRow = null;
  try {
    const mkt = await fetch(`${SITE}/api/market`, { cache: "no-store" }).then((r) => r.json());
    const price = mkt?.usdmxnSpot ?? mkt?.usdmxn;
    if (price != null) mxnRow = { price, chgPct: mkt.usdmxnChg ?? null };
  } catch {}

  // Recorta en palabra completa para que el gancho no muera a media frase.
  const shorten = (s, n = 48) => {
    s = String(s ?? "").trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20))}…`;
  };

  // ── 2. Datos para la tabla (v8 chart, confiable desde servidor) ─────────────
  const charts = await Promise.all(TICKERS.map((t) => yahooChart(t.symbol)));
  const market = TICKERS.map((t, i) => ({ ...t, ...(charts[i] ?? {}) }));

  // ── 3. Construir el correo — una versión por idioma (EN solo si alguien la pide;
  // los campos EN caen al ES si el view no trae traducción, views viejos incluidos).
  const buildEmail = (lang) => {
  const en = lang === "en";
  const pick = (esV, enV) => (en && String(enV ?? "").trim() ? enV : esV);
  // El redactor mete negritas markdown (**x**) en summary/watch; aquí se
  // convierten a <strong> real (HTML) o se limpian (título y texto plano) —
  // el 2026-07-13 el correo salió con los asteriscos crudos.
  const title      = stripBold(pick(post.title_es, post.title_en));
  const summaryRaw = pick(post.summary_es, post.summary_en);
  const summary    = boldToHtml(summaryRaw); // versión HTML del correo
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
    strip30: "Last 30 days", yesterday: "yesterday", today: "today",
    postura: "TODAY'S STANCE", record: "Track record", recordOf: "stances validated",
    recordLink: "see the public scoreboard →",
    agenda: "TODAY'S CALENDAR (CDMX)", agendaEmpty: "No high-impact data today",
    agendaNext: "Next up",
    shareLine: "Was this Pre-Market useful? Help us grow:",
    shareInvite: "Invite a colleague →", shareX: "Share on X",
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
    strip30: "Últimos 30 días", yesterday: "ayer", today: "hoy",
    postura: "POSTURA DEL DÍA", record: "Marcador", recordOf: "posturas validadas",
    recordLink: "ver el marcador público →",
    agenda: "AGENDA DE HOY (CDMX)", agendaEmpty: "Sin datos de alto impacto hoy",
    agendaNext: "Próximo",
    shareLine: "¿Te sirvió este Pre-Market? Ayúdanos a crecer:",
    shareInvite: "Invita a un colega →", shareX: "Compártelo en X",
  };
  const sans = "'Helvetica Neue',Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";

  // Fila USD/MXN destacada al frente (EL dato de esta audiencia; % contra
  // cierre previo verificado por /api/market) + flechas ▲▼ en todos.
  const pctClass = (v) => (v == null ? "" : v >= 0 ? "em-up" : "em-down");
  const mxnTr = mxnRow ? (() => {
    const pc = mxnRow.chgPct == null ? C.faint : mxnRow.chgPct >= 0 ? C.up : C.down;
    return `<tr>
      <td class="em-soft em-text" style="padding:11px 8px;background:${C.bone};border-bottom:1px solid ${C.border};color:${C.text};font-family:${sans};font-size:14px;font-weight:700">USD/MXN</td>
      <td class="em-soft em-text" style="padding:11px 0;background:${C.bone};border-bottom:1px solid ${C.border};text-align:right;color:${C.text};font-family:${sans};font-size:14px;font-weight:700;font-variant-numeric:tabular-nums">${mxnRow.price.toFixed(4)}</td>
      <td class="em-soft ${pctClass(mxnRow.chgPct)}" style="padding:11px 8px 11px 0;background:${C.bone};border-bottom:1px solid ${C.border};text-align:right;color:${pc};font-family:${sans};font-size:14px;font-weight:700;font-variant-numeric:tabular-nums">${fmtPctArrow(mxnRow.chgPct)}</td>
    </tr>`;
  })() : "";
  const tableRows = mxnTr + market.map((d, i) => {
    const bb = i === market.length - 1 ? "" : `border-bottom:1px solid ${C.border};`;
    const pc = d.chgPct == null ? C.faint : d.chgPct >= 0 ? C.up : C.down;
    return `<tr>
      <td class="em-text em-border" style="padding:11px 0 11px 8px;${bb}color:${C.text};font-family:${sans};font-size:14px">${en ? (d.name_en ?? d.name) : d.name}</td>
      <td class="em-text em-border" style="padding:11px 0;${bb}text-align:right;color:${C.text};font-family:${sans};font-size:14px;font-weight:600;font-variant-numeric:tabular-nums">${fmtPrice(d.price, d.kind)}</td>
      <td class="em-border ${pctClass(d.chgPct)}" style="padding:11px 8px 11px 0;${bb}text-align:right;color:${pc};font-family:${sans};font-size:14px;font-variant-numeric:tabular-nums">${fmtPctArrow(d.chgPct)}</td>
    </tr>`;
  }).join("");

  const watchRows = watch.map((item) => `
    <tr>
      <td style="padding:0;vertical-align:top;width:18px"><div style="width:6px;height:6px;border-radius:50%;background:${color};margin-top:8px"></div></td>
      <td class="em-body" style="padding:0 0 14px 0;font-family:${sans};font-size:14px;color:#3a3a3a;line-height:1.65">${boldToHtml(item)}</td>
    </tr>`).join("");

  const navLink = (href, label) =>
    `<a href="${href}" class="em-text" style="font-family:${sans};font-size:13px;color:${C.text};text-decoration:none;font-weight:600">${label}</a>`;

  // ── Tira de régimen 30d: una celdita por view, coloreada por su banda ────────
  const stripHtml = stripPoints.length >= 5 ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin-bottom:7px"><tr>
            ${stripPoints.map((p) => `<td class="em-border" style="height:9px;background:${riskStateFromScore(p.score).color};border-right:2px solid ${C.card};font-size:0;line-height:0">&nbsp;</td>`).join("")}
          </tr></table>
          <div class="em-faint" style="font-family:${sans};font-size:10.5px;color:${C.faint};letter-spacing:0.5px;margin-bottom:22px">${L.strip30}${prevScore != null ? ` · ${L.yesterday} ${prevScore} → ${L.today} <span style="color:${score >= prevScore ? C.up : C.down};font-weight:700" class="${score >= prevScore ? "em-up" : "em-down"}">${score}${arrow}</span>` : ""}</div>` : "";

  // ── Postura del día + récord auditable ───────────────────────────────────────
  const bias = BIAS_META[post.postura_bias];
  const condicion = stripBold(post.postura_condicion ?? ""); // solo ES en el front-matter
  const posturaHtml = bias ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-soft" style="background:${C.bg};border-left:3px solid ${bias.color};border-radius:4px;margin-bottom:28px">
            <tr><td style="padding:16px 20px">
              <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:9px">🎯 ${L.postura}</div>
              <div style="margin-bottom:${condicion ? "8px" : "0"}"><span style="display:inline-block;padding:4px 10px;border-radius:3px;background:${bias.color};color:#FFFFFF;font-family:${sans};font-size:12px;font-weight:700;letter-spacing:1px">${en ? bias.en : bias.es}</span></div>
              ${condicion ? `<div class="em-body" style="font-family:${serif};font-size:14px;font-style:italic;color:#3a3a3a;line-height:1.55">${condicion}</div>` : ""}
              ${record?.resolved ? `<div class="em-muted" style="font-family:${sans};font-size:12px;color:${C.muted};margin-top:10px">${L.record}: <strong class="em-text" style="color:${C.text}">${record.hits}/${record.resolved}</strong> ${L.recordOf} · <a href="${SITE}/indice" class="em-muted" style="color:${C.muted};text-decoration:underline">${L.recordLink}</a></div>` : ""}
            </td></tr>
          </table>` : "";

  // ── Agenda de hoy (alto impacto) o el próximo evento ────────────────────────
  const evName = (e) => (en ? (e.event_en ?? e.event_es) : e.event_es);
  const agendaRows = agendaToday.length
    ? agendaToday.map((e) => `
      <tr>
        <td class="em-text" style="padding:0 0 8px 0;width:56px;vertical-align:top;font-family:${sans};font-size:13px;font-weight:700;color:${C.text};font-variant-numeric:tabular-nums">${e.time ?? ""}</td>
        <td class="em-body" style="padding:0 0 8px 0;font-family:${sans};font-size:13.5px;color:#3a3a3a;line-height:1.5">${e.flag ?? ""} ${evName(e)}</td>
      </tr>`).join("")
    : `<tr><td class="em-muted" style="font-family:${sans};font-size:13px;color:${C.muted};line-height:1.5">${L.agendaEmpty}${agendaNext ? ` · ${L.agendaNext}: <strong class="em-text" style="color:${C.text}">${new Date(`${agendaNext.date}T12:00:00Z`).toLocaleDateString(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "")} ${agendaNext.flag ?? ""} ${evName(agendaNext)}</strong>` : ""}</td></tr>`;
  const agendaHtml = `
          <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:12px">📅 ${L.agenda}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:34px">${agendaRows}</table>`;

  // ── Bloque compartir/crecer ─────────────────────────────────────────────────
  const shareHtml = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-soft" style="background:${C.bg};border-radius:4px;margin-bottom:30px">
            <tr><td style="padding:16px 20px;text-align:center">
              <div class="em-body" style="font-family:${sans};font-size:13px;color:#3a3a3a;margin-bottom:9px">${L.shareLine}</div>
              <a href="${SITE}/suscribete" class="em-text" style="font-family:${sans};font-size:13px;font-weight:700;color:${C.text};text-decoration:underline">${L.shareInvite}</a>
              <span class="em-faint" style="color:${C.faint}">&nbsp;·&nbsp;</span>
              <a href="${composeTweetUrl(post, lang, riskState)}" class="em-text" style="font-family:${sans};font-size:13px;font-weight:700;color:${C.text};text-decoration:underline">𝕏 ${L.shareX}</a>
            </td></tr>
          </table>`;

  // Modo oscuro: paleta propia vía prefers-color-scheme (Apple Mail, Outlook
  // móvil y otros la respetan; el Gmail app aplica su propia inversión y este
  // diseño crema/tinta invierte razonablemente). El masthead se queda claro en
  // dark a propósito — el logo es tinta oscura y así sigue legible (etiqueta
  // de papel sobre fondo oscuro).
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
      .em-track { background: #26262E !important; }
      .em-up    { color: #2FB89A !important; }
      .em-down  { color: #E4735F !important; }
      .em-btn      { background: #ECEAE4 !important; }
      .em-btn-txt  { color: #17171C !important; }
      .em-outline  { border-color: #ECEAE4 !important; color: #ECEAE4 !important; }
    }`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${darkCss}</style></head>
<body class="em-bg" style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">◇ ${riskState} · ${score}/100 — ${title}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" style="background:${C.bg}">
    <tr><td align="center" style="padding:28px 16px">

      <!-- Masthead (claro también en dark: el logo es tinta) -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="em-bone em-border" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-bottom:none;border-radius:4px 4px 0 0">
        <tr><td align="center" style="padding:34px 44px 22px 44px">
          <img src="${SITE}/riskon-logo.png" width="148" alt="Risk On" style="display:block;width:148px;max-width:55%;height:auto;margin:0 auto" />
          <div style="font-family:${sans};font-size:10px;letter-spacing:3px;color:${C.faint};text-transform:uppercase;margin-top:14px">Daily views by Mauricio Mercenario</div>
        </td></tr>
      </table>

      <!-- Card -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="em-card" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 4px 4px">
        <tr><td style="padding:36px 44px 40px 44px">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;text-transform:uppercase">${L.premarket}</td>
              <td class="em-muted" style="text-align:right;font-family:${sans};font-size:12px;color:${C.muted};text-transform:capitalize">${dateLongL}</td>
            </tr>
          </table>
          <div class="em-rule" style="border-bottom:2px solid ${C.text};margin:12px 0 ${greeting ? "18px" : "26px"} 0"></div>

          ${greeting ? `<div class="em-text" style="font-family:${serif};font-size:16px;font-style:italic;color:${C.text};margin-bottom:24px">${GREET_TOKEN}</div>` : ""}

          <!-- Score gauge -->
          <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:10px">RISK ON SCORE</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:7px"><tr>
            <td class="em-track" style="background:#ECE8DF;border-radius:7px;padding:0;font-size:0;line-height:0">
              <table role="presentation" width="${score}%" cellpadding="0" cellspacing="0"><tr>
                <td style="background:${color};border-radius:7px;height:14px;font-size:0;line-height:0">&nbsp;</td>
              </tr></table>
            </td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr>
            <td class="em-faint" style="font-family:${sans};font-size:10px;color:${C.faint};letter-spacing:0.5px">0 · risk-off</td>
            <td style="text-align:center;white-space:nowrap"><span style="font-family:${sans};font-size:22px;font-weight:700;color:${color}">${score}</span> <span style="font-family:${sans};font-size:12px;font-weight:700;color:${color};letter-spacing:1px">◇ ${riskState}</span></td>
            <td class="em-faint" style="text-align:right;font-family:${sans};font-size:10px;color:${C.faint};letter-spacing:0.5px">risk-on · 100</td>
          </tr></table>

          <!-- Tira de régimen: el último mes de views coloreado por banda -->
          ${stripHtml}

          <!-- Qué significa: link a la explicación de las bandas -->
          <div class="em-muted" style="font-family:${sans};font-size:11px;color:${C.muted};margin:0 0 24px 0">
            <a href="${SITE}/#bandas" class="em-muted" style="color:${C.muted};text-decoration:underline">${L.bandsQ}</a>
          </div>

          <!-- Headline + summary -->
          <div class="em-text" style="font-family:${serif};font-size:26px;line-height:1.25;color:${C.text};font-weight:700;margin-bottom:18px">${title}</div>
          <div class="em-body" style="font-family:${sans};font-size:15px;line-height:1.7;color:#3a3a3a;margin-bottom:26px">${summary}</div>

          <!-- Postura del día + récord -->
          ${posturaHtml}

          <!-- Article CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:34px">
            <tr><td class="em-btn" style="background:${C.text};border-radius:4px">
              <a href="${articleUrl}" class="em-btn-txt" style="display:inline-block;padding:13px 26px;font-family:${sans};font-size:14px;font-weight:600;color:${C.bone};text-decoration:none">${L.cta}</a>
            </td></tr>
          </table>

          <!-- Market data -->
          <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:6px">${L.marketData}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-rule" style="border-top:1px solid ${C.text};margin-bottom:34px">${tableRows}</table>

          <!-- Agenda de hoy -->
          ${agendaHtml}

          ${watch.length ? `
          <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:14px">${L.watch}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:34px">${watchRows}</table>` : ""}

          ${support || resistance ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-soft" style="background:${C.bg};border-radius:4px;margin-bottom:36px">
            <tr><td style="padding:18px 22px">
              <div class="em-faint" style="font-family:${sans};font-size:11px;letter-spacing:2px;color:${C.faint};font-weight:700;margin-bottom:12px">${L.levels}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td class="em-muted" style="font-family:${sans};font-size:13px;color:${C.muted}">${L.support}</td><td class="em-up" style="text-align:right;font-family:${sans};font-size:15px;font-weight:700;color:${C.up};font-variant-numeric:tabular-nums">${support ?? "—"}</td></tr>
                <tr><td class="em-muted" style="font-family:${sans};font-size:13px;color:${C.muted};padding-top:6px">${L.resistance}</td><td class="em-down" style="text-align:right;font-family:${sans};font-size:15px;font-weight:700;color:${C.down};padding-top:6px;font-variant-numeric:tabular-nums">${resistance ?? "—"}</td></tr>
              </table>
            </td></tr>
          </table>` : ""}

          ${signoff ? `<div class="em-muted" style="font-family:${serif};font-size:15px;font-style:italic;color:${C.muted};text-align:center;padding:4px 10px 26px 10px">— ${signoff}</div>` : ""}

          <!-- Compartir / crecer -->
          ${shareHtml}

          <!-- Nav -->
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

    </td></tr>
  </table>
</body>
</html>`;

  // Versión texto plano (deliverability + accesibilidad)
  const text = [
    `${L.premarket.toUpperCase()} · ${dateLongL}`,
    `Risk On score ${score}/100 · ${riskState}${prevScore != null ? ` (${L.yesterday} ${prevScore})` : ""}`,
    `${L.bandsQPlain} ${SITE}/#bandas`,
    "",
    ...(greeting ? [GREET_TOKEN, ""] : []),
    title,
    "",
    stripBold(summaryRaw),
    "",
    ...(bias ? [
      `${L.postura}: ${en ? bias.en : bias.es}${condicion ? ` — ${condicion}` : ""}`,
      ...(record?.resolved ? [`${L.record}: ${record.hits}/${record.resolved} ${L.recordOf} · ${SITE}/indice`] : []),
      "",
    ] : []),
    `${L.cta.replace(" →", "")}: ${articleUrl}`,
    "",
    L.marketData,
    ...(mxnRow ? [`  USD/MXN: ${mxnRow.price.toFixed(4)} (${fmtPct(mxnRow.chgPct)})`] : []),
    ...market.map((d) => `  ${en ? (d.name_en ?? d.name) : d.name}: ${fmtPrice(d.price, d.kind)} (${fmtPct(d.chgPct)})`),
    "",
    `${L.agenda}: ${agendaToday.length
      ? agendaToday.map((e) => `${e.time ?? ""} ${evName(e)}`).join(" · ")
      : `${L.agendaEmpty}${agendaNext ? ` · ${L.agendaNext}: ${agendaNext.date.slice(5)} ${evName(agendaNext)}` : ""}`}`,
    "",
    ...(watch.length ? [L.watch, ...watch.map((w) => `  - ${stripBold(w)}`), ""] : []),
    `USD/MXN — ${L.support} ${support ?? "—"} / ${L.resistance} ${resistance ?? "—"}`,
    "",
    `${L.markets}: ${SITE}/markets`,
    `${L.learn}: ${SITE}/learn`,
    `${L.advisoryPlain}: ${CALENDLY}`,
    `${L.shareInvite.replace(" →", "")}: ${SITE}/suscribete`,
    "",
    ...(signoff ? [`— ${signoff}`, ""] : []),
    `${L.unsub}: ${UNSUB}`,
    "riskon.lat",
  ].join("\n");

  // Asunto: "Pre-Market {score}{▲▼} · {gancho del día}". El gancho (hook_es/en)
  // lo genera el redactor pensado para asunto (30-45 chars); views sin gancho
  // (anteriores al redactor v2) caen al titular recortado. La fecha no va: la
  // bandeja ya la muestra, y el score+flecha dicen "algo cambió, ábreme".
  const hook = shorten((en ? post.hook_en : post.hook_es)?.trim() || title);
  const subject = `Pre-Market ${score}${arrow} · ${hook}`;

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
    // Envío real: si el Sheet no responde tras los reintentos, se manda al piso
    // de respaldo pero con ALERTA (antes degradaba en silencio y ~30 altas
    // nuevas se quedaban sin correo sin dejar rastro).
    recipients = await getSubscribers({
      onDegraded: (err) =>
        alertAdmin(`Sheet de suscriptores inalcanzable (${slug}) — envío degradado al piso de respaldo`, { slug, err }),
    });
  }

  // Versión por idioma: la ES siempre; la EN solo si algún destinatario la pide.
  const emails = { es: buildEmail("es") };
  if (recipients.some((s) => s.lang === "en")) emails.en = buildEmail("en");
  const emailFor = (sub) => (sub.lang === "en" && emails.en ? emails.en : emails.es);

  // ?html=1 (solo con ?only=): devuelve el HTML del correo SIN enviar — para
  // QA visual (Playwright claro/oscuro) sin gastar envíos ni spamear.
  if (only && reqUrl.searchParams.get("html")) {
    const v = emailFor(recipients[0] ?? {});
    const rendered = v.html
      .split(UNSUB).join(`${SITE}/api/unsubscribe?email=test`)
      .split(GREET_TOKEN).join(personalizeGreeting(v.greeting, recipients[0] ?? {}) ?? "");
    return new Response(rendered, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

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

  // Remitente corto y personal — en móvil el largo anterior se truncaba justo
  // antes de la marca. NO cambiarlo seguido: el remitente construye
  // reconocimiento y los filtros desconfían de remitentes que mutan.
  const from = fromNameOverride
    ? `"${fromNameOverride}" <view@riskon.lat>`
    : '"Mauricio | Risk-On" <view@riskon.lat>';
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
