"use client";
// components/PortafolioRecord.jsx
// Portafolio simulado de 1 MDP operando las posturas PUBLICADAS (2026-09-21).
// Complementa al marcador: el marcador dice si acertamos; esto dice cuánto
// dinero habría hecho o perdido un lector que las siguiera a las 7:00, con la
// regla completa a la vista. Los datos los escribe scripts/update-portfolio.mjs
// después del envío. Desde el 2026-09-23 las abiertas se re-marcan en el
// navegador con el spot de /api/spot cada 15s (lib/portafolioLive.js); si ese
// endpoint falla, la tarjeta muestra el JSON tal cual: la página de
// credibilidad nunca se cae con Yahoo (lección del ledger, 2026-08-21).
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import { marcarEnVivo } from "../lib/portafolioLive";
import {
  crosshairPlugin, tooltipDefaults, xScaleDefaults, yScaleDefaults,
  cardStyle, sectionLabel, monoFont, loadChart, GREEN, RED,
} from "../lib/chartHelpers";

const BIAS = {
  "pro-peso":  { es: "PRO-PESO",  en: "PRO-PESO", color: "#2FB89A" },
  "neutral":   { es: "NEUTRAL",   en: "NEUTRAL",  color: "#9CA3AF" },
  "pro-dolar": { es: "PRO-DÓLAR", en: "PRO-USD",  color: "#CE5555" },
};

