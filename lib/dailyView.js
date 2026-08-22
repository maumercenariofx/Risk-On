// lib/dailyView.js
// Genera el view de mercado del día. El Risk On score se calcula de forma
// DETERMINÍSTICA con una fórmula ponderada por activo (computeRiskScore) — la IA
// NO inventa el número, solo escribe la narrativa alrededor de él. Luego publica
// content/<fecha>.md en GitHub (dispara redeploy → nota live en /archive/<fecha>).
import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
// Extensión .js explícita: Node puro (GitHub Actions) la exige; Next la acepta.
import { computeRiskScore, riskState, BANDS } from "./riskScore.js";
import { computeStretch, computePosturaPrior, priorPromptBlock } from "./posturaPrior.js";

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

// ── Modo suscripción: Claude Code headless (claude -p) ───────────────────────
// Si CLAUDE_CODE_OAUTH_TOKEN está presente (secret en GitHub Actions), las
// llamadas a Claude van por el CLI de Claude Code y consumen el plan Max —
// $0 extra de API (~$10-12 USD/mes de ahorro). Sin el token (Vercel y los
// respaldos inline-gen), todo sigue por el SDK con ANTHROPIC_API_KEY, así que
// la cadena de redundancia del correo de las 7am queda intacta.
function subscriptionMode() {
  return !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

// Ejecuta `claude -p` y devuelve el wrapper JSON del CLI ({result,
// structured_output, usage, total_cost_usd, is_error...}). El prompt va por
// stdin (evita límites de longitud de argv). Siempre SIN shell: el schema
// JSON como argumento no sobrevive el quoting de cmd/sh. En Windows el
// "claude" del PATH es un shim .cmd (que exigiría shell), así que se invoca
// el claude.exe real del paquete global de npm.
async function claudeCli(prompt, { system, schema, tools = "", model = "claude-opus-4-8" } = {}) {
  const { execFile, execSync } = await import("node:child_process");
  const bin = process.platform === "win32"
    ? `${execSync("npm root -g", { shell: true }).toString().trim()}\\@anthropic-ai\\claude-code\\bin\\claude.exe`
    : "claude";
  const args = [
    "-p",
    "--model", model,
    "--output-format", "json",
    "--no-session-persistence",
    "--tools", tools,
  ];
  if (tools) args.push("--allowedTools", tools);
  if (system) args.push("--system-prompt", system);
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  // Sin ANTHROPIC_API_KEY en el child: si quedara visible, el CLI la
  // preferiría sobre el token OAuth y cobraría créditos API en vez del plan.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const stdout = await new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      args,
      { env, maxBuffer: 16 * 1024 * 1024, timeout: 8 * 60 * 1000 },
      (err, out, errOut) => {
        if (err && !out) return reject(new Error(`claude CLI: ${err.message}${errOut ? `\n${errOut}` : ""}`));
        resolve(out);
      }
    );
    child.stdin.write(prompt);
    child.stdin.end();
  });
  const res = JSON.parse(stdout);
  if (res.is_error) throw new Error(`claude CLI devolvió error: ${String(res.result ?? res.subtype).slice(0, 300)}`);
  console.log(
    `[usage] claude-code: out=${res.usage?.output_tokens ?? "?"} tok` +
    ` → suscripción Max, $0 extra (equivalente API: $${(res.total_cost_usd ?? 0).toFixed(4)})`
  );
  return res;
}

// ── Costo real por llamada (visible en los logs de GitHub Actions) ───────────
// Precios claude-opus-4-8: $5/MTok input, $25/MTok output (thinking cuenta como
// output), cache write 1.25x, cache read 0.1x, web search $10/1,000 búsquedas.
function logUsage(label, usage) {
  if (!usage) return;
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cacheW = usage.cache_creation_input_tokens ?? 0;
  const cacheR = usage.cache_read_input_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  const usd =
    (inTok * 5 + cacheW * 6.25 + cacheR * 0.5 + outTok * 25) / 1e6 +
    searches * 0.01;
  console.log(
    `[usage] ${label}: in=${inTok} cacheW=${cacheW} cacheR=${cacheR} out=${outTok}` +
    `${searches ? ` searches=${searches}` : ""} → $${usd.toFixed(4)} USD`
  );
}

// ── Construcción del prompt ──────────────────────────────────────────────────
function fmt(v, d = 2) {
  return v == null ? "s/d" : Number(v).toFixed(d);
}

