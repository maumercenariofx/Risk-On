// lib/stats.js
// Estadística mínima para presentar el marcador con honestidad.
//
// Hasta el 21-ago-2026 el sitio no tenía NADA de esto: un 76% sobre n=38 se
// mostraba con el mismo peso visual que un 57% sobre n=658, y ningún número
// llevaba intervalo. Publicar una proporción sin su incertidumbre es publicar
// ruido y señal como si fueran lo mismo.

// Intervalo de Wilson al 95%. Se usa Wilson y no la aproximación normal porque
// con n chico (26 posturas) la normal se sale de [0,1] y miente en las colas.
export function wilson(hits, n, z = 1.96) {
  if (!n || n < 1) return null;
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / d;
  const margen = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return {
    pct: 100 * p,
    lo: 100 * Math.max(0, centro - margen),
    hi: 100 * Math.min(1, centro + margen),
    n,
  };
}

// ¿Se traslapan dos intervalos? Si sí, los dos números NO son distinguibles
// con la evidencia disponible — que es justo lo que pasa entre el marcador y
// el benchmark ingenuo, y lo que el lector merece ver.
export function overlap(a, b) {
  if (!a || !b) return null;
  return a.lo <= b.hi && b.lo <= a.hi;
}

export function mean(xs) {
  const a = (xs ?? []).filter((v) => Number.isFinite(v));
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}

export function median(xs) {
  const a = (xs ?? []).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Fricción, en PORCENTAJE del precio, para un spread ida y vuelta expresado en
// centavos de peso. Es la unidad que un lector mexicano entiende sin traducir:
// 1 centavo = 0.01 MXN, y sobre un spot de ~16.9 eso son ~0.059% por vuelta
// completa. Se expone el supuesto en la UI para que el lector lo juzgue en vez
// de tragárselo.
export function friccionPct(centavosIdaYVuelta, spot = 16.9) {
  if (!spot) return 0;
  return (100 * (centavosIdaYVuelta * 0.01)) / spot;
}

// n EFECTIVO. Las ventanas de 5 días hábiles sobre observaciones diarias se
// traslapan 5 veces, así que 26 posturas consecutivas NO son 26 observaciones
// independientes. Ajuste burdo pero honesto: n/horizonte, con piso de 1.
export function nEfectivo(n, horizonte = 5) {
  if (!n) return 0;
  return Math.max(1, Math.round(n / horizonte));
}

// Tamaño de muestra necesario para distinguir dos proporciones (dos colas,
// alfa 0.05, potencia 0.80). Sirve para decirle al lector CUÁNTO falta en vez
// de dejarlo creer que 26 posturas ya prueban algo.
export function nNecesario(p1, p0, potencia = 0.84, zAlfa = 1.96) {
  if (p1 === p0) return Infinity;
  const pbar = (p1 + p0) / 2;
  const num = zAlfa * Math.sqrt(2 * pbar * (1 - pbar)) + potencia * Math.sqrt(p1 * (1 - p1) + p0 * (1 - p0));
  return Math.ceil((num * num) / ((p1 - p0) * (p1 - p0)));
}

// Variante de UNA muestra: comparar nuestra tasa de acierto contra una base
// CONOCIDA (la del par, no estimada de nuestra propia muestra). Es el caso que
// aplica aquí, y da un n menor que el de dos muestras.
// alfa 0.05 a dos colas, potencia 0.80.
export function nNecesarioVsBase(p1, p0, zAlfa = 1.96, zBeta = 0.8416) {
  if (p1 === p0) return Infinity;
  const num = zAlfa * Math.sqrt(p0 * (1 - p0)) + zBeta * Math.sqrt(p1 * (1 - p1));
  return Math.ceil((num * num) / ((p1 - p0) * (p1 - p0)));
}
