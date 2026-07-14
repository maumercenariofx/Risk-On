// lib/dailyView.js
// Genera el view de mercado del día. El Risk On score se calcula de forma
// DETERMINÍSTICA con una fórmula ponderada por activo (computeRiskScore) — la IA
// NO inventa el número, solo escribe la narrativa alrededor de él. Luego publica
// content/<fecha>.md en GitHub (dispara redeploy → nota live en /archive/<fecha>).
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
// Extensión .js explícita: Node puro (GitHub Actions) la exige; Next la acepta.
import { computeRiskScore, riskState } from "./riskScore.js";

export const REPO = "maumercenariofx/Risk-On";

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
- Enfoque en USD/MXN, el peso, DXY, tasas/curva y el apetito de riesgo global.

Redacción (el correo se lee en el celular a las 7am):
- Párrafos cortos: máximo 3-4 líneas cada uno, UNA idea por párrafo. Nada de muros de texto.
- Resalta en **negritas** 2-3 datos o niveles clave por sección — el lector debe poder escanear el correo en 30 segundos y quedarse con lo esencial.
- Cierra cada sección con una frase corta y contundente de remate.
- Varía vocabulario y construcciones entre días: cero muletillas recurrentes (nada de "manda", "sigue en pie", "la historia sigue vigente" un día tras otro).
- Dentro del MISMO artículo, no repitas un término técnico más de 2-3 veces ("carry", "resistencia", "soporte", "sesgo", "el par"...): alterna con sinónimos naturales según el contexto (el diferencial de tasas, el premio por tasa, el diferencial Banxico–Fed, la zona de 17.64, ese nivel, el techo/piso). La misma palabra en cada párrafo delata redacción de máquina. Aplica igual en body_en.`;

// ¿Cómo debe el redactor referirse al view anterior? "ayer" SOLO si de verdad
// fue ayer — el lunes el view anterior es del viernes, y el 2026-07-13 el
// artículo dijo "Ayer señalamos..." cuando "ayer" fue domingo. Se calcula en
// código y se le da la referencia exacta al modelo en ambos idiomas.
function prevViewRef(todaySlug, prevSlug) {
  const days = Math.round(
    (new Date(`${todaySlug}T12:00:00Z`) - new Date(`${prevSlug}T12:00:00Z`)) / 86400000
  );
  if (days === 1) return { es: "ayer", en: "yesterday", esAyer: true };
  const dow = new Date(`${prevSlug}T12:00:00Z`).getUTCDay();
  return { es: `el ${DOW[dow]}`, en: `on ${DOW_EN[dow]}`, esAyer: false };
}

function userPrompt(digest, dateStr, score, prev, todaySlug, pulse) {
  // Pulso web del instante: datos publicados esta mañana + noticias frescas.
  const pulseBlock = pulse
    ? `
PULSO DE ESTA MAÑANA (búsqueda web hecha hace MINUTOS — datos y noticias verificados):
${pulse}

REGLA DEL PULSO: si un dato de alto impacto YA se publicó esta mañana (p.ej. el CPI de las 6:30), es LA noticia del día — intégralo con su cifra exacta (actual vs consenso) en el titular, summary, body y watch según amerite, y explica cómo lo está digiriendo el mercado (los precios del digest YA lo reflejan). Si el pulso dice que un dato AÚN no sale, trátalo como evento por delante. Usa SOLO cifras que estén en el pulso o en el digest — jamás inventes un dato macro.
`
    : "";
  // Bloque de memoria: el view anterior, SOLO como referencia de continuidad y
  // anti-repetición. Sin esto cada día se generaba ciego a los anteriores y
  // aparecían muletillas ("manda" 7 veces en 7 días) y posturas calcadas.
  const ref = prev ? prevViewRef(todaySlug, prev.slug) : null;
  const prevBlock = prev
    ? `
VIEW ANTERIOR (${prev.slug}, publicado ${ref.es}) — referencia de continuidad; PROHIBIDO copiar sus formulaciones:
- Titular: ${prev.title}
- Score del view anterior: ${prev.score}/100
- Subtítulos que usó: ${prev.headings.join(" · ") || "(s/d)"}
- Postura del view anterior: ${prev.postura || "(sin postura explícita)"}
- Resumen: ${prev.summary}