// HECHOS NOTABLES calculados EN CÓDIGO — el redactor debe citarlos textual.
// Nacieron el 23-jul-2026: el peso abrió ~15 centavos arriba y el view dio
// solo el porcentaje; un trader lo cuenta en centavos, no en puntos base.
// Regla del usuario: ≥5¢ textual en summary/body; ≥10¢ además VA EN EL TITULAR.
// Devuelve también flags para el validador determinístico post-generación.
function computeNotables(m) {
  const out = { lines: [], any: false, titular: false, warning: null };
  if (!m) return out;
  const spot = m.usdmxnSpot ?? m.usdmxn;
  if (spot == null) return out;

  // Cierre previo EXPLÍCITO del API (verificado diario-vs-intradía desde el
  // 24-jul-2026: una vela diaria congelada de Yahoo hizo publicar "sube 9
  // centavos" cuando el peso amaneció plano). Fallback a la derivación vieja
  // por si un respaldo corre contra un /api/market aún no redeployado.
  let prevClose = m.usdmxnPrevClose ?? null;
  let verified = prevClose != null ? m.usdmxnPrevVerified !== false : false;
  if (prevClose == null && m.usdmxnChg != null) {
    prevClose = spot / (1 + m.usdmxnChg / 100);
    verified = true;
  }

  if (prevClose != null && verified) {
    const cents = (spot - prevClose) * 100;
    const abs = Math.abs(cents);
    if (abs >= 5) {
      const dir = cents > 0 ? "SUBE" : "BAJA";
      const peso = cents > 0 ? "el peso pierde" : "el peso gana";
      const mag = abs >= 20
        ? "MOVIMIENTO FUERTE, es LA historia del día — VA EN EL TITULAR"
        : abs >= 10
          ? "movimiento importante — VA EN EL TITULAR"
          : "movimiento a destacar";
      out.lines.push(`USD/MXN ${dir} ${abs.toFixed(0)} centavos vs el cierre previo (${fmt(prevClose, 4)} → ${fmt(spot, 4)}), ${peso} — ${mag}`);
      out.any = true;
      if (abs >= 10) out.titular = true;
    }
  } else {
    // Antes cifra omitida que cifra falsa (política de veracidad del sitio).
    out.warning =
      "El CIERRE PREVIO del USD/MXN no se pudo verificar hoy (fuentes de datos en desacuerdo o incompletas). " +
      "PROHIBIDO afirmar cuánto subió o bajó vs el cierre previo (ni en centavos ni en %); " +
      "describe el NIVEL actual del spot y apóyate en soporte/resistencia.";
  }
  if (m.mxnR1 != null && spot > m.mxnR1) {
    out.lines.push(`ROMPIÓ la resistencia de 10 días (${fmt(m.mxnR1, 4)}) — cotiza ${((spot - m.mxnR1) * 100).toFixed(0)} centavos arriba`);
    out.any = true;
  } else if (m.mxnR1 != null && (m.mxnR1 - spot) * 100 <= 5) {
    out.lines.push(`A ${((m.mxnR1 - spot) * 100).toFixed(0)} centavos de la resistencia de 10 días (${fmt(m.mxnR1, 4)})`);
    out.any = true;
  }
  if (m.mxnS1 != null && spot < m.mxnS1) {
    out.lines.push(`PERFORÓ el soporte de 10 días (${fmt(m.mxnS1, 4)}) — cotiza ${((m.mxnS1 - spot) * 100).toFixed(0)} centavos abajo`);
    out.any = true;
  } else if (m.mxnS1 != null && (spot - m.mxnS1) * 100 <= 5) {
    out.lines.push(`A ${((spot - m.mxnS1) * 100).toFixed(0)} centavos del soporte de 10 días (${fmt(m.mxnS1, 4)})`);
    out.any = true;
  }
  return out;
}

