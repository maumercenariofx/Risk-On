// lib/dailyView.js
// Genera el view de mercado del día. El Risk On score se calcula de forma
// DETERMINÍSTICA con una fórmula ponderada por activo (computeRiskScore) — la IA
// NO inventa el número, solo escribe la narrativa alrededor de él. Luego publica
// content/<fecha>.md en GitHub (dispara redeploy → nota live en /archive/<fecha>).
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
import { computeRiskScore, riskState } from "./riskScore";

const REPO = "maumercenariofx/Risk-On";

// ── Datos en vivo (reusa los endpoints ya existentes del sitio) ──────────────
export async function fetchLiveData(origin = "https://riskon.lat") {
  const [market, rates, curve, calendar] = await Promise.all([
    // ?live=1 → datos frescos al instante (sin caché CDN/ISR ni el SWR de 5 min),
    // y spot USD/MXN intradía, para que el score y el nivel citado sean los del
    // momento exacto del envío (no una versión cacheada). Rates/curve no son
    // sensibles intradía, así que se quedan con su caché normal.
    fetch(`${origin}/api/market?live=1`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/rates`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/curve`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/calendar?days=10`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);
  return { market, rates, curve, calendar };
}

// El score se calcula con el módulo compartido lib/riskScore.js (misma fórmula
// que la landing en vivo). Aquí solo se usa computeRiskScore + riskState.

// ── Construcción del prompt ──────────────────────────────────────────────────
function fmt(v, d = 2) {
  return v == null ? "s/d" : Number(v).toFixed(d);
}

function dataDigest(data, scoreInfo) {
  const { market: m, rates: r, curve: c, calendar: cal } = data;
  const pct = (v) => (v == null ? "" : ` (${v >= 0 ? "+" : ""}${v.toFixed(2)}%)`);
  const lines = [];

  if (m) {
    lines.push("MERCADO:");
    lines.push(`USD/MXN: ${fmt(m.usdmxnSpot ?? m.usdmxn, 4)}${pct(m.usdmxnChg)} (spot en vivo; cítalo EXACTO con 2 decimales)`);
    lines.push(`EUR/MXN: ${fmt(m.eurmxn, 4)}${pct(m.eurmxnChg)}`);
    lines.push(`DXY: ${fmt(m.dxy)}`);
    lines.push(`S&P 500: ${fmt(m.spx, 0)}${pct(m.spxChg)} · Futuros ES${pct(m.spxFutChg)} (premarket)`);
    lines.push(`IPC México: ${fmt(m.ipc, 0)}${pct(m.ipcChg)}`);
    lines.push(`VIX: ${fmt(m.vix)} · MOVE: ${fmt(m.move)}`);
    lines.push(`US 10Y: ${fmt(m.us10y)}%${pct(m.us10yChg)}`);
    lines.push(`Oro: ${fmt(m.gold, 0)}${pct(m.goldChg)} · WTI: ${fmt(m.wti)}${pct(m.wtiChg)}`);
    lines.push(`Bitcoin: ${fmt(m.btc, 0)}${pct(m.btcChg)}`);
    lines.push(`Vol. realizada USD/MXN: ${fmt(m.mxnVol)}% · Soporte ${fmt(m.mxnS1, 4)} / Resistencia ${fmt(m.mxnR1, 4)}`);
  }
  if (r) lines.push(`TASAS: Banxico ${fmt(r.banxico)}% · Fed ${fmt(r.fed)}% · TIIE28 ${fmt(r.tiie28)}% · Carry ${fmt((r.banxico ?? 0) - (r.fed ?? 0))}pp`);
  if (c?.points?.length) {
    lines.push(`CURVA UST: ${c.points.map((p) => `${p.term} ${fmt(p.yield)}%`).join(" · ")}`);
    lines.push(`Spread 2s10s: ${fmt(c.spread2s10s)}pp ${c.inverted ? "(INVERTIDA)" : "(positiva)"}`);
  }
  if (Array.isArray(cal) && cal.length) {
    const hi = cal.filter((e) => e.impact === "high").slice(0, 8);
    if (hi.length) lines.push(`CALENDARIO (próx. eventos alto impacto): ${hi.map((e) => `${e.date} ${e.flag} ${e.event_es}`).join(" · ")}`);
  }

  lines.push("");
  lines.push(`RISK ON SCORE (ya calculado, NO lo cambies): ${scoreInfo.score}/100 → ${riskState(scoreInfo.score)}`);
  lines.push(`Desglose ponderado: ${scoreInfo.breakdown.map((b) => `${b.label} sub ${b.sub} (peso ${b.w})`).join(" · ")}`);
  return lines.join("\n");
}

const SYSTEM = `Eres Mauricio Mercenario, especialista en FX y mercados globales. Escribes "El Pre-Market" diario de riskon.lat para traders profesionales y tesoreros en México.

Estilo:
- Voz directa, analítica, con criterio propio. Explicas el PORQUÉ detrás de los movimientos, no solo los números.
- Mantén jerga de trader y conceptos en inglés cuando aplique (carry, risk-on/off, dovish/hawkish, steepening, bull/bear flattening, breakout, etc.). Escribes para profesionales mexicanos: registro profesional pero cercano, español de México.
- Da POSTURA / views direccionales cuando el contexto lo amerite, enmarcadas como opinión de mercado. Ejemplo del tono permitido: "con el carry diferencial en estos niveles y esperando que Powell mantenga tasas, el sesgo favorece quedarse largo carry / al peso".
- PROHIBIDO: recomendaciones de inversión específicas (precios de entrada/salida exactos, instrumentos puntuales para comprar, tamaños de posición, "compra/vende X a Y"). Habla de sesgo y postura general, nunca de instrucciones operativas concretas.
- Enfoque en USD/MXN, el peso, DXY, tasas/curva y el apetito de riesgo global.`;

function userPrompt(digest, dateStr, score) {
  return `Hoy es ${dateStr}. Con base EXCLUSIVAMENTE en estos datos en vivo, escribe el Pre-Market de hoy.

${digest}

IMPORTANTE: el Risk On score (${score}/100, ${riskState(score)}) YA está calculado con una fórmula ponderada determinística. NO lo cambies ni propongas otro número. Tu trabajo es EXPLICAR por qué el mercado está en ese estado usando el desglose y los datos, y darle contexto hacia adelante (incluyendo los eventos del calendario y la forma de la curva).

Devuelve SOLO un objeto JSON válido (sin texto antes ni después, sin bloque de código markdown) con esta forma EXACTA:
{
  "title_es": "titular en español, concreto, con el tema del día (máx ~90 caracteres)",
  "title_en": "same headline in English",
  "summary_es": "resumen de 2-3 oraciones con los números clave y el porqué",
  "summary_en": "same summary in English",
  "support": <nivel de soporte USD/MXN como número>,
  "resistance": <nivel de resistencia USD/MXN como número>,
  "watch_es": ["3 bullets de qué vigilar hoy, cada uno 1-2 oraciones con dato concreto; menciona eventos del calendario relevantes"],
  "watch_en": ["same 3 bullets in English"],
  "body_es": "cuerpo en Markdown, 400-550 palabras, español. Usa 4 subtítulos '### Título'. Cubre: (1) la señal del día, (2) el peso/USDMXN y el carry, (3) tasas/curva, (4) el escenario hacia adelante con el calendario. Incluye al menos una POSTURA/view direccional enmarcada como opinión (sin recomendaciones específicas). Cierra mencionando el Risk On score ${score} y el estado ${riskState(score)}."
}`;
}

// ── Saludo y despedida cálidos según el día (deterministas) ──────────────────
// El view se publica TODOS los días hábiles (Lun–Vie), INCLUSO en feriados de
// México: en esos días la BMV/Banxico descansan pero Wall Street opera, así que
// igual mandamos view y lo reconocemos con calidez. La "próxima sesión" para la
// despedida es simplemente el siguiente día entre semana (solo saltamos fin de
// semana). MX_HOLIDAYS sirve para SALUDAR el feriado, no para saltarlo.
const MX_HOLIDAYS = {
  "2026-01-01": "Año Nuevo",
  "2026-02-02": "Día de la Constitución",
  "2026-03-16": "Natalicio de Benito Juárez",
  "2026-04-02": "Jueves Santo",
  "2026-04-03": "Viernes Santo",
  "2026-05-01": "Día del Trabajo",
  "2026-09-16": "Día de la Independencia",
  "2026-11-16": "Día de la Revolución",
  "2026-12-25": "Navidad",
  "2027-01-01": "Año Nuevo",
};

const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DOW_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
// Siguiente día entre semana después de `slug` (solo salta sábado/domingo;
// los feriados MX NO se saltan porque también publicamos en ellos).
function nextWeekday(slug) {
  const d = new Date(`${slug}T12:00:00Z`);
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d;
}

// Devuelve { greeting_es, greeting_en, signoff_es, signoff_en } según el día.
function dayGreetings(slug) {
  const today = new Date(`${slug}T12:00:00Z`);
  const dow = today.getUTCDay(); // 0 dom … 6 sáb
  const next = nextWeekday(slug);
  const nextName = DOW[next.getUTCDay()];
  const nextNameEn = DOW_EN[next.getUTCDay()];
  const holToday = MX_HOLIDAYS[slug];
  const holNext  = MX_HOLIDAYS[ymd(next)];

  // ── Saludo de apertura ──
  let greeting_es, greeting_en;
  if (dow === 1) { greeting_es = "¡Buen inicio de semana!"; greeting_en = "Happy Monday — let's get the week going!"; }
  else if (dow === 5) { greeting_es = "¡Feliz viernes! Cerramos la semana."; greeting_en = "Happy Friday! Let's close out the week."; }
  else { greeting_es = "¡Buenos días!"; greeting_en = "Good morning!"; }
  if (holToday) {
    greeting_es += ` Hoy es ${holToday}: la BMV descansa, pero aquí seguimos porque Wall Street opera y el peso no para. 🇲🇽`;
    greeting_en += ` Today is a Mexican holiday (${holToday}): local markets are closed, but we're here — Wall Street is open and the peso doesn't rest. 🇲🇽`;
  }

  // ── Despedida ──
  let signoff_es, signoff_en;
  if (dow === 5) {
    if (holNext) {
      signoff_es = `Que tengas un excelente fin de semana largo — el lunes es ${holNext} y la BMV cierra, pero te dejo tu view porque EE.UU. opera. ☕`;
      signoff_en = `Have a great long weekend — Monday is a Mexican holiday (${holNext}) and local markets close, but your view will be here since the US is open. ☕`;
    } else {
      signoff_es = "Que tengas un excelente fin de semana — nos leemos el lunes. ☕";
      signoff_en = "Have a great weekend — see you Monday. ☕";
    }
  } else if (holNext) {
    signoff_es = `Nos vemos mañana: aunque sea ${holNext} y la BMV descanse, hay view porque EE.UU. opera. ☕`;
    signoff_en = `See you tomorrow: even though it's a Mexican holiday (${holNext}) with local markets closed, there'll be a view — the US is open. ☕`;
  } else {
    signoff_es = `Nos vemos mañana con el view del ${nextName}.`;
    signoff_en = `See you tomorrow for ${nextNameEn}'s view.`;
  }
  return { greeting_es, greeting_en, signoff_es, signoff_en };
}

export async function generateDailyView(data, dateStr, slug) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const scoreInfo = computeRiskScore(data);
  const digest = dataDigest(data, scoreInfo);

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2600,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt(digest, dateStr, scoreInfo.score) }],
  });

  let text = msg.content?.[0]?.text?.trim() ?? "";
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const view = JSON.parse(text);

  // El score es determinístico — siempre gana el calculado.
  view.score = scoreInfo.score;
  view.support = data.market?.mxnS1 ?? (Number(view.support) || null);
  view.resistance = data.market?.mxnR1 ?? (Number(view.resistance) || null);
  // Se persiste en el front-matter para dibujar el gauge + desglose en el sitio.
  view.signals = scoreInfo.breakdown.map((b) => ({ label: b.label, sub: b.sub, w: b.w }));
  // Saludo/despedida cálidos según el día (viernes, puente, etc.).
  const g = dayGreetings(slug ?? new Date().toISOString().slice(0, 10));
  Object.assign(view, g);
  return view;
}