CONTINUIDAD Y ANTI-REPETICIÓN:
- FECHAS (obligatorio): el view anterior se publicó ${ref.esAyer ? "ayer, así que SÍ puedes decir 'ayer'" : `${ref.es} — NO fue ayer. Al referirte a él escribe "${ref.es}" (en inglés: "${ref.en}"); JAMÁS "ayer"/"yesterday"`}.
- El lector diario debe sentir un HILO, no un reinicio: cuando aporte, di qué pasó con lo que se señaló en el view anterior ("${ref.es} marcamos la resistencia en X — hoy el par la respetó/rompió", "el score pasa de ${prev.score} a ${score} porque...").
- PROHIBIDO reutilizar los subtítulos del view anterior o variaciones obvias, el mismo gancho de titular, o sus frases características (revisa su postura y formúlala distinto si el sesgo no cambió — o mejor: explica POR QUÉ sigue vigente con el dato de hoy).
`
    : "";
  return `Hoy es ${dateStr}. Con base EXCLUSIVAMENTE en estos datos en vivo, escribe el Pre-Market de hoy.

${digest}
${pulseBlock}${prevBlock}
IMPORTANTE: el Risk On score (${score}/100, ${riskState(score)}) YA está calculado con una fórmula ponderada determinística. NO lo cambies ni propongas otro número. Tu trabajo es EXPLICAR por qué el mercado está en ese estado usando el desglose y los datos, y darle contexto hacia adelante (incluyendo los eventos del calendario y la forma de la curva).

