// scripts/lib/histScore.mjs
// Réplica CANÓNICA de lib/riskScore.js para trabajo histórico, más las
// descargas de las series que la alimentan.
//
// Por qué existe: lib/riskScore.js espera el objeto `d` que arma /api/market en
// vivo (market/rates/curve anidados). Para reconstruir el score de un día de
// 2009 hay que alimentar la misma matemática con series históricas, y eso pide
// una capa aparte.
//
// Por qué está AQUÍ y no copiada en cada script: `rollingLevels` ya nos enseñó
// qué pasa cuando una función se copia en vez de importarse — el correo
// publicaba niveles de 10 días y /analisis de 20 bajo la misma etiqueta durante
// meses (lessons.md, 2026-08-21). Cualquier script nuevo de validación importa
// de aquí.
//
// SI CAMBIAS lib/riskScore.js, cambias esto en el mismo commit.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── La matemática, idéntica a lib/riskScore.js ───────────────────────────────
export const DYN_N = 60;
export const DYN_K = 1.1;
export const DYN = {
  vix:    { anchor: 17.5, sign: -1, minScale: 4.4 },
  mxn:    { anchor: 0,    sign: -1 },
  spx:    { anchor: 0,    sign:  1 },
  mxnvol: { anchor: 9,    sign: -1, minScale: 4.1 },
  move:   { anchor: 100,  sign: -1, minScale: 28 },
  btc:    { anchor: 0,    sign:  1 },
  gold:   { anchor: 0,    sign: -1 },
};
export const RAMP = { carry: { at0: 0, at100: 7 }, curve: { at0: -0.5, at100: 1.0 } };
export const WEIGHTS = { vix: 20, mxn: 18, spx: 15, carry: 10, mxnvol: 10, move: 8, btc: 7, curve: 7, gold: 5 };
export const KEYS = Object.keys(WEIGHTS);
export const BAND_CUTS = { off: 32, def: 49, con: 67 };

export const bandOf = (s) =>
  s <= BAND_CUTS.off ? "RISK-OFF" : s <= BAND_CUTS.def ? "DEFENSIVE" : s <= BAND_CUTS.con ? "CONSTRUCTIVE" : "RISK-ON";

export const median = (a) => {
  const s = [...a].sort((x, y) => x - y), n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
export const madScale = (w) => {
  const m = median(w);
  return 1.4826 * median(w.map((v) => Math.abs(v - m)));
};
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lin = (v, at0, at100) => clamp(((v - at0) / (at100 - at0)) * 100, 0, 100);

export function dynSub(value, window, key) {
  const cfg = DYN[key];
  if (!cfg || value == null || !isFinite(value)) return null;
  const w = window.filter((x) => x != null && !isNaN(x)).slice(-DYN_N);
  if (w.length < 30) return null;
  const scale = Math.max(madScale(w), cfg.minScale ?? 0);
  if (!scale || !isFinite(scale)) return null;
  return 100 / (1 + Math.exp(-DYN_K * cfg.sign * ((value - cfg.anchor) / scale)));
}

// Compuesto con renormalización: una señal ausente NO cuenta, exactamente como
// hace lib/riskScore.js con `continue`. Es lo que permite reconstruir años en
// los que Bitcoin todavía no existía sin inventarle un valor.
export function composite(subs, weights = WEIGHTS) {
  let sum = 0, wsum = 0;
  for (const k of Object.keys(weights)) {
    const v = subs[k];
    if (v == null || !isFinite(v)) continue;
    sum += v * weights[k];
    wsum += weights[k];
  }
  if (!wsum) return { score: null, wsum: 0 };
  return { score: Math.round(sum / wsum), wsum };
}

// ── Descargas ────────────────────────────────────────────────────────────────
export async function fetchFred(id) {
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`FRED ${id}: HTTP ${res.status}`);
  const map = new Map();
  for (const line of (await res.text()).trim().split("\n").slice(1)) {
    const [d, v] = line.split(",");
    const x = parseFloat(v);
    if (!isNaN(x)) map.set(d, x);
  }
  return map;
}

