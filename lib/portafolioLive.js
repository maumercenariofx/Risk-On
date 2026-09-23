// lib/portafolioLive.js
// Marca a mercado EN EL CLIENTE el portafolio simulado de /indice (2026-09-23).
// El bot escribe public/data/portafolio.json a las ~6:58 con las abiertas
// valuadas al último candle de ese momento; sin esto, la tarjeta enseñaba el
// spot de las 6:54 todo el día. Aquí se re-valúan las abiertas con el spot en
// vivo usando LA MISMA fórmula que scripts/update-portfolio.mjs (pnlDe): las
// dos tienen que dar lo mismo con el mismo precio, o el lector ve saltar el
// número a las 7:00 sin motivo.
//
// Lo que NO se recalcula (a propósito):
//   · Tramos con stop: están en caja, su P&L es 0.
//   · Tramos ya vencidos (su salida fue a las 7:00 CDMX de `vence` y esa hora
//     ya pasó): se congelan en el valor del JSON. Su precio real de salida lo
//     fija el bot en la corrida siguiente; seguir marcándolos al spot sería
//     inventar una posición que la regla ya cerró.
//   · Anualizado y caída máxima: son métricas de las 7:00 y así lo dicen.

const sign = (b) => (b === "pro-peso" ? -1 : b === "pro-dolar" ? 1 : 0);
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const r2 = (v) => Math.round(v * 100) / 100;

// 7:00 CDMX = 13:00 UTC (México no tiene horario de verano desde 2022).
const HORA_UTC = 13;
export const salida7am = (vence) => Date.parse(`${vence}T${String(HORA_UTC).padStart(2, "0")}:00:00Z`);

export function vencida(abierta, spotMs) {
  return abierta.vence != null && spotMs >= salida7am(abierta.vence);
}

// data: el JSON completo del bot. spot: { px, ts } (ts ISO o ms).
// Devuelve las piezas que la UI sustituye; lo que no está aquí no cambia.
export function marcarEnVivo(data, spot) {
  const px = Number(spot?.px);
  const spotMs = typeof spot?.ts === "number" ? spot.ts : Date.parse(spot?.ts);
  if (!data?.abiertas || !Number.isFinite(px) || px <= 0 || !Number.isFinite(spotMs)) return null;

  const carry = Number(data.regla?.carry_pct) || 0;
  const capital = Number(data.regla?.capital) || 0;
  // Misma convención que el script: los días de carry se cuentan con la fecha
  // UTC del spot.
  const hoy = new Date(spotMs).toISOString().slice(0, 10);

  const abiertas = data.abiertas.map((a) => {
    if (a.stop || vencida(a, spotMs)) return { ...a, vivo: false };
    const s = sign(a.bias);
    const ret = (s * (px - a.S0)) / a.S0 - ((s * carry) / 100) * dias(a.slug, hoy) / 360;
    return { ...a, pnl: r2(a.capital * ret), vivo: true };
  });

  const cerrado = capital + (Number(data.resumen?.pnl_cerrado) || 0);
  const valor = cerrado + abiertas.reduce((acc, a) => acc + a.pnl, 0);
  const pnl = valor - capital;

  // Fila "en curso": su inicio es el valor de las 7:00 del último día del mes
  // anterior; el fin pasa a ser el valor vivo mientras el spot siga en ese mes.
  const mesSpot = hoy.slice(0, 7);
  const ultimo = data.daily?.[data.daily.length - 1];
  const mensual = (data.mensual ?? []).map((m) => {
    if (!ultimo || m.mes !== ultimo.d.slice(0, 7) || m.mes !== mesSpot) return m;
    const inicio = ultimo.v - m.pnl;
    const pnlMes = valor - inicio;
    return { ...m, pnl: Math.round(pnlMes), ret_pct: +((100 * pnlMes) / inicio).toFixed(2) };
  });

  return {
    abiertas,
    mensual,
    valor: Math.round(valor),
    pnl: Math.round(pnl),
    ret_pct: +((100 * pnl) / capital).toFixed(2),
    punto: { d: hoy, v: Math.round(valor), px: +px.toFixed(4), live: true },
    vivos: abiertas.filter((a) => a.vivo).length,
  };
}