Devuelve SOLO un objeto JSON válido (sin texto antes ni después, sin bloque de código markdown) con esta forma EXACTA:
{
  "title_es": "titular en español, concreto, con el tema del día (máx ~90 caracteres). Rota el gancho entre días: a veces abre con el evento, a veces con la tasa, el dato sorpresa o el score — NO abras siempre con 'Peso...'",
  "title_en": "same headline in English",
  "summary_es": "2-3 oraciones con LOS 3 NÚMEROS que más importan hoy y el porqué — no un inventario de todo el digest",
  "summary_en": "same summary in English",
  "hook_es": "gancho para el ASUNTO del correo: 30-45 caracteres que rematan el tema del día y dan ganas de abrir (puede ser pregunta); sin punto final, NO repitas el titular textual",
  "hook_en": "same hook in English, 30-45 characters",
  "postura_bias": "el sesgo de TU postura del cuerpo, como dato: 'pro-peso' | 'neutral' | 'pro-dolar' (debe coincidir con la postura escrita en body_es)",
  "postura_condicion": "la condición que invalidaría esa postura, en una frase corta (la misma del body)",
  "support": <nivel de soporte USD/MXN como número>,
  "resistance": <nivel de resistencia USD/MXN como número>,
  "watch_es": ["3 bullets de qué vigilar hoy con niveles/datos ACCIONABLES, 1-2 oraciones cada uno; menciona eventos del calendario relevantes. Cada bullet abre con un emoji acorde a SU tema — varía los emojis entre bullets y entre días, no uses siempre los mismos"],
  "watch_en": ["same 3 bullets in English"],
  "body_es": "cuerpo en Markdown, 400-550 palabras, español. 4 subtítulos '### ...' que nazcan del ÁNGULO específico de HOY — nunca genéricos reutilizables tipo 'La señal del día' o 'Tasas y curva', ni parecidos a los de ayer. Cubre en este orden: (1) el contexto/la señal de hoy, (2) el peso/USDMXN y el carry, (3) tasas/curva, (4) el escenario hacia adelante con el calendario. Incluye UNA postura direccional FALSABLE: sesgo + nivel de referencia + qué la invalidaría (estilo 'el sesgo favorece al peso mientras el 10Y no rompa 4.60%; arriba de eso me vuelvo neutral'), enmarcada como opinión de mercado, sin recomendaciones operativas. Jerarquía de cifras: el cuerpo explica el PORQUÉ — usa los números para sostener argumentos, cada cifra UNA sola vez, sin re-listar el digest completo. Cierra mencionando el Risk On score ${score} y el estado ${riskState(score)}.",
  "body_en": "the same content written NATIVELY in English (not a literal translation): same 4-section structure, same numbers, same falsifiable view. Natural professional English a NY trader would read without noticing it was translated."
}`;
}

// ── Memoria: view del día hábil anterior (para continuidad, no para copiar) ──
// Intenta el filesystem (GitHub Actions tiene el checkout) y cae a raw
// GitHub (Vercel). Camina hacia atrás hasta 6 días saltando fin de semana.
// Best-effort: si nada aparece, el view se genera sin memoria (como antes).
async function fetchPrevView(slug) {
  const d = new Date(`${slug}T12:00:00Z`);
  for (let i = 0; i < 6; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const prevSlug = ymd(d);
    let raw = null;
    try {
      const fs = await import("node:fs");
      const p = `${process.cwd()}/content/${prevSlug}.md`;
      if (fs.existsSync(p)) raw = fs.readFileSync(p, "utf8");
    } catch {}
    if (!raw) {
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/${REPO}/main/content/${prevSlug}.md`,
          { cache: "no-store" }
        );
        if (res.ok) raw = await res.text();
      } catch {}
    }
    if (!raw) continue;
    try {
      const { data, content } = matter(raw);
      return {
        slug: prevSlug,
        title: data.title_es ?? "",
        score: data.score ?? "s/d",
        summary: data.summary_es ?? "",
        headings: [...content.matchAll(/^### (.+)$/gm)].map((m) => m[1]),
        postura: content.match(/[^\n]*postura[^\n]*/i)?.[0]?.trim() ?? "",
      };
    } catch {
      return null;
    }
  }
  return null;
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
  // ── Guiño ÚNICO (una sola vez): víspera de México 🇲🇽 vs Inglaterra 🏴 —
  // octavos del Mundial 2026 en el Azteca, domingo 5 jul. Solo aplica al view del
  // viernes 3 jul 2026; cualquier otro día cae a la lógica normal de abajo, así
  // que se auto-revierte. El asunto especial del correo va en app/api/send-daily.
  if (slug === "2026-07-03") {
    return {
      greeting_es: "¡Feliz viernes largo! Con Wall Street de puente por el 4 de julio, EE.UU. baja el ritmo y el foco queda en el peso. Pero la cabeza de México está en otra cosa: el domingo la Selección juega los octavos ante Inglaterra en el Azteca —donde nunca ha perdido en un Mundial— y todos amanecimos con la misma pregunta… ¿y si sí? 🇲🇽⚽",
      greeting_en: "Happy long weekend! With Wall Street closed for the Fourth of July, the US slows down and the focus turns to the peso. But Mexico's mind is elsewhere: on Sunday El Tri plays England in the Round of 16 at the Azteca —where it has never lost in a World Cup— and everyone woke up asking the same thing… what if this is finally the year? 🇲🇽⚽",
      signoff_es: "Que tengas un excelente fin de semana largo. El domingo todos de verde y a cruzar los dedos en el Azteca —¿y si sí?—; el lunes volvemos al tape, pase lo que pase. ☕🇲🇽",
      signoff_en: "Have a great long weekend. Sunday we're all in green, fingers crossed at the Azteca —what if this is the year?— and Monday we're back on the tape, win or lose. ☕🇲🇽",
    };
  }
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

// Esquema del view para structured outputs: el API valida el JSON del lado del
// servidor, así que JSON.parse no puede fallar por una comilla mal escapada
// (la causa del fallo del 2026-07-08). Sin minLength/maxLength: structured
// outputs no los soporta; el largo lo pide el prompt.
const str = { type: "string" };
const strArr = { type: "array", items: { type: "string" } };
const VIEW_SCHEMA = {
  type: "object",
  properties: {
    title_es: str, title_en: str,
    summary_es: str, summary_en: str,
    hook_es: str, hook_en: str,
    // Postura estructurada: además de la prosa, el sesgo como dato evaluable —
    // alimenta el marcador de posturas (¿acertó?) con los forward returns.
    postura_bias: { type: "string", enum: ["pro-peso", "neutral", "pro-dolar"] },
    postura_condicion: str,
    support: { type: "number" }, resistance: { type: "number" },
    watch_es: strArr, watch_en: strArr,
    body_es: str, body_en: str,
  },
  required: ["title_es", "title_en", "summary_es", "summary_en", "hook_es",
    "hook_en", "postura_bias", "postura_condicion", "support", "resistance",
    "watch_es", "watch_en", "body_es", "body_en"],
  additionalProperties: false,
};

// ── Pulso de la mañana: búsqueda web EN EL INSTANTE de la generación ─────────
// El view se genera ~6:52 CDMX y los datos de EE.UU. salen 6:30 CDMX (8:30 ET):
// los PRECIOS ya eran del instante (?live=1) pero el dato publicado no llegaba
// a ningún lado (el calendario solo trae fechas, no resultados) — el 14-jul el
// correo no dijo nada del CPI que había salido 22 min antes. Este paso busca
// en la web los datos publicados esta mañana (actual vs consenso) y noticias
// recientes, y se lo pasa al redactor como contexto factual. Best-effort: si
// falla, el view se genera como antes (sin romper el pipeline).
async function fetchMorningPulse(anthropic, data, dateStr) {
  try {
    const hi = (Array.isArray(data.calendar) ? data.calendar : [])
      .filter((e) => e.impact === "high").slice(0, 8)
      .map((e) => `${e.date} ${e.event_es}`).join(" · ") || "(sin eventos de alto impacto en calendario)";
    const hora = new Date().toLocaleTimeString("es-MX", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
    });
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [{
        role: "user",
        content: `Hoy es ${dateStr} y son las ${hora} en Ciudad de México (los datos económicos de EE.UU. se publican a las 8:30 ET = 6:30 CDMX; los de México a las 6:00 CDMX). Eres el asistente de investigación de un análisis pre-market de FX enfocado en USD/MXN.

PRIORIDAD #1 (gasta aquí tus primeras búsquedas): si el calendario espera un dato de alto impacto HOY y por la hora ya debió publicarse, consigue su RESULTADO — actual vs consenso vs previo. Busca en INGLÉS (los resultados salen primero en medios en inglés, p.ej. "US CPI June actual") y persiste con variantes hasta tenerlo. Eventos que el calendario esperaba estos días: ${hi}.

PRIORIDAD #2 (con el presupuesto restante): datos publicados anoche y noticias de las últimas 12-18 horas que muevan riesgo/tasas/peso (Fed, Banxico, geopolítica, commodities, EM).

Devuelve SOLO un resumen factual en bullets (máximo 250 palabras), sin preguntas ni ofertas de seguimiento. Reglas: SOLO hechos con número y hora; si un dato de hoy AÚN no se publica, dilo explícitamente ("CPI sale a las 6:30, aún no publicado"); cero opiniones; si no encuentras algo tras buscar, di "no confirmado" — jamás lo inventes.`,
      }],
    });
    const text = (msg.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return text || null;
  } catch (e) {
    console.error(`[gen] pulso web falló (se genera sin él): ${e?.message ?? e}`);
    return null;
  }
}

