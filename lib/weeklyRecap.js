// lib/weeklyRecap.js
// Recap semanal de viernes por la tarde: el arco del score en la semana, el
// marcador de posturas (las que se RESOLVIERON esta semana — una postura madura
// a los 5 días hábiles, así que las de esta misma semana siguen en curso), el
// view destacado y qué viene la próxima semana. Se genera en GitHub Actions
// (scripts/gen-recap-action.mjs, viernes 16:00 CDMX), se publica en
// content/recaps/<viernes>.md (fuera del archivo del sitio: lib/posts.js solo
// lee content/*.md planos) y se envía vía /api/send-recap.
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
import { getAllPostsMeta } from "./posts.js";
import { posturaRecord } from "./forwardReturns.js";
import { riskState } from "./riskScore.js";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Lunes de la semana del slug dado (slug = viernes normalmente).
function weekStart(slug) {
  const d = new Date(`${slug}T12:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7)); // retrocede al lunes
  return d.toISOString().slice(0, 10);
}

async function usdmxnWeek(monday, friday) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/MXN=X?range=1mo&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" }, cache: "no-store" });
    const r = (await res.json())?.chart?.result?.[0];
    const ts = r?.timestamp ?? [], closes = r?.indicators?.quote?.[0]?.close ?? [];
    const days = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || isNaN(c)) continue;
      const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      if (d >= monday && d <= friday) days.push({ d, c: +c.toFixed(4) });
    }
    if (!days.length) return null;
    const chg = ((days[days.length - 1].c - days[0].c) / days[0].c) * 100;
    return { path: days, open: days[0].c, close: days[days.length - 1].c, chgPct: +chg.toFixed(2) };
  } catch {
    return null;
  }
}

// Reúne todo el material de la semana. `fridaySlug` = fecha del recap (viernes).
export async function gatherWeek(fridaySlug) {
  const monday = weekStart(fridaySlug);
  const all = getAllPostsMeta(); // desc
  const week = all
    .filter((p) => p.slug >= monday && p.slug <= fridaySlug)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1))
    .map((p) => ({
      slug: p.slug, score: Number(p.score),
      title_es: p.title_es ?? "", summary_es: p.summary_es ?? "",
      postura_bias: p.postura_bias ?? null, postura_condicion: p.postura_condicion ?? "",
    }));

  // Posturas que se RESOLVIERON (5 días hábiles cumplidos) — todas las
  // publicadas, no solo las de esta semana; el front del marcador es /indice.
  const record = await posturaRecord(all.map((p) => ({
    slug: p.slug, postura_bias: p.postura_bias, postura_condicion: p.postura_condicion,
    title_es: p.title_es, title_en: p.title_en,
  }))).catch(() => null);
  const resueltas = (record?.rows ?? []).filter((r) => r.verdict != null).slice(0, 5);

  const fx = await usdmxnWeek(monday, fridaySlug);

  let calendar = [];
  try {
    const cal = await fetch("https://riskon.lat/api/calendar?days=9", { cache: "no-store" }).then((r) => r.json());
    calendar = (Array.isArray(cal) ? cal : []).filter((e) => e.impact === "high" && e.date > fridaySlug).slice(0, 8);
  } catch {}

  return { monday, fridaySlug, week, resueltas, record, fx, calendar };
}

const str = { type: "string" };
const RECAP_SCHEMA = {
  type: "object",
  properties: {
    title_es: str, title_en: str,
    hook_es: str, hook_en: str,
    body_es: str, body_en: str,
  },
  required: ["title_es", "title_en", "hook_es", "hook_en", "body_es", "body_en"],
  additionalProperties: false,
};

const RECAP_SYSTEM = `Eres Mauricio Mercenario, especialista en FX y mercados globales. Escribes el RECAP SEMANAL de "El Pre-Market" (riskon.lat) — el cierre de semana que el lector abre el viernes por la tarde con calma, a diferencia del diario de las 7am.

Estilo: voz directa y analítica, jerga de trader cuando aplique, español de México profesional pero cercano. Párrafos de máximo 3-4 líneas, 2-3 datos clave en **negritas** por sección, remate corto por sección. Un término técnico máximo 2-3 veces por artículo (alterna sinónimos). PROHIBIDO: recomendaciones operativas concretas.

Honestidad ante todo: si una postura falló, se dice sin maquillar — el marcador público es la marca de la casa.`;

function recapPrompt(w, dateStr) {
  const arc = w.week.map((v) => `${v.slug} → score ${v.score} (${riskState(v.score)}): "${v.title_es}" · postura: ${v.postura_bias ?? "s/d"}`).join("\n");
  const marcador = w.resueltas.length
    ? w.resueltas.map((r) => `${r.slug}: ${r.bias} → USD/MXN 5d ${r.mxn5 > 0 ? "+" : ""}${r.mxn5?.toFixed(2)}% → ${r.verdict ? "ACIERTO" : "FALLO"}`).join("\n")
    : "(ninguna postura se resolvió esta semana — las publicadas siguen en curso)";
  const cal = w.calendar.length
    ? w.calendar.map((e) => `${e.date} ${e.flag ?? ""} ${e.event_es}`).join(" · ")
    : "(sin eventos de alto impacto en calendario)";
  const totales = w.record ? `${w.record.hits}/${w.record.resolved} aciertos históricos` : "s/d";

  return `Hoy es ${dateStr} (viernes por la tarde). Escribe el RECAP SEMANAL con base EXCLUSIVAMENTE en estos datos.

LA SEMANA, VIEW POR VIEW:
${arc}

USD/MXN EN LA SEMANA: ${w.fx ? `abrió ${w.fx.open} → cerró ${w.fx.close} (${w.fx.chgPct > 0 ? "+" : ""}${w.fx.chgPct}%)` : "s/d"}
Trayectoria diaria: ${w.fx ? w.fx.path.map((p) => `${p.d.slice(5)} ${p.c}`).join(" · ") : "s/d"}

MARCADOR DE POSTURAS (resueltas recientemente, regla: pro-peso acierta si USD/MXN cayó en 5 días hábiles):
${marcador}
Marcador acumulado: ${totales}

PRÓXIMA SEMANA (eventos de alto impacto):
${cal}

Devuelve SOLO un objeto JSON con esta forma EXACTA:
{
  "title_es": "titular del recap, concreto, con el arco de la semana (máx ~90 caracteres)",
  "title_en": "same headline in English",
  "hook_es": "gancho para el asunto del correo, 30-45 caracteres, sin punto final",
  "hook_en": "same hook in English",
  "body_es": "cuerpo en Markdown, 350-500 palabras, español, con subtítulos '### ...' propios de ESTA semana. Estructura: (1) el arco de la semana — cómo se movió el score y el peso, con el porqué; (2) el marcador — qué posturas se resolvieron, aciertos Y fallos con su cifra (si no se resolvió ninguna, di que siguen en curso y cuándo maduran); (3) el view/momento de la semana; (4) la próxima semana — los eventos que importan y qué implicarían. Cierra con una frase de fin de semana.",
  "body_en": "the same content written NATIVELY in English (not a literal translation)."
}`;
}

export async function generateWeeklyRecap(fridaySlug, dateStr) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const w = await gatherWeek(fridaySlug);
  if (!w.week.length) throw new Error(`sin views entre ${w.monday} y ${fridaySlug}`);

  let recap = null, lastErr = null;
  for (let attempt = 1; attempt <= 3 && !recap; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        system: RECAP_SYSTEM,
        messages: [{ role: "user", content: recapPrompt(w, dateStr) }],
        output_config: { format: { type: "json_schema", schema: RECAP_SCHEMA } },
      });
      if (msg.stop_reason === "max_tokens") throw new Error("truncado (max_tokens)");
      const text = msg.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
      recap = JSON.parse(text);
    } catch (e) {
      lastErr = e;
      console.error(`[recap] intento ${attempt} falló: ${e?.message ?? e}`);
    }
  }
  if (!recap) throw lastErr;
  return { ...recap, week: w.week.map(({ slug, score }) => ({ slug, score })), fx: w.fx ? { open: w.fx.open, close: w.fx.close, chgPct: w.fx.chgPct } : null };
}

export function buildRecapMarkdown(recap, fridaySlug) {
  const { body_es = "", body_en = "", ...front } = recap;
  return matter.stringify(`\n${body_es.trim()}\n`, {
    date: fridaySlug, type: "recap", body_en: body_en.trim(), ...front,
  });
}
