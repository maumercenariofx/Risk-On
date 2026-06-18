// lib/dailyView.js
// Genera el view de mercado del día. El Risk On score se calcula de forma
// DETERMINÍSTICA con una fórmula ponderada por activo (computeRiskScore) — la IA
// NO inventa el número, solo escribe la narrativa alrededor de él. Luego publica
// content/<fecha>.md en GitHub (dispara redeploy → nota live en /archive/<fecha>).
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";

const REPO = "maumercenariofx/Risk-On";

// ── Datos en vivo (reusa los endpoints ya existentes del sitio) ──────────────
export async function fetchLiveData(origin = "https://riskon.lat") {
  const [market, rates, curve, calendar] = await Promise.all([
    fetch(`${origin}/api/market`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/rates`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/curve`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/calendar?days=10`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);
  return { market, rates, curve, calendar };
}

// ── Score determinístico ponderado ──────────────────────────────────────────
// Cada señal mapea a un sub-score 0-100 (100 = más risk-on / pro-peso) vía una
// rampa lineal entre `at0` (→0) y `at100` (→100). EDITA pesos y umbrales aquí.
const SIGNALS = [
  { key: "vix",    label: "VIX (vol acciones)",        w: 20, get: (d) => d.market?.vix,        at0: 28,   at100: 12   },
  { key: "mxn",    label: "USD/MXN (dirección peso)",  w: 18, get: (d) => d.market?.usdmxnChg,  at0: 0.5,  at100: -0.5 },
  { key: "spx",    label: "S&P 500",                   w: 15, get: (d) => d.market?.spxChg,     at0: -1,   at100: 1    },
  { key: "carry",  label: "Carry (Banxico − Fed)",     w: 10, get: (d) => (d.rates?.banxico != null && d.rates?.fed != null) ? d.rates.banxico - d.rates.fed : null, at0: 0, at100: 7 },
  { key: "mxnvol", label: "Vol. realizada USD/MXN",    w: 10, get: (d) => d.market?.mxnVol,     at0: 14,   at100: 6    },
  { key: "move",   label: "MOVE (vol bonos)",          w: 8,  get: (d) => d.market?.move,       at0: 140,  at100: 60   },
  { key: "btc",    label: "Bitcoin (apetito riesgo)",  w: 7,  get: (d) => d.market?.btcChg,     at0: -3,   at100: 3    },
  { key: "curve",  label: "Curva 2s10s",               w: 7,  get: (d) => d.curve?.spread2s10s, at0: -0.5, at100: 1.0  },
  { key: "gold",   label: "Oro (cobertura, inverso)",  w: 5,  get: (d) => d.market?.goldChg,    at0: 1,    at100: -1   },
];

function lin(v, at0, at100) {
  if (v == null || isNaN(v)) return null;
  const t = (v - at0) / (at100 - at0);
  return Math.max(0, Math.min(100, t * 100));
}

export function computeRiskScore(d) {
  let sum = 0, wsum = 0;
  const breakdown = [];
  for (const s of SIGNALS) {
    const v = s.get(d);
    const sub = lin(v, s.at0, s.at100);
    if (sub == null) continue;
    sum += sub * s.w;
    wsum += s.w;
    breakdown.push({ label: s.label, value: v, sub: Math.round(sub), w: s.w });
  }
  const score = wsum ? Math.round(sum / wsum) : 60;
  return { score, breakdown };
}

export function riskState(score) {
  if (score <= 25) return "RISK-OFF";
  if (score <= 50) return "DEFENSIVE";
  if (score <= 75) return "CONSTRUCTIVE";
  return "RISK-ON";
}

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
    lines.push(`USD/MXN: ${fmt(m.usdmxn, 4)}${pct(m.usdmxnChg)}`);
    lines.push(`EUR/MXN: ${fmt(m.eurmxn, 4)}${pct(m.eurmxnChg)}`);
    lines.push(`DXY: ${fmt(m.dxy)}`);
    lines.push(`S&P 500: ${fmt(m.spx, 0)}${pct(m.spxChg)}`);
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

export async function generateDailyView(data, dateStr) {
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
  view._breakdown = scoreInfo.breakdown;
  return view;
}

// Construye el .md con front-matter idéntico al esquema de /content
export function buildMarkdown(view, slug) {
  const { body_es = "", _breakdown, ...front } = view;
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