export async function generateDailyView(data, dateStr, slug) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const scoreInfo = computeRiskScore(data);
  const digest = dataDigest(data, scoreInfo);
  // Memoria del día hábil anterior + pulso web del instante, en paralelo
  // (ambos best-effort: null si fallan, el view se genera igual).
  const [prev, pulse] = await Promise.all([
    fetchPrevView(slug ?? new Date().toISOString().slice(0, 10)).catch(() => null),
    fetchMorningPulse(anthropic, data, dateStr),
  ]);
  if (prev) console.log(`[gen] memoria: view de ${prev.slug} cargado ("${prev.title}")`);
  if (pulse) console.log(`[gen] pulso web cargado (${pulse.length} chars):\n${pulse}`);

  // Hasta 3 intentos: el JSON malformado / truncado es estocástico (un re-run
  // manual lo arreglaba), así que reintentar AQUÍ evita perder la mañana.
  // Capa 1: structured outputs (JSON garantizado por el API). Si el modelo
  // rechazara output_config (400), capa 2: prompt puro + parse, como antes.
  let structured = true;
  let view = null, lastErr = null;
  for (let attempt = 1; attempt <= 3 && !view; attempt++) {
    try {
      const req = {
        // Redactor subido a Opus 4.8 (2026-07-13): mejor prosa y seguimiento
        // fiel de las reglas finas (fechas del view anterior, tope léxico).
        // Adaptive thinking mejora el criterio; en Opus 4.8 hay que pedirlo
        // explícito (omitirlo = sin thinking). max_tokens 16000 porque el
        // thinking cuenta contra el tope — 6000 truncaría el view.
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: SYSTEM,
        messages: [{ role: "user", content: userPrompt(digest, dateStr, scoreInfo.score, prev, slug ?? new Date().toISOString().slice(0, 10), pulse) }],
      };
      if (structured) {
        req.output_config = { format: { type: "json_schema", schema: VIEW_SCHEMA } };
      }
      const msg = await anthropic.messages.create(req);
      if (msg.stop_reason === "max_tokens") {
        throw new Error("respuesta truncada (stop_reason=max_tokens)");
      }
      let text = msg.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      view = JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (structured && e?.status === 400) {
        structured = false; // el modelo no acepta output_config → modo legacy
        console.error(`[gen] intento ${attempt}: output_config rechazado (400) — reintento sin structured outputs`);
      } else {
        console.error(`[gen] intento ${attempt} falló: ${e?.message ?? e}`);
      }
    }
  }
  if (!view) throw lastErr;

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
  const { body_es = "", body_en = "", greeting_es, signoff_es, greeting_en, signoff_en, ...front } = view;
  const wrap = (greet, body, sign) => [
    greet ? `*${greet}*` : "",
    (body || "").trim(),
    sign ? `\n— *${sign}*` : "",
  ].filter(Boolean).join("\n\n");
  const esBody = wrap(greeting_es, body_es, signoff_es);
  // body_en (en el front-matter) = artículo COMPLETO en inglés (saludo + cuerpo +
  // despedida), análogo al cuerpo ES; lib/posts.js lo renderiza → html_en.
  const enBody = body_en?.trim() ? wrap(greeting_en, body_en, signoff_en) : "";
  return matter.stringify(`\n${esBody}\n`, {
    date: slug, greeting_es, signoff_es, greeting_en, signoff_en, body_en: enBody, ...front,
  });
}