// ── ÁNGULOS DEL DÍA — ranking por inusualidad estadística (2026-07-28) ───────
// Problema que resuelve: 4 views seguidos abrieron con el crudo (23→28 jul).
// El redactor elegía el tema por inercia; ahora el CÓDIGO calcula qué movimiento
// de hoy es más inusual contra su propia historia de ~3 meses (z robusto: valor
// de hoy / escala MAD de su serie, mismo espíritu que riskScore) y el prompt
// exige liderar con el #1. Los eventos de calendario de hoy/mañana también
// compiten como ángulo (un FOMC hoy gana casi siempre).
function median(arr) {
  const s = arr.filter((v) => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function madScale(arr) {
  const med = median(arr);
  if (med == null) return null;
  const dev = arr.filter((v) => v != null && isFinite(v)).map((v) => Math.abs(v - med));
  const m = median(dev);
  return m ? m * 1.4826 : null;
}
const diffsOf = (levels) => {
  if (!Array.isArray(levels)) return [];
  const out = [];
  for (let i = 1; i < levels.length; i++) {
    out.push(levels[i] != null && levels[i - 1] != null ? levels[i] - levels[i - 1] : null);
  }
  return out;
};

export function computeAngles(m, cal, todaySlug) {
  if (!m) return [];
  const angles = [];
  // Señales de retorno: z = % de hoy / escala MAD de su serie (centro 0, como
  // en riskScore). Se excluye el último punto de la serie (suele ser hoy mismo).
  const addRet = (label, today, series, unit = "%") => {
    if (today == null || !Array.isArray(series) || series.length < 35) return;
    const scale = madScale(series.slice(0, -1));
    if (!scale) return;
    const z = today / scale;
    angles.push({ label, z, desc: `${label} ${today >= 0 ? "+" : ""}${today.toFixed(unit === "bp" ? 0 : 2)}${unit} hoy (z ${z >= 0 ? "+" : ""}${z.toFixed(1)})` });
  };
  // Señales de nivel (VIX/MOVE/10Y): el "movimiento de hoy" es el cambio del
  // nivel; su historia son los cambios diarios de la serie.
  const addLvl = (label, series, { toUnit = 1, unit = " pts" } = {}) => {
    if (!Array.isArray(series) || series.length < 35) return;
    const d = diffsOf(series);
    const today = d[d.length - 1];
    if (today == null) return;
    const scale = madScale(d.slice(0, -1));
    if (!scale) return;
    const z = today / scale;
    const shown = today * toUnit;
    angles.push({ label, z, desc: `${label} ${shown >= 0 ? "+" : ""}${shown.toFixed(unit === "bp" ? 0 : 2)}${unit} hoy (z ${z >= 0 ? "+" : ""}${z.toFixed(1)})` });
  };
  addRet("USD/MXN", m.usdmxnChg, m.usdmxnChgSeries);
  addRet("S&P futuros", m.spxFutChg, m.spxChgSeries);
  addRet("WTI (crudo)", m.wtiChg, m.wtiChgSeries);
  addRet("Oro", m.goldChg, m.goldChgSeries);
  addRet("Bitcoin", m.btcChg, m.btcChgSeries);
  addRet("IPC México", m.ipcChg, m.ipcChgSeries);
  addLvl("VIX", m.vixSeries);
  addLvl("MOVE", m.moveSeries);
  // ^TNX a veces viene como 4.64 (%) y a veces ×10 (46.4) — normaliza a bp.
  if (Array.isArray(m.us10ySeries) && m.us10ySeries.length) {
    const lvl = median(m.us10ySeries);
    addLvl("10Y UST", m.us10ySeries, { toUnit: lvl > 20 ? 10 : 100, unit: "bp" });
  }
  angles.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const top = angles.slice(0, 5);
  // Eventos de alto impacto de HOY (y mañana) compiten como ángulo con
  // prioridad pseudo-z fija: un FOMC hoy le gana a casi cualquier movimiento.
  if (Array.isArray(cal) && todaySlug) {
    const tomorrow = ymd(new Date(new Date(`${todaySlug}T12:00:00Z`).getTime() + 86400000));
    for (const e of cal.filter((e) => e.impact === "high")) {
      if (e.date === todaySlug) top.unshift({ label: `EVENTO HOY: ${e.event_es}`, z: 2.6, desc: `EVENTO HOY: ${e.flag ?? ""} ${e.event_es} (alto impacto — si ya se publicó, el resultado está en el pulso)` });
      else if (e.date === tomorrow) top.push({ label: `EVENTO MAÑANA: ${e.event_es}`, z: 1.6, desc: `EVENTO MAÑANA: ${e.flag ?? ""} ${e.event_es} (alto impacto — el mercado ya opera con ese evento enfrente)` });
    }
  }
  return top.slice(0, 5);
}

// ── VETO TEMÁTICO — anti-monotonía de titulares (2026-07-28) ─────────────────
// Un tema que abrió ≥2 de los últimos 3 titulares NO puede volver a liderar
// hoy, salvo movimiento FUERTE (umbral en código) o evento de calendario de
// alto impacto que sea de ese tema. "peso/USD-MXN" no es un bucket a propósito:
// es el sujeto del producto y aparece legítimamente casi a diario.
const THEME_BUCKETS = [
  ["crudo",       /crudo|petr[oó]l|WTI|barril|OPEP|crude|\boil\b/i],
  ["geopolítica", /ir[aá]n|iran|arancel|tariff|guerra|sanci[oó]n|conflicto|escalada|geopol/i],
  ["Fed/tasas",   /\bfed\b|fomc|powell|dot ?plot/i],
  ["bonos/10Y",   /10\s?y|10 años|10-year|treasur|curva|\bbonos?\b|yield/i],
  ["inflación",   /\bcpi\b|inflaci[oó]n|\bpce\b|inflation/i],
  ["Banxico",     /banxico/i],
  ["bolsa",       /s&p|nasdaq|wall street|bolsa|futuros|equities/i],
  ["cripto",      /bitcoin|\bbtc\b|cripto|crypto/i],
  ["oro",         /\boro\b|\bgold\b/i],
];
// Umbrales FUERTE: si el tema se movió así de fuerte HOY, puede repetir titular.
const THEME_FUERTE = {
  "crudo":     (m) => Math.abs(m?.wtiChg ?? 0) >= 4,
  "bolsa":     (m) => Math.abs(m?.spxFutChg ?? 0) >= 1.5,
  "cripto":    (m) => Math.abs(m?.btcChg ?? 0) >= 5,
  "oro":       (m) => Math.abs(m?.goldChg ?? 0) >= 2.5,
  "bonos/10Y": (m) => {
    const d = diffsOf(m?.us10ySeries ?? []);
    const last = d[d.length - 1];
    if (last == null) return false;
    const lvl = median(m.us10ySeries);
    return Math.abs(last * (lvl > 20 ? 10 : 100)) >= 8; // ≥8bp
  },
};
function themesOf(title) {
  return THEME_BUCKETS.filter(([, re]) => re.test(title || "")).map(([k]) => k);
}
// prevs = views previos (el más reciente primero); m = market; cal = calendario.
export function computeVetoes(prevs, m, cal, todaySlug) {
  const last3 = (prevs ?? []).slice(0, 3);
  if (last3.length < 2) return [];
  const counts = {};
  for (const p of last3) for (const t of new Set(themesOf(p.title))) counts[t] = (counts[t] ?? 0) + 1;
  const eventsToday = (Array.isArray(cal) ? cal : []).filter((e) => e.impact === "high" && e.date === todaySlug);
  const vetoes = [];
  for (const [theme, count] of Object.entries(counts)) {
    if (count < 2) continue;
    if (THEME_FUERTE[theme]?.(m)) continue; // movimiento fuerte hoy → puede repetir
    // Evento de alto impacto HOY del mismo tema → exento (FOMC hoy lidera aunque
    // "Fed/tasas" haya abierto los últimos titulares).
    const re = THEME_BUCKETS.find(([k]) => k === theme)?.[1];
    if (re && eventsToday.some((e) => re.test(e.event_es ?? "") || re.test(e.event_en ?? ""))) continue;
    vetoes.push({ theme, count, n: last3.length });
  }
  return vetoes;
}

// Correlación de Pearson entre los últimos `win` puntos de dos series alineadas
// desde el final (aprox: los días festivos pueden desfasar 1 punto — suficiente
// para un lente de contexto, no para claims de precisión).
function tailCorr(a, b, win = 20) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const n = Math.min(a.length, b.length, win);
  if (n < 12) return null;
  const xs = a.slice(-n), ys = b.slice(-n);
  const pairs = [];
  for (let i = 0; i < n; i++) if (xs[i] != null && ys[i] != null) pairs.push([xs[i], ys[i]]);
  if (pairs.length < 12) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let num = 0, dx = 0, dy = 0;
  for (const [x, y] of pairs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

function dataDigest(data, scoreInfo, notables, extras = {}) {
  const { market: m, rates: r, curve: c, calendar: cal } = data;
  const pct = (v) => (v == null ? "" : ` (${v >= 0 ? "+" : ""}${v.toFixed(2)}%)`);
  const lines = [];

  if (m) {
    lines.push("MERCADO:");
    // Con cierre previo no verificado, el % de cambio también es sospechoso —
    // no se le muestra al redactor para que no lo cite.
    lines.push(`USD/MXN: ${fmt(m.usdmxnSpot ?? m.usdmxn, 4)}${notables?.warning ? "" : pct(m.usdmxnChg)} (spot en vivo; cítalo EXACTO con 2 decimales)`);
    // Igual que USD/MXN: sin cierre previo verificado, el % no se le muestra
    // al redactor (flag === false; undefined = API vieja, conserva el %).
    lines.push(`EUR/MXN: ${fmt(m.eurmxn, 4)}${m.eurmxnPrevVerified === false ? "" : pct(m.eurmxnChg)}`);
    lines.push(`DXY: ${fmt(m.dxy)}`);
    lines.push(`S&P 500: ${fmt(m.spx, 0)}${pct(m.spxChg)} · Futuros ES${pct(m.spxFutChg)} (premarket)`);
    lines.push(`IPC México: ${fmt(m.ipc, 0)}${pct(m.ipcChg)}`);
    lines.push(`VIX: ${fmt(m.vix)} · MOVE: ${fmt(m.move)}`);
    lines.push(`US 10Y: ${fmt(m.us10y)}%${pct(m.us10yChg)}`);
    lines.push(`Oro: ${fmt(m.gold, 0)}${pct(m.goldChg)} · WTI: ${fmt(m.wti)}${pct(m.wtiChg)}`);
    lines.push(`Bitcoin: ${fmt(m.btc, 0)}${pct(m.btcChg)}`);
    lines.push(`Vol. realizada USD/MXN: ${fmt(m.mxnVol)}% · Soporte ${fmt(m.mxnS1, 4)} / Resistencia ${fmt(m.mxnR1, 4)}`);
  }
  // Dato no verificable: instrucción explícita de NO afirmar el movimiento.
  if (notables?.warning) {
    lines.push("");
    lines.push(`⚠ DATO NO VERIFICABLE HOY: ${notables.warning}`);
  }
  // Hechos notables (ver computeNotables): van al digest Y al validador.
  if (notables?.lines?.length) {
    lines.push("");
    lines.push("HECHOS NOTABLES DE HOY (calculados en código, verificados):");
    notables.lines.forEach((n) => lines.push(`- ${n}`));
    lines.push(
      `REGLA DE MOVIMIENTOS (obligatoria): el hecho más importante de esta lista debe aparecer TEXTUALMENTE, con su cifra en CENTAVOS, en el summary y en el body ("sube 15 centavos", "a 3 centavos de la resistencia") — el porcentaje solo puede acompañar, nunca sustituir. Los traders hablan en centavos. En body_en usa "centavos" igual (15 centavos ≈ 0.15 pesos). Si un hecho está marcado "VA EN EL TITULAR" (movimiento ≥10 centavos), la cifra en centavos DEBE aparecer también en title_es y title_en — sin excepción.`
    );
  }

  // Ranking de ángulos: el titular nace del movimiento más INUSUAL del día,
  // no del tema de moda de la semana (4 views seguidos abrieron con crudo).
  if (extras.angles?.length) {
    lines.push("");
    lines.push("ÁNGULOS DEL DÍA (calculados en código, ordenados por lo INUSUAL del movimiento contra su propia historia de ~3 meses; z = veces su día típico):");
    extras.angles.forEach((a, i) => lines.push(`${i + 1}. ${a.desc}`));
    lines.push(
      "REGLA DE ÁNGULOS: el titular y el arranque del body nacen del ángulo #1 que NO esté vetado (ver VETO TEMÁTICO si existe). Los demás ángulos son secundarios: tejerlos como contexto, no como segundo titular. Un |z| < 1 significa día tranquilo en esa señal — si todos son chicos, el ángulo es el evento del calendario o la historia del pulso."
    );
  }

  // Lente cuant: contexto secundario con datos que casi nadie cita en el nicho
  // (correlación rodante y posicionamiento COT). Máximo un lente por view.
  const lente = [];
  if (m) {
    const corr = tailCorr(m.usdmxnChgSeries, diffsOf(m.us10ySeries ?? []));
    if (corr != null) {
      lente.push(`Correlación 20d peso↔10Y: ${corr >= 0 ? "+" : ""}${corr.toFixed(2)} (${Math.abs(corr) < 0.25 ? "descorrelacionados este mes" : corr > 0 ? "el peso se debilita cuando sube la tasa de EE.UU." : "el peso se FORTALECE aun con la tasa de EE.UU. subiendo — inusual"})`);
    }
  }
  if (extras.cot) {
    const c2 = extras.cot;
    lente.push(
      `Especuladores en Chicago (COT de la CFTC al ${c2.date}): netos ${c2.net >= 0 ? "LARGOS" : "CORTOS"} en el peso por ${Math.abs(c2.net).toLocaleString("en-US")} contratos${c2.usdBn ? ` (≈${c2.usdBn} mil millones USD)` : ""}, ${c2.dNet != null ? `${c2.dNet >= 0 ? "sumaron +" : "recortaron "}${c2.dNet.toLocaleString("en-US")} en la semana` : "cambio semanal s/d"}`
    );
  }
  if (lente.length) {
    lines.push("");
    lines.push("LENTE CUANT (contexto secundario verificado, calculado en código — usa MÁXIMO UNO por view y solo si suma al argumento; el COT es dato del martes publicado el viernes, cítalo como posicionamiento, no como flujo de hoy):");
    lente.forEach((l) => lines.push(`- ${l}`));
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

// Fecha en que madura una postura: slug + n días hábiles (los forward returns
// del marcador evalúan a 5 días hábiles).
function addBusinessDays(slug, n) {
  const d = new Date(`${slug}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  return ymd(d);
}

function userPrompt(digest, dateStr, score, prev, todaySlug, pulse, olderPrevs, record, vetoes, prior) {
  // Pulso web del instante: datos publicados esta mañana + noticias frescas.
  const pulseBlock = pulse
    ? `
PULSO DE ESTA MAÑANA (búsqueda web hecha hace MINUTOS — datos y noticias verificados):
${pulse}

REGLA DEL PULSO: si un dato de alto impacto YA se publicó esta mañana (p.ej. el CPI de las 6:30), es LA noticia del día — intégralo con su cifra exacta (actual vs consenso) en el titular, summary, body y watch según amerite, y explica cómo lo está digiriendo el mercado (los precios del digest YA lo reflejan). Si el pulso dice que un dato AÚN no sale, trátalo como evento por delante. El pulso trae historias de FRENTES DISTINTOS ([MACRO-EU], [MÉXICO], [FLUJOS-EM], [GEOPOLÍTICA]) — elige como complemento la que mejor explique el día, no siempre la misma. Una historia [GEOPOLÍTICA] de alto impacto REAL (aranceles nuevos, escalada bélica, sanciones que muevan crudo/EM/peso) puede LIDERAR el titular aunque no sea un dato numérico — trátala con la seriedad de un dato duro y cita SOLO lo que el pulso confirma. Usa SOLO cifras que estén en el pulso o en el digest — jamás inventes un dato macro.
`
    : "";
  // Anti-monotonía temática: si un tema abrió ≥2 de los últimos 3 titulares y
  // hoy no se movió fuerte, no puede volver a liderar (el validador lo verifica).
  const vetoBlock = vetoes?.length
    ? `
VETO TEMÁTICO DE HOY (anti-monotonía, calculado en código):
${vetoes.map((v) => `- El tema "${v.theme}" abrió ${v.count} de los últimos ${v.n} titulares y HOY su movimiento NO califica como fuerte → PROHIBIDO que aparezca en title_es/title_en o que lidere el summary. Máximo una línea de seguimiento en el body (el lector diario agradece el hilo, no la repetición).${v.theme === "geopolítica" ? " Excepción ÚNICA: un hecho NUEVO de máxima gravedad confirmado hoy en el pulso (guerra declarada, arancel general anunciado HOY) — si la usas, que el body diga por qué amerita volver a liderar." : ""}`).join("\n")}
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
  // Memoria semanal compacta: los views previos al de ayer, solo para el
  // anti-repetición (los ciclos de ganchos/muletillas son semanales, no diarios).
  const weekBlock = olderPrevs?.length
    ? `
TITULARES Y POSTURAS DE LA SEMANA (anti-repetición — NO reutilices sus ganchos, metáforas ni verbos característicos, p.ej. si varios usan "manda(n)" o "enciende", tú usa otra cosa):
${olderPrevs.map((p) => `- ${p.slug} (score ${p.score}${p.bias ? `, ${p.bias}` : ""}): "${p.title}"`).join("\n")}
`
    : "";
  // Rendición de cuentas: el marcador público de posturas (/indice) es parte
  // del producto — el redactor debe conocer su propio récord y reconocer en el
  // texto cómo le fue a la última postura que maduró.
  const recordBlock = record
    ? `
TU RÉCORD DE POSTURAS (marcador público en /indice, evaluado contra el USD/MXN real a 5 días hábiles — son datos, no opinión):
- Global: ${record.hits} aciertos de ${record.resolved} posturas resueltas.
- Última postura resuelta: la del ${record.last.slug} (${record.last.bias}${record.last.condicion ? ` — condición: "${record.last.condicion}"` : ""}) ${record.last.verdict ? "SE VALIDÓ" : "SE INVALIDÓ"}: el USD/MXN se movió ${record.last.mxn5 >= 0 ? "+" : ""}${Number(record.last.mxn5).toFixed(2)}% en los 5 días hábiles siguientes (maduró el ${addBusinessDays(record.last.slug, 5)}).
REGLA DE RENDICIÓN DE CUENTAS: si esa última postura maduró hoy (${todaySlug}) o el día hábil anterior, reconócelo EXPLÍCITAMENTE en una línea del body ("la postura ${record.last.bias} del ${record.last.slug} se ${record.last.verdict ? "validó" : "invalidó"}...") — presumir aciertos y admitir fallos con la misma naturalidad es el sello de la casa. Si maduró antes, no la menciones. El récord global cítalo SOLO si suma al argumento del día (jamás como muletilla diaria).
`
    : "";
  return `Hoy es ${dateStr}. Con base EXCLUSIVAMENTE en estos datos en vivo, escribe el Pre-Market de hoy.

${digest}
${riskState(score) === "RISK-OFF" ? `
DATO HISTÓRICO OBLIGATORIO (hoy la banda es RISK-OFF): en el backtest de 5 años del índice (~1,180 días, con carry y curva históricos reales), tras un día en RISK-OFF el peso se APRECIÓ en los 5 días hábiles siguientes el 76% de las veces (retorno promedio del USD/MXN −0.76%, y −1.58% a 10 días) contra un 57% de base. Intégralo en el body como contexto: los extremos de pánico históricamente han sido zona de oportunidad para el peso, no momento de huir — enmarcado como estadística histórica del propio índice, JAMÁS como promesa ni recomendación.
` : ""}${pulseBlock}${vetoBlock}${prevBlock}${weekBlock}${recordBlock}${priorPromptBlock(prior)}
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

// ── Memoria: los últimos views (continuidad + anti-repetición semanal) ──────
// Intenta el filesystem (GitHub Actions tiene el checkout) y cae a raw
// GitHub (Vercel). Camina hacia atrás hasta 11 días saltando fin de semana y
// junta hasta `want` views: el más reciente da la continuidad detallada y el
// resto alimenta el anti-repetición (con 1 solo día de memoria, los ciclos
// SEMANALES de ganchos y muletillas se escapaban — "mandan" reapareció).
// Best-effort: si nada aparece, el view se genera sin memoria (como antes).
async function fetchPrevViews(slug, want = 5) {
  const out = [];
  const d = new Date(`${slug}T12:00:00Z`);
  for (let i = 0; i < 11 && out.length < want; i++) {
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
      out.push({
        slug: prevSlug,
        title: data.title_es ?? "",
        score: data.score ?? "s/d",
        summary: data.summary_es ?? "",
        headings: [...content.matchAll(/^### (.+)$/gm)].map((m) => m[1]),
        postura: content.match(/[^\n]*postura[^\n]*/i)?.[0]?.trim() ?? "",
        bias: data.postura_bias ?? null,
      });
    } catch {}
  }
  return out;
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
    const promptText = `Hoy es ${dateStr} y son las ${hora} en Ciudad de México (los datos económicos de EE.UU. se publican a las 8:30 ET = 6:30 CDMX; los de México a las 6:00 CDMX). Eres el asistente de investigación de un análisis pre-market de FX enfocado en USD/MXN.

PRIORIDAD #1 (gasta aquí tus primeras búsquedas): si el calendario espera un dato de alto impacto HOY y por la hora ya debió publicarse, consigue su RESULTADO — actual vs consenso vs previo. Busca en INGLÉS (los resultados salen primero en medios en inglés, p.ej. "US CPI June actual") y persiste con variantes hasta tenerlo. Eventos que el calendario esperaba estos días: ${hi}.

PRIORIDAD #2 (con el presupuesto restante): historias de las últimas 12-18 horas en CUATRO FRENTES DISTINTOS — el análisis necesita variedad temática, no tres notas del mismo tema. Etiqueta cada bullet con su frente:
- [MACRO-EU] Fed, tasas, datos de EE.UU., Wall Street (1-2 hechos).
- [MÉXICO] Banxico, política/fiscal MX, Pemex, calificadoras, datos locales (1-2 hechos).
- [FLUJOS-EM] flujos a emergentes, carry, posicionamiento, otras divisas EM (1 hecho si hay).
- [GEOPOLÍTICA] SOLO eventos de ALTO impacto de mercado: aranceles nuevos o amenazados (p.ej. a Brasil, a China), escaladas bélicas (Irán, Rusia), sanciones que muevan crudo/EM/peso. La vara es alta: si no hay nada NUEVO y relevante para precios, escribe exactamente "[GEOPOLÍTICA] sin novedad relevante hoy" — no rellenes con notas tibias.

Devuelve SOLO un resumen factual en bullets etiquetados (máximo 350 palabras), sin preguntas ni ofertas de seguimiento. Reglas: SOLO hechos con número y hora; si un dato de hoy AÚN no se publica, dilo explícitamente ("CPI sale a las 6:30, aún no publicado"); cero opiniones; si no encuentras algo tras buscar, di "no confirmado" — jamás lo inventes.`;

    // Camino primario en Actions: Claude Code con la suscripción Max.
    // Si el CLI falla y hay API key, cae al SDK; si no, el view sale sin pulso.
    if (subscriptionMode()) {
      try {
        const res = await claudeCli(promptText, { tools: "WebSearch" });
        const text = (res.result ?? "").trim();
        return text || null;
      } catch (e) {
        console.error(`[gen] pulso vía claude-code falló: ${e?.message ?? e}`);
        if (!process.env.ANTHROPIC_API_KEY) return null;
        console.error("[gen] pulso: reintento por SDK (ANTHROPIC_API_KEY)");
      }
    }
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
      messages: [{ role: "user", content: promptText }],
    });
    logUsage("pulso", msg.usage);
    const text = (msg.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return text || null;
  } catch (e) {
    console.error(`[gen] pulso web falló (se genera sin él): ${e?.message ?? e}`);
    return null;
  }
}

// Récord del marcador de posturas (/indice) para la rendición de cuentas del
// redactor. Best-effort: sin él, el view sale sin ese bloque.
async function fetchPosturaRecord() {
  try {
    const { getAllPostsMeta } = await import("./posts.js");
    const { posturaRecord } = await import("./forwardReturns.js");
    const rec = await posturaRecord(getAllPostsMeta().slice(0, 20));
    if (!rec?.resolved) return null;
    const last = rec.rows.find((r) => r.verdict != null);
    if (!last) return null;
    return { hits: rec.hits, resolved: rec.resolved, last };
  } catch (e) {
    console.error(`[gen] récord de posturas no disponible (sigo sin él): ${e?.message ?? e}`);
    return null;
  }
}

export async function generateDailyView(data, dateStr, slug) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const scoreInfo = computeRiskScore(data);
  const notables = computeNotables(data.market);
  // Auditoría del insumo más delicado del view (incidente 24-jul-2026):
  console.log(
    `[gen] USD/MXN spot=${data.market?.usdmxnSpot ?? "s/d"} prevClose=${data.market?.usdmxnPrevClose ?? "s/d"} ` +
    `verificado=${data.market?.usdmxnPrevVerified ?? "s/d"} chg=${data.market?.usdmxnChg?.toFixed?.(2) ?? "s/d"}%` +
    (notables.warning ? " → CLAIM DE MOVIMIENTO SUPRIMIDO (no verificable)" : "")
  );
  const todaySlug = slug ?? new Date().toISOString().slice(0, 10);
  // Memoria semanal + pulso web del instante + récord de posturas + COT, en
  // paralelo (todos best-effort: null/[] si fallan, el view se genera igual).
  const [prevs, pulse, record, cot] = await Promise.all([
    fetchPrevViews(todaySlug).catch(() => []),
    fetchMorningPulse(anthropic, data, dateStr),
    fetchPosturaRecord(),
    (async () => {
      const { fetchCotMxn } = await import("./cot.js");
      return fetchCotMxn({ usdmxn: data.market?.usdmxnSpot ?? data.market?.usdmxn });
    })().catch(() => null),
  ]);
  const prev = prevs[0] ?? null;
  const olderPrevs = prevs.slice(1);
  // Ángulos por inusualidad estadística + veto temático anti-monotonía.
  const angles = computeAngles(data.market, data.calendar, todaySlug);
  const vetoes = computeVetoes(prevs, data.market, data.calendar, todaySlug);
  const digest = dataDigest(data, scoreInfo, notables, { angles, cot });
  // Prior cuantitativo de la postura (lib/posturaPrior.js): los cierres del
  // USD/MXN se reconstruyen del spot + la serie de cambios diarios que ya trae
  // /api/market (sin fetch extra) para calcular el estiramiento vs MA20/ATR14.
  const prior = (() => {
    try {
      const chg = data.market?.usdmxnChgSeries ?? [];
      let p = data.market?.usdmxnSpot ?? data.market?.usdmxn;
      if (!p || chg.length < 21) return computePosturaPrior({ band: riskState(scoreInfo.score), stretch: null });
      const closes = [p];
      for (let i = chg.length - 1; i >= 0; i--) { p = p / (1 + chg[i] / 100); closes.unshift(p); }
      const stretch = computeStretch(closes);
      return { ...computePosturaPrior({ band: riskState(scoreInfo.score), stretch }), stretch };
    } catch { return null; }
  })();
  if (prev) console.log(`[gen] memoria: view de ${prev.slug} cargado ("${prev.title}") + ${olderPrevs.length} más para anti-repetición`);
  if (record) console.log(`[gen] récord de posturas: ${record.hits}/${record.resolved} · última ${record.last.slug} ${record.last.verdict ? "VALIDADA" : "INVALIDADA"} (mxn5 ${record.last.mxn5})`);
  if (angles.length) console.log(`[gen] ángulos del día: ${angles.map((a, i) => `${i + 1}. ${a.label} (z ${a.z.toFixed(1)})`).join(" · ")}`);
  if (vetoes.length) console.log(`[gen] veto temático: ${vetoes.map((v) => `"${v.theme}" (${v.count}/${v.n} titulares)`).join(" · ")}`);
  if (cot) console.log(`[gen] COT MXN al ${cot.date}: net ${cot.net} (Δ ${cot.dNet})`);
  if (prior) console.log(`[gen] prior de postura: ${prior.bias} ${prior.fuerza} (stretch ${prior.stretch?.toFixed?.(2) ?? "s/d"}) — ${prior.señal}`);
  if (pulse) console.log(`[gen] pulso web cargado (${pulse.length} chars):\n${pulse}`);

  // Validador determinístico post-generación: las reglas DURAS del prompt se
  // verifican en CÓDIGO (el prompt solo garantiza "casi siempre"). Si el
  // borrador viola alguna → UN reintento con el feedback exacto; si aun así
  // falla, se publica igual (jamás bloquear el correo de las 7am por estilo)
  // y queda el detalle en el log.
  const centsRe = /\d+\s*centavos/i;
  const validateView = (v) => {
    const problems = [];
    if (notables.titular) {
      if (!centsRe.test(v.title_es ?? "")) problems.push('title_es DEBE incluir la cifra en centavos (hoy el movimiento es ≥10 centavos: "VA EN EL TITULAR").');
      if (!centsRe.test(v.title_en ?? "")) problems.push("title_en DEBE incluir la cifra en centavos (igual que title_es).");
    }
    if (notables.any) {
      if (!centsRe.test(v.summary_es ?? "")) problems.push("summary_es debe citar el movimiento con su cifra en centavos.");
      if (!centsRe.test(v.body_es ?? "")) problems.push("body_es debe citar el movimiento con su cifra en centavos.");
    }
    if (notables.warning) {
      // Día con cierre previo NO verificable: prohibido afirmar movimiento.
      // (Los "a X centavos de la resistencia/soporte" sí son legítimos — por
      // eso el patrón exige un verbo de movimiento antes de la cifra.)
      const moveEs = /(sube|baja|cede|gana|pierde|avanza|retrocede|salta|suma|se deprecia|se aprecia)\s+(?:casi\s+|más de\s+|unos\s+)?\d+\s*centavos/i;
      const moveEn = /(sheds|gains|loses|rises|falls|adds|climbs|drops|jumps)\s+(?:almost\s+|nearly\s+|some\s+)?\d+\s*centavos/i;
      for (const [field, re] of [["title_es", moveEs], ["summary_es", moveEs], ["body_es", moveEs], ["title_en", moveEn], ["summary_en", moveEn], ["body_en", moveEn]]) {
        if (re.test(v[field] ?? "")) problems.push(`${field} afirma un movimiento en centavos, pero HOY el cierre previo NO es verificable — elimina toda afirmación de cuánto se movió vs el cierre.`);
      }
    }
    // Veto temático: el tema que abrió ≥2 de los últimos 3 titulares no puede
    // volver al titular hoy (geopolítica se excluye: su excepción de gravedad
    // es un juicio editorial que el código no puede calificar).
    for (const veto of vetoes) {
      if (veto.theme === "geopolítica") continue;
      const re = THEME_BUCKETS.find(([k]) => k === veto.theme)?.[1];
      if (!re) continue;
      if (re.test(v.title_es ?? "") || re.test(v.title_en ?? "")) {
        problems.push(`El titular abre con el tema VETADO "${veto.theme}" (abrió ${veto.count} de los últimos ${veto.n} titulares y hoy no se movió fuerte) — reescribe title_es y title_en desde otro ángulo del día; ese tema va máximo en una línea del body.`);
      }
    }
    if (!/\d/.test(v.postura_condicion ?? "")) problems.push("postura_condicion debe incluir un nivel o dato NUMÉRICO concreto (una condición falsable).");
    if (((v.summary_es ?? "").match(/\d+(?:[.,]\d+)?/g) || []).length < 2) problems.push("summary_es debe traer al menos 2 cifras concretas.");
    if ((v.body_es ?? "").split(/\s+/).length < 300) problems.push("body_es quedó corto — el formato pide 400-550 palabras.");
    return problems;
  };

  // Hasta 3 intentos por ERRORES (JSON malformado/truncado es estocástico) +
  // 1 posible reintento del VALIDADOR (por eso el tope es 4).
  // Capa 1: structured outputs (JSON garantizado por el API). Si el modelo
  // rechazara output_config (400), capa 2: prompt puro + parse, como antes.
  let structured = true;
  // En Actions (token de suscripción presente) el redactor corre por Claude
  // Code; si el CLI falla y hay API key, los intentos restantes usan el SDK.
  let useCli = subscriptionMode();
  let view = null, lastErr = null;
  let fixNotes = "";          // feedback del validador para el reintento
  let validationRetries = 1;  // solo UN reintento por reglas de formato
  for (let attempt = 1; attempt <= 4 && !view; attempt++) {
    let draft = null;
    try {
      const prompt =
        userPrompt(digest, dateStr, scoreInfo.score, prev, todaySlug, pulse, olderPrevs, record, vetoes, prior) + fixNotes;
      if (useCli) {
        const res = await claudeCli(prompt, { system: SYSTEM, schema: VIEW_SCHEMA, tools: "", model: "claude-opus-4-8" });
        draft = res.structured_output ?? JSON.parse(res.result);
      } else {
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
          messages: [{ role: "user", content: prompt }],
        };
        if (structured) {
          req.output_config = { format: { type: "json_schema", schema: VIEW_SCHEMA } };
        }
        const msg = await anthropic.messages.create(req);
        logUsage(`redactor (intento ${attempt})`, msg.usage);
        if (msg.stop_reason === "max_tokens") {
          throw new Error("respuesta truncada (stop_reason=max_tokens)");
        }
        let text = msg.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
        text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        draft = JSON.parse(text);
      }
    } catch (e) {
      lastErr = e;
      if (useCli) {
        // El CLI falló (token vencido, límite del plan, binario ausente…):
        // los intentos que quedan van por el SDK si hay API key.
        console.error(`[gen] intento ${attempt} vía claude-code falló: ${e?.message ?? e}`);
        if (process.env.ANTHROPIC_API_KEY) {
          useCli = false;
          console.error("[gen] redactor: cambio al SDK (ANTHROPIC_API_KEY) para los reintentos");
        }
      } else if (structured && e?.status === 400) {
        structured = false; // el modelo no acepta output_config → modo legacy
        console.error(`[gen] intento ${attempt}: output_config rechazado (400) — reintento sin structured outputs`);
      } else {
        console.error(`[gen] intento ${attempt} falló: ${e?.message ?? e}`);
      }
      continue;
    }
    // Validación determinística de las reglas duras del formato
    const problems = validateView(draft);
    if (problems.length && validationRetries > 0) {
      validationRetries--;
      console.log(`[gen] validador: ${problems.length} regla(s) sin cumplir — reintento con feedback:\n- ${problems.join("\n- ")}`);
      fixNotes =
        `\n\nCORRECCIONES OBLIGATORIAS — tu borrador anterior violó estas reglas duras del formato; entrégalo de nuevo corrigiéndolas TODAS sin bajar la calidad del resto:\n- ${problems.join("\n- ")}`;
      continue;
    }
    if (problems.length) {
      console.error(`[gen] validador: quedan ${problems.length} regla(s) tras el reintento — se publica igual: ${problems.join(" | ")}`);
    } else {
      console.log(fixNotes ? "[gen] validador: reintento corrigió todas las reglas ✓" : "[gen] validador: reglas duras OK a la primera ✓");
    }
    view = draft;
  }
  if (!view) throw lastErr;

  // El score es determinístico — siempre gana el calculado.
  view.score = scoreInfo.score;
  // Banda CONGELADA al publicar. Hasta el 21-ago-2026 la banda no se guardaba y
  // /indice la recalculaba con riskBand() en cada revalidación (cada hora), o
  // sea con los cortes de HOY sobre scores de AYER. Cuando los cortes cambiaron
  // el 2026-07-13 (29/48/72 → 32/49/67), tres views publicados como
  // CONSTRUCTIVE pasaron a mostrarse como RISK-ON sin que se moviera un solo
  // dato de mercado — contradiciendo el "nada se edita después" que el propio
  // sitio afirma. Con la banda en el front-matter, lo publicado queda publicado.
  view.band = riskState(scoreInfo.score);
  view.band_cuts = BANDS.map((b) => b.max).join("/"); // qué cortes regían ese día
  view.support = data.market?.mxnS1 ?? (Number(view.support) || null);
  view.resistance = data.market?.mxnR1 ?? (Number(view.resistance) || null);
  // Se persiste en el front-matter para dibujar el gauge + desglose en el sitio.
  view.signals = scoreInfo.breakdown.map((b) => ({ label: b.label, sub: b.sub, w: b.w }));
  // Prior cuantitativo persistido: permite auditar redactor vs modelo (¿el
  // criterio editorial suma sobre la estadística base?) en el marcador.
  if (prior) {
    view.prior_bias = prior.bias;
    view.prior_fuerza = prior.fuerza;
    if (prior.stretch != null && isFinite(prior.stretch)) view.stretch = +prior.stretch.toFixed(2);
  }
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
