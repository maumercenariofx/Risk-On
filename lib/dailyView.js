// lib/dailyView.js
// Genera el view de mercado del día con IA a partir de datos en vivo y lo
// publica en el repo (content/<fecha>.md) vía la API de GitHub, lo que dispara
// un redeploy de Vercel y deja la nota completa disponible en /archive/<fecha>.
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";

const REPO = "maumercenariofx/Risk-On";

// ── Datos en vivo (reusa los endpoints ya existentes del sitio) ──────────────
export async function fetchLiveData(origin = "https://riskon.lat") {
  const [market, rates] = await Promise.all([
    fetch(`${origin}/api/market`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/rates`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);
  return { market, rates };
}

function fmt(v, d = 2) {
  return v == null ? "s/d" : Number(v).toFixed(d);
}

function dataDigest({ market: m, rates: r }) {
  if (!m) return "Sin datos de mercado disponibles.";
  const pct = (v) => (v == null ? "" : ` (${v >= 0 ? "+" : ""}${v.toFixed(2)}%)`);
  return [
    `USD/MXN: ${fmt(m.usdmxn, 4)}${pct(m.usdmxnChg)}`,
    `EUR/MXN: ${fmt(m.eurmxn, 4)}${pct(m.eurmxnChg)}`,
    `DXY: ${fmt(m.dxy)}`,
    `S&P 500: ${fmt(m.spx, 0)}${pct(m.spxChg)}`,
    `IPC México: ${fmt(m.ipc, 0)}${pct(m.ipcChg)}`,
    `VIX: ${fmt(m.vix)}`,
    `MOVE: ${fmt(m.move)}`,
    `US 10Y: ${fmt(m.us10y)}%${pct(m.us10yChg)}`,
    `Oro: ${fmt(m.gold, 0)}${pct(m.goldChg)}`,
    `WTI: ${fmt(m.wti)}${pct(m.wtiChg)}`,
    `Bitcoin: ${fmt(m.btc, 0)}${pct(m.btcChg)}`,
    `Vol. realizada USD/MXN: ${fmt(m.mxnVol)}%`,
    `Soporte USD/MXN (auto): ${fmt(m.mxnS1, 4)} · Resistencia: ${fmt(m.mxnR1, 4)}`,
    r ? `Banxico: ${fmt(r.banxico)}% · Fed: ${fmt(r.fed)}% · TIIE28: ${fmt(r.tiie28)}%` : "",
  ].filter(Boolean).join("\n");
}

const SYSTEM = `Eres Mauricio Mercenario, especialista en FX y mercados globales. Escribes "El Pre-Market" diario de riskon.lat para traders profesionales y tesoreros en México. Tu voz es directa, analítica y sin paja: explicas el PORQUÉ detrás de los movimientos, no solo los números. Enfoque en USD/MXN, el peso, DXY, tasas y el apetito de riesgo global. Español de México, profesional pero cercano.`;

function userPrompt(digest, dateStr) {
  return `Hoy es ${dateStr}. Con base EXCLUSIVAMENTE en estos datos de mercado en vivo, escribe el Pre-Market de hoy.

DATOS EN VIVO:
${digest}

Devuelve SOLO un objeto JSON válido (sin texto antes ni después, sin bloque de código markdown) con esta forma EXACTA:
{
  "title_es": "titular en español, concreto, con el tema del día (máx ~90 caracteres)",
  "title_en": "same headline in English",
  "summary_es": "resumen de 2-3 oraciones con los números clave y el porqué",
  "summary_en": "same summary in English",
  "score": <entero 0-100, el 'Risk On score': 0-25 risk-off, 26-50 defensive, 51-75 constructive, 76-100 risk-on>,
  "support": <nivel de soporte USD/MXN como número, usa el soporte auto como referencia>,
  "resistance": <nivel de resistencia USD/MXN como número>,
  "watch_es": ["3 bullets de qué vigilar hoy, cada uno 1-2 oraciones con dato concreto"],
  "watch_en": ["same 3 bullets in English"],
  "body_es": "cuerpo del análisis en Markdown, 350-500 palabras, en español. Usa 3-4 subtítulos '### Título'. Explica la señal del día, el peso/USDMXN, tasas/curva y el escenario hacia adelante. Termina con la postura sugerida y menciona el Risk On score."
}`;
}

export async function generateDailyView(data, dateStr) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const digest = dataDigest(data);

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2400,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt(digest, dateStr) }],
  });

  let text = msg.content?.[0]?.text?.trim() ?? "";
  // Por si el modelo envuelve en ```json ... ```
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const view = JSON.parse(text);

  // Saneo mínimo
  view.score = Math.max(0, Math.min(100, Math.round(Number(view.score) || 60)));
  view.support = Number(view.support) || data.market?.mxnS1 || null;
  view.resistance = Number(view.resistance) || data.market?.mxnR1 || null;
  return view;
}

// Construye el .md con front-matter idéntico al esquema de /content
export function buildMarkdown(view, slug) {
  const { body_es = "", ...front } = view;
  return matter.stringify(`\n${body_es.trim()}\n`, { date: slug, ...front });
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

  // ¿ya existe? necesitamos el sha para actualizar
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
  if (!putRes.ok) {
    return { ok: false, error: `GitHub ${putRes.status}: ${await putRes.text()}` };
  }
  return { ok: true };
}