// period1=0 → historia COMPLETA, no los 5 años de research-posturas.
// gmtoffset aplicado: el bug que corrió un día toda la serie de MXN=X.
export async function fetchYahooFull(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=9999999999&interval=1d`;
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json())?.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const closes = r?.indicators?.quote?.[0]?.close ?? [];
      const off = r?.meta?.gmtoffset ?? 0;
      const map = new Map();
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c == null || isNaN(c)) continue;
        map.set(new Date((ts[i] + off) * 1000).toISOString().slice(0, 10), c);
      }
      if (!map.size) throw new Error("serie vacía");
      return map;
    } catch (e) {
      if (a === 2) throw new Error(`${symbol}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 900));
    }
  }
}

// ── Tasa objetivo de Banxico por fecha de decisión ───────────────────────────
// Extendida a 2005 para poder reconstruir el carry. Fuente: comunicados de
// Banxico. Antes de 2008 Banxico operaba con "el corto" y no con una tasa
// objetivo explícita; la serie de objetivo empieza en ene-2008, así que para
// 2005-2007 se usa la TIIE 28 como proxy documentado (FRED no publica una
// objetivo de Banxico anterior). Eso está declarado en el CSV como
// `carry_proxy=1` para que ningún análisis lo confunda con el dato duro.
export const BANXICO_STEPS = [
  ["2008-01-01", 7.50], ["2008-06-20", 7.75], ["2008-07-18", 8.00], ["2008-08-15", 8.25],
  ["2009-01-16", 7.75], ["2009-02-20", 7.50], ["2009-03-20", 6.75], ["2009-04-17", 6.00],
  ["2009-05-15", 5.25], ["2009-06-19", 4.75], ["2009-07-17", 4.50],
  ["2011-01-01", 4.50],
  ["2013-03-08", 4.00], ["2013-09-06", 3.75], ["2013-10-25", 3.50],
  ["2014-06-06", 3.00],
  ["2015-12-17", 3.25],
  ["2016-02-17", 3.75], ["2016-06-30", 4.25], ["2016-09-29", 4.75], ["2016-11-17", 5.25], ["2016-12-15", 5.75],
  ["2017-02-09", 6.25], ["2017-03-30", 6.50], ["2017-05-18", 6.75], ["2017-06-22", 7.00],
  ["2018-02-08", 7.50], ["2018-11-15", 8.00], ["2018-12-20", 8.25],
  ["2019-08-15", 8.00], ["2019-09-26", 7.75], ["2019-11-14", 7.50], ["2019-12-19", 7.25],
  ["2020-02-13", 7.00], ["2020-03-20", 6.50], ["2020-04-21", 6.00], ["2020-05-14", 5.50],
  ["2020-06-25", 5.00], ["2020-08-13", 4.50], ["2020-09-24", 4.25], ["2021-02-11", 4.00],
  ["2021-06-25", 4.25], ["2021-08-13", 4.50], ["2021-10-01", 4.75], ["2021-11-12", 5.00], ["2021-12-17", 5.50],
  ["2022-02-11", 6.00], ["2022-03-25", 6.50], ["2022-05-13", 7.00], ["2022-06-24", 7.75],
  ["2022-08-12", 8.50], ["2022-09-30", 9.25], ["2022-11-11", 10.00], ["2022-12-16", 10.50],
  ["2023-02-10", 11.00], ["2023-03-31", 11.25],
  ["2024-03-22", 11.00], ["2024-08-09", 10.75], ["2024-09-27", 10.50], ["2024-11-15", 10.25], ["2024-12-20", 10.00],
  ["2025-02-07", 9.50], ["2025-03-28", 9.00], ["2025-05-16", 8.50], ["2025-06-27", 8.00],
  ["2025-08-08", 7.75], ["2025-09-26", 7.50], ["2025-11-07", 7.25], ["2025-12-19", 7.00],
  ["2026-05-08", 6.50],
];

export const banxicoAt = (date) => {
  let r = null;
  for (const [d, v] of BANXICO_STEPS) { if (d <= date) r = v; else break; }
  return r;
};

// ── Utilidades de serie ──────────────────────────────────────────────────────
export const pctChg = (curr, prev) => (prev ? ((curr - prev) / prev) * 100 : null);

// Volatilidad realizada anualizada sobre `n` retornos diarios.
export function rollingVol(rets, n = 21) {
  const w = rets.slice(-n).filter((x) => x != null && isFinite(x));
  if (w.length < Math.max(10, Math.floor(n / 2))) return null;
  const m = w.reduce((a, b) => a + b, 0) / w.length;
  const v = w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}