export const mxn = (v, signo = false) =>
  (v < 0 ? "−" : signo ? "+" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");

export function fmtDate(slug, lang, conAño = false) {
  return new Date(`${slug}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-US" : "es-MX", {
    day: "numeric", month: "short", ...(conAño ? { year: "2-digit" } : {}), timeZone: "UTC",
  });
}

// Línea del capital contra la referencia de 1 MDP (punteada). Un solo eje.
// `punto` es el valor en vivo (opcional): se dibuja como último punto ("ahora")
// y se actualiza EN SITIO cada vez que cambia, sin destruir la gráfica — con
// sondeo de 15s, redibujarla animada cada vez era un parpadeo constante.
export function EquityChart({ puntos, punto = null, base, lang, height = 220, conAño = false }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const todosRef = useRef(puntos);
  const etiqueta = (p) => (p.live ? (lang === "en" ? "now" : "ahora") : fmtDate(p.d, lang, conAño));
  const conVivo = !!punto;
  useEffect(() => {
    if (!puntos?.length) return;
    let cancelled = false;
    (async () => {
      const Chart = await loadChart();
      if (cancelled || !ref.current) return;
      chartRef.current?.destroy();
      const todos = punto ? [...puntos, punto] : puntos;
      todosRef.current = todos;
      const ultimo = todos[todos.length - 1].v;
      const color = ultimo >= base ? GREEN : RED;
      chartRef.current = new Chart(ref.current, {
        type: "line",
        plugins: [crosshairPlugin],
        data: {
          labels: todos.map(etiqueta),
          datasets: [
            {
              data: todos.map((p) => p.v), borderColor: color, borderWidth: 2,
              backgroundColor: color + "1A", fill: { target: { value: base } },
              tension: 0.2, pointRadius: 0, pointHitRadius: 10, pointHoverRadius: 4,
              pointHoverBackgroundColor: color, pointHoverBorderColor: "#000", pointHoverBorderWidth: 2,
            },
            {
              data: todos.map(() => base), borderColor: "#8A8A8E66", borderWidth: 1,
              borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 0,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipDefaults, displayColors: false,
              filter: (i) => i.datasetIndex === 0,
              bodyFont: monoFont(12),
              callbacks: {
                label: (i) => {
                  const p = todosRef.current[i.dataIndex];
                  const lines = [`${mxn(p.v)}  (${mxn(p.v - base, true)})`];
                  if (p.px) lines.push(`USD/MXN ${p.px.toFixed(4)}`);
                  return lines;
                },
              },
            },
          },
          scales: {
            x: xScaleDefaults(6),
            y: yScaleDefaults((v) => `$${(v / 1e6).toFixed(conAño ? 2 : 3)}M`),
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, base, lang, conAño, conVivo]);

  // Cambió el spot: se mueve solo el último punto y su color, sin animación.
  useEffect(() => {
    const ch = chartRef.current;
    if (!ch || !punto) return;
    const todos = [...puntos, punto];
    todosRef.current = todos;
    const color = punto.v >= base ? GREEN : RED;
    ch.data.labels = todos.map(etiqueta);
    ch.data.datasets[0].data = todos.map((p) => p.v);
    ch.data.datasets[0].borderColor = color;
    ch.data.datasets[0].backgroundColor = color + "1A";
    ch.data.datasets[0].pointHoverBackgroundColor = color;
    ch.update("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto]);
  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <canvas ref={ref} role="img" aria-label={lang === "en" ? "Simulated portfolio value over time" : "Valor del portafolio simulado en el tiempo"} />
    </div>
  );
}

export function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#8A8A8E", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: color ?? "#F5F5F2", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#8A8A8E", marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

const th = { padding: "6px 10px 6px 0", fontSize: 10.5, letterSpacing: 1, color: "#8A8A8E", fontWeight: 400, textAlign: "right", fontFamily: "var(--font-mono)", textTransform: "uppercase" };
const td = { padding: "7px 10px 7px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#F5F5F2", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderTop: "1px solid rgba(255,255,255,0.05)" };
const colorPnl = (v) => (v > 0 ? GREEN : v < 0 ? RED : "#9CA3AF");

const SPOT_MS = 15_000;

// Spot en vivo: se pide al montar y cada 15s mientras la pestaña esté visible.
// Cualquier fallo deja `spot` en null y la UI se queda con los datos del bot.
function useSpotVivo() {
  const [spot, setSpot] = useState(null);
  useEffect(() => {
    let dead = false;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetch("/api/spot")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!dead && j?.px) setSpot(j); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, SPOT_MS);
    document.addEventListener("visibilitychange", load);
    return () => { dead = true; clearInterval(id); document.removeEventListener("visibilitychange", load); };
  }, []);
  return spot;
}

function PuntoVivo() {
  return (
    <span aria-hidden="true" className="animate-pulse" style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: GREEN, marginRight: 5, verticalAlign: "middle" }} />
  );
}

export default function PortafolioRecord({ data }) {
  const { lang } = useLang();
  const spot = useSpotVivo();
  if (!data?.daily?.length) return null;
  const live = spot ? marcarEnVivo(data, spot) : null;
  // Con spot vivo, `r`, `abiertas` y `mensual` traen los números re-marcados;
  // anualizado y caída máxima siguen siendo los de las 7:00 (ver lib/portafolioLive.js).
  const r = live ? { ...data.resumen, valor: live.valor, pnl: live.pnl, ret_pct: live.ret_pct } : data.resumen;
  const abiertas = live ? live.abiertas : data.abiertas;
  const mensual = live ? live.mensual : data.mensual;
  const spotPx = live ? spot.px : data.spot.px;
  const spotTs = live ? spot.ts : data.spot.ts;
  const base = data.regla.capital;
  const mesLabel = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { month: "short", year: "numeric", timeZone: "UTC" });
  const mesActual = data.daily[data.daily.length - 1].d.slice(0, 7);

  return (
    <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={sectionLabel}>
          <T es="Portafolio simulado · 1 MDP" en="Simulated portfolio · MXN 1M" />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: colorPnl(r.pnl) }}>
          {mxn(r.pnl, true)} · {r.ret_pct > 0 ? "+" : ""}{r.ret_pct.toFixed(2)}%
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
        <T
          es="Qué habría pasado con un millón de pesos siguiendo cada postura publicada: 5 tramos de 200 mil, cada uno entra a las 7:00 del día de la postura y sale a las 7:00 del quinto día hábil, cuando se publica la que la reemplaza. Neutral = ese tramo en caja."
          en="What a million pesos would have done following every published stance: 5 tranches of 200k, each entering at 7:00 CDMX on the stance's day and exiting at 7:00 on the fifth business day, when its replacement is published. Neutral = that tranche in cash."
        />
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        <Kpi label={<T es="Valor a mercado" en="Marked to market" />} value={mxn(r.valor)}
          sub={<T es={`${data.abiertas.length} tramos abiertos`} en={`${data.abiertas.length} open tranches`} />} />
        <Kpi label={<T es="Ganado en cerradas" en="Realized" />} value={mxn(r.pnl_cerrado, true)} color={colorPnl(r.pnl_cerrado)}
          sub={<T es={`${r.ganadoras} de ${r.cerradas} ganadoras`} en={`${r.ganadoras} of ${r.cerradas} winners`} />} />
        <Kpi label={<T es="Anualizado" en="Annualized" />} value={`${r.anualizado_pct > 0 ? "+" : ""}${r.anualizado_pct}%`}
          sub={<T es={`${r.dias_habiles} días hábiles: no extrapolable`} en={`${r.dias_habiles} trading days: not extrapolable`} />} />
        <Kpi label={<T es="Caída máxima" en="Max drawdown" />} value={`−${r.max_dd_pct.toFixed(2)}%`}
          sub={<T es="de pico a valle, a las 7:00" en="peak to trough, at 7:00" />} />
      </div>

      {/* Solo la curva de nuestras posturas (decisión de Mauricio, 2026-09-21).
          La referencia "siempre pro-peso" se sigue calculando en
          portafolio.json (resumen.base_*, daily[].b) para la revisión interna
          de enero 2027, pero no se muestra. */}
      <EquityChart puntos={data.daily} punto={live?.punto ?? null} base={base} lang={lang} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginTop: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ ...sectionLabel, fontSize: 10.5, marginBottom: 6 }}><T es="Por mes" en="By month" /></div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={{ ...th, textAlign: "left" }}><T es="Mes" en="Month" /></th><th style={th}>P&amp;L</th><th style={{ ...th, paddingRight: 0 }}>%</th></tr></thead>
            <tbody>
              {mensual.map((m) => (
                <tr key={m.mes}>
                  <td style={{ ...td, textAlign: "left", fontFamily: "inherit", fontSize: 12.5, color: "#C0C0BC" }}>
                    {mesLabel(m.mes)}{m.mes === mesActual && <span style={{ color: "#8A8A8E" }}> · <T es="en curso" en="ongoing" /></span>}
                  </td>
                  <td style={{ ...td, color: colorPnl(m.pnl) }}>{mxn(m.pnl, true)}</td>
                  <td style={{ ...td, paddingRight: 0, color: colorPnl(m.pnl) }}>{m.ret_pct > 0 ? "+" : ""}{m.ret_pct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ ...sectionLabel, fontSize: 10.5, marginBottom: 6 }}><T es="Abiertas, a mercado" en="Open, marked to market" /></div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}><T es="Postura" en="Stance" /></th>
              <th style={th}><T es="Entrada" en="Entry" /></th>
              <th style={th}><T es="Vence" en="Exits" /></th>
              <th style={{ ...th, paddingRight: 0 }}>P&amp;L</th>
            </tr></thead>
            <tbody>
              {abiertas.map((a) => {
                const b = BIAS[a.bias] ?? BIAS.neutral;
                return (
                  <tr key={a.slug}>
                    <td style={{ ...td, textAlign: "left", fontSize: 11 }}>
                      <span style={{ color: "#8A8A8E" }}>{fmtDate(a.slug, lang)}</span>{" "}
                      <span style={{ color: b.color }}>{lang === "en" ? b.en : b.es}</span>
                    </td>
                    <td style={td}>{a.S0.toFixed(4)}</td>
                    <td style={{ ...td, color: "#9CA3AF" }}>{fmtDate(a.vence, lang)}</td>
                    <td style={{ ...td, paddingRight: 0, color: a.stop ? "#9CA3AF" : colorPnl(a.pnl) }}>
                      {a.stop ? <T es="stop · en caja" en="stopped · cash" /> : mxn(a.pnl, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "#8A8A8E", marginTop: 6 }}>
            {live && <PuntoVivo />}
            USD/MXN {spotPx.toFixed(4)} ·{" "}
            {live && <><T es="en vivo" en="live" /> · </>}
            {new Date(spotTs).toLocaleString(lang === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(live ? { second: "2-digit" } : {}), timeZone: "America/Mexico_City" })} CDMX
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: "#8A8A8E", lineHeight: 1.6, margin: "14px 0 0" }}>
        <T
          es={`Cuando gana, una postura gana en promedio ${mxn(r.ganancia_media)} por tramo; cuando pierde, pierde ${mxn(Math.abs(r.perdida_media))}. Incluye carry Banxico − Fed (${data.regla.carry_pct.toFixed(2)} pp) y ${data.regla.costo_rt_pct}% de costo al cambiar de lado; no incluye lo que el millón ganaría en CETES. Regla de riesgo de la simulación: si a las 7:00 el par va ${data.regla.stop_atr ?? 3} ATR en contra, el tramo sale y queda en caja hasta su vencimiento (${r.stops ?? 0} de ${r.cerradas} veces hasta hoy); es un freno de catástrofe, no un nivel que publiquemos por postura. La condición de invalidación del view no dispara salidas: sus cuatro formas de ejecutarla rindieron menos que mantener. Precios: velas de 1 hora de Yahoo (MXN=X). Simulación hipotética con muestra chica, no una recomendación de inversión.`}
          en={`When a stance wins, it makes ${mxn(r.ganancia_media)} per tranche on average; when it loses, it loses ${mxn(Math.abs(r.perdida_media))}. Includes Banxico − Fed carry (${data.regla.carry_pct.toFixed(2)} pp) and a ${data.regla.costo_rt_pct}% cost when switching sides; excludes what the million would earn in CETES. Simulation risk rule: if at 7:00 the pair is ${data.regla.stop_atr ?? 3} ATR against the stance, the tranche exits and stays in cash until it matures (${r.stops ?? 0} of ${r.cerradas} times so far); it is a catastrophe brake, not a level we publish per stance. The view's invalidation condition does not trigger exits: its four execution variants returned less than holding. Prices: Yahoo 1-hour bars (MXN=X). Hypothetical simulation on a small sample, not investment advice.`}
        />
      </p>
    </div>
  );
}