// Publica (o actualiza) content/<slug>.md en GitHub → dispara redeploy de Vercel
export async function publishToGitHub(slug, mdContent) {
  return publishFileToGitHub(`content/${slug}.md`, mdContent, `auto: pre-market view ${slug}`);
}

// Commitea un archivo arbitrario del repo (crea o actualiza). Lo usa también el
// marcador anti-doble-envío sent/<slug>.json de send-daily.
export async function publishFileToGitHub(path, fileContent, message) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN missing" };

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
    message,
    content: Buffer.from(fileContent, "utf8").toString("base64"),
    branch: "main",
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!putRes.ok) return { ok: false, error: `GitHub ${putRes.status}: ${await putRes.text()}` };
  return { ok: true };
}

// ¿Ya salió el correo de hoy? Consulta el marcador sent/<slug>.json vía contents
// API (no el raw CDN, que cachea ~5 min). Devuelve un veredicto de TRES estados:
//   "sent"     → el marcador existe (200)
//   "not-sent" → GitHub respondió 404 — la ÚNICA respuesta que autoriza enviar
//   "unknown"  → error transitorio (5xx/red/rate-limit/sin token) tras 3 intentos.
// El 2026-07-13 la versión fail-open de este check (cualquier error = "no enviado")
// duplicó el correo a toda la lista; quien consuma "unknown" decide fail-closed.
export async function checkSentMarker(slug) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { status: "unknown", attempts: 0, error: "GITHUB_TOKEN missing" };

  let lastError = "";
  const MAX = 3;
  for (let attempt = 1; attempt <= MAX; attempt++) {
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
      if (res.ok) return { status: "sent", attempts: attempt };
      if (res.status === 404) return { status: "not-sent", attempts: attempt };
      lastError = `GitHub ${res.status}`;
    } catch (e) {
      lastError = String(e?.message ?? e);
    }
    if (attempt < MAX) await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return { status: "unknown", attempts: MAX, error: lastError };
}