// Construye el .md con front-matter idéntico al esquema de /content.
// El saludo abre el cuerpo y la despedida lo cierra (también en el artículo).
export function buildMarkdown(view, slug) {
  const { body_es = "", greeting_es, signoff_es, ...front } = view;
  const body = [
    greeting_es ? `*${greeting_es}*` : "",
    body_es.trim(),
    signoff_es ? `\n— *${signoff_es}*` : "",
  ].filter(Boolean).join("\n\n");
  return matter.stringify(`\n${body}\n`, { date: slug, greeting_es, signoff_es, ...front });
}

// Publica (o actualiza) content/<slug>.md en GitHub → dispara redeploy de Vercel
export async function publishToGitHub(slug, mdContent) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN missing" };

  const path = `content/${slug}.md`;
  const url = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "riskon-daily-cron",
  };

  let sha;
  try {
    const getRes = await fetch(`${url}?ref=main`, { headers, cache: "no-store" });
    if (getRes.ok) sha = (await getRes.json())?.sha;
  } catch {}

  const body = {
    message: `auto: pre-market view ${slug}`,
    content: Buffer.from(mdContent, "utf8").toString("base64"),
    branch: "main",
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!putRes.ok) return { ok: false, error: `GitHub ${putRes.status}: ${await putRes.text()}` };
  return { ok: true };
}
