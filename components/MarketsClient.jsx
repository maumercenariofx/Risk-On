"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import {
  GREEN, RED, crosshairPlugin, makeGlowPlugin, makeTerminalDotPlugin,
  makeGradientFn, tooltipDefaults, xScaleDefaults, yScaleDefaults,
  monoFont, loadChart, makeRevealPlugin,
} from "../lib/chartHelpers";

// ── constants ────────────────────────────────────────────────────────────────

// `peso`: el color es relativo al PESO, no al par — USD/MXN a la baja = peso
// más fuerte = verde. Misma convención que Ticker, IntradaySpark, PosturaRecord
// y BandEvidence; esta gráfica era la última que pintaba verde al dólar
// subiendo (2026-09-15). Los cruces sin peso siguen con arriba = verde.
const PAIRS = [
  { key: "USDMXN", label: "USD/MXN", decimals: 4, peso: true },
  { key: "EURMXN", label: "EUR/MXN", decimals: 4, peso: true },
  { key: "CHFMXN", label: "CHF/MXN", decimals: 4, peso: true },
  { key: "EURUSD", label: "EUR/USD", decimals: 4 },
  { key: "GBPUSD", label: "GBP/USD", decimals: 4 },
  { key: "USDJPY", label: "USD/JPY", decimals: 2 },
];

const RANGES = [
  { value: "1d",  label: "1D" },
  { value: 30,    label: "1M" },
  { value: 90,    label: "3M" },
  { value: 365,   label: "1Y" },
];

// ── FX session segmentation (UTC hours) ──────────────────────────────────────
// Overlap priority for MXN traders: NY > London > Tokyo (by peso volume)

const FX_SESSIONS = [
  { key: "newyork", es: "NY",      en: "NY",     color: GREEN,     from: 12, to: 21 },
  { key: "london",  es: "Londres", en: "London", color: "#F59E0B", from: 7,  to: 16 },
  { key: "tokyo",   es: "Asia",    en: "Asia",   color: "#818CF8", from: 0,  to: 9  },
];
const QUIET_COLOR = "#374151";

function sessionColor(hourUTC) {
  if (hourUTC >= 12 && hourUTC < 21) return GREEN;      // NY
  if (hourUTC >= 7  && hourUTC < 16) return "#F59E0B";  // London
  if (hourUTC >= 0  && hourUTC < 9)  return "#818CF8";  // Asia/Tokyo
  return QUIET_COLOR;
}

function currentSession(hourUTC) {
  if (hourUTC >= 12 && hourUTC < 21) return FX_SESSIONS[0];
  if (hourUTC >= 7  && hourUTC < 16) return FX_SESSIONS[1];
  if (hourUTC >= 0  && hourUTC < 9)  return FX_SESSIONS[2];
  return null;
}

// ¿La última barra diaria es la de hoy y sigue abierta? /api/history estampa la
// sesión con el gmtoffset de Yahoo (Londres para FX), así que "hoy" se mide en
// Europe/London. FX cierra vie 22:00 UTC y reabre dom 22:00 UTC (mismo criterio
// que fxClosed de RiskGauge). Si abre, el último tramo va punteado (2026-09-15).
function lastBarOpen(dates, now = new Date()) {
  if (!dates?.length) return false;
  const d = now.getUTCDay(), h = now.getUTCHours();
  if (d === 6 || (d === 5 && h >= 22) || (d === 0 && h < 22)) return false;
  return dates[dates.length - 1] === now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

const dirColor = (isUp, peso) => ((peso ? !isUp : isUp) ? GREEN : RED);

function computeSessionChanges(prices, timestamps) {
  const out = {};
  for (const s of FX_SESSIONS) {
    const pts = [];
    for (let i = 0; i < timestamps.length; i++) {
      const h = new Date(timestamps[i]).getUTCHours();
      if (h >= s.from && h < s.to) pts.push(prices[i]);
    }
    if (pts.length >= 2) {
      out[s.key] = ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100;
    }
  }
  return out;
}

// Aquí vivían genSeries()/genLabels(), que ante un fallo de /api/history
// dibujaban una serie INVENTADA entre 18.10 y 18.42 sin avisar al lector —
// con el spot real en 16.89. Contradice la regla de la casa ("si un número no
// está verificado, no existe") y es justo lo que /api/history evita al
// devolver arreglos vacíos. Si no hay datos, no hay gráfica (2026-08-21).

// ── component ────────────────────────────────────────────────────────────────

export default function MarketsClient({ embed = false }) {
  const { lang } = useLang();
  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);
  const dataCache  = useRef({});

  const [range,        setRange]        = useState("1d");
  const [pair,         setPair]         = useState("USDMXN");
  const [priceInfo,    setPriceInfo]    = useState(null);
  const [lineColor,    setLineColor]    = useState(GREEN);
  const [loading,      setLoading]      = useState(true);
  const [noData,       setNoData]       = useState(false);
  const [sessChanges,  setSessChanges]  = useState(null);
  const [activeSess,   setActiveSess]   = useState(null);
  const [openBar,      setOpenBar]      = useState(false);

  const currentPair = PAIRS.find((p) => p.key === pair) || PAIRS[0];
  const isIntraday  = range === "1d";

  // Deep-link: /markets?pair=EURUSD (los items FX del ticker llegan así).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("pair");
      if (p && PAIRS.some((x) => x.key === p.toUpperCase())) setPair(p.toUpperCase());
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNoData(false);
    setSessChanges(null);
    setActiveSess(null);

    const buildChart = async (prices, labels, tsArr = [], dates = []) => {
      if (cancelled || !canvasRef.current) return;
      const open = !isIntraday && lastBarOpen(dates);
      setOpenBar(open);

      const first     = prices[0] ?? 0;
      const last      = prices[prices.length - 1] ?? 0;
      const isUp      = last >= first;
      const color     = dirColor(isUp, currentPair.peso);
      const change    = last - first;
      const changePct = first ? (change / first) * 100 : 0;

      setPriceInfo({ last, change, changePct, isUp });
      setLineColor(color);

      // Session analysis for 1D
      let dotColor = color;
      if (tsArr.length) {
        const sc = computeSessionChanges(prices, tsArr);
        setSessChanges(sc);
        const lastH = new Date(tsArr[tsArr.length - 1]).getUTCHours();
        dotColor = sessionColor(lastH);
        setActiveSess(currentSession(lastH));
      }

      const Chart = await loadChart();
      if (cancelled || !canvasRef.current) return;

      if (chartRef.current) chartRef.current.destroy();
      canvasRef.current.style.background = "transparent";

      // Gradient fill: neutral for 1D, semantic for daily
      const fillColor = isIntraday ? "#6B7280" : color;

      const dataset = {
        data:            prices,
        borderColor:     color,
        borderWidth:     2,
        backgroundColor: makeGradientFn(fillColor),
        fill:                      true,
        tension:                   0.3,
        pointRadius:               0,
        pointHoverRadius:          4,
        pointHoverBackgroundColor: dotColor,
        pointHoverBorderColor:     "#000",
        pointHoverBorderWidth:     2,
      };

      if (open) {
        dataset.segment = { borderDash: (s) => (s.p1DataIndex === prices.length - 1 ? [4, 4] : undefined) };
      }

      // Session-colored line for 1D
      if (isIntraday && tsArr.length) {
        dataset.segment = {
          borderColor: (ctx) => {
            const ts = tsArr[ctx.p0DataIndex];
            return ts ? sessionColor(new Date(ts).getUTCHours()) : color;
          },
        };
      }

      const plugins = [crosshairPlugin, makeTerminalDotPlugin(dotColor, 0)];
      if (!isIntraday) plugins.push(makeGlowPlugin(color, 0));
      plugins.push(makeRevealPlugin({ fadeLeft: 0.08 }));

      // Ejes en #8A8A8E (los de chartHelpers): el #4B5563 que traía esta copia
      // local daba ~2.6:1 sobre negro y reprobaba AA (2026-09-15).
      chartRef.current = new Chart(canvasRef.current, {
        type:    "line",
        plugins,
        data:    { labels, datasets: [dataset] },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          interaction:         { intersect: false, mode: "index" },
          animation:           false, // la entrada la hace makeRevealPlugin
          plugins: {
            legend:  { display: false },
            tooltip: {
              ...tooltipDefaults,
              bodyFont: monoFont(14, "600"),
              filter:   (item) => item.datasetIndex === 0,
              callbacks: {
                title: (items) => {
                  const t = items[0]?.label ?? "";
                  const live = open && items[0]?.dataIndex === prices.length - 1;
                  return live ? `${t} · ${lang === "en" ? "in progress" : "en curso"}` : t;
                },
                label: (c)     => " " + (+c.parsed.y).toFixed(currentPair.decimals),
              },
            },
          },
          scales: {
            x: xScaleDefaults(isIntraday ? 8 : (range === 365 ? 10 : range === 90 ? 7 : 5)),
            y: {
              ...yScaleDefaults((v) => v.toFixed(currentPair.decimals === 2 ? 0 : 2)),
              position: "right",
            },
          },
        },
      });

      setLoading(false);
    };

    const cacheKey = `${pair}-${range}`;
    if (dataCache.current[cacheKey]) {
      const { prices, labels, labels_en, timestamps, dates } = dataCache.current[cacheKey];
      buildChart(prices, lang === "en" && labels_en ? labels_en : labels, timestamps ?? [], dates ?? []);
      return () => { cancelled = true; };
    }

    fetch(`/api/history?range=${range}&symbol=${pair}`)
      .then((r) => r.json())
      .then(({ prices, labels, labels_en, timestamps: ts, dates }) => {
        if (cancelled) return;
        if (prices?.length > 0) {
          dataCache.current[cacheKey] = { prices, labels, labels_en, timestamps: ts, dates };
          buildChart(prices, lang === "en" && labels_en ? labels_en : labels, ts ?? [], dates ?? []);
        } else {
          // Sin datos NO se dibuja nada. No se cachea: el siguiente intento
          // vuelve a pedir en vez de servir un hueco pegado.
          setNoData(true);
          setLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setNoData(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
    // lang: al cambiar de idioma se redibuja desde la caché con las etiquetas
    // del idioma (2026-09-11); no vuelve a pedir datos.
  }, [range, pair, lang]);

  // ── derived display values ────────────────────────────────────────────────

  const dec         = currentPair.decimals;
  const displayLast = priceInfo ? priceInfo.last.toFixed(dec) : "—";
  const isUp        = priceInfo?.isUp ?? true;
  const arrowColor  = lineColor;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className={embed ? "space-y-4 p-4" : "space-y-6 pt-4"}>

      {!embed && (
        <div className="reveal">
          <h1 className="font-serif text-3xl font-medium text-bone">
            <T es="Mercados" en="Markets" />
          </h1>
          <p className="mt-1 text-sm text-muted">
            <T es="Tipos de cambio y los indicadores que mueven el riesgo." en="FX rates and the gauges that move risk." />
          </p>
        </div>
      )}

      {/* Pair selector pills */}
      <div className="reveal" style={{ animationDelay: "0.05s" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PAIRS.map((p) => {
            const active = pair === p.key;
            return (
              <button
                key={p.key}
                onClick={() => { setPair(p.key); setPriceInfo(null); }}
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      11,
                  letterSpacing: 0.5,
                  padding:       "5px 12px",
                  borderRadius:  20,
                  cursor:        "pointer",
                  border:        `1px solid ${active ? "rgba(245,245,242,0.25)" : "rgba(255,255,255,0.07)"}`,
                  background:    active ? "rgba(245,245,242,0.10)" : "transparent",
                  color:         active ? "#F5F5F2" : "#6B7280",
                  transition:    "all 0.18s",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart card */}
      <div
        className="reveal rounded-2xl"
        style={{
          animationDelay:       "0.1s",
          background:            embed ? "transparent" : "rgba(4,4,5,0.80)",
          backdropFilter:        embed ? "none" : "blur(20px)",
          WebkitBackdropFilter:  embed ? "none" : "blur(20px)",
          border:                embed ? "none" : `1px solid ${priceInfo ? `${lineColor}26` : "rgba(255,255,255,0.06)"}`,
          borderRadius:          20,
          padding:               embed ? 0 : "22px 22px 18px",
          transition:            "border-color .4s",
        }}
      >
        {/* Price header */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase",
              color: "#8A8A8E", marginBottom: 6, fontFamily: "var(--font-mono)",
            }}>
              {currentPair.label}
              {isIntraday && activeSess && (
                <span style={{
                  marginLeft: 8,
                  color:      activeSess.color,
                  border:     `1px solid ${activeSess.color}44`,
                  borderRadius: 10,
                  padding:    "2px 7px",
                  fontSize:   8,
                  letterSpacing: 1.5,
                  boxShadow:  `0 0 8px ${activeSess.color}30`,
                }}>
                  {lang === "en" ? activeSess.en : activeSess.es}
                </span>
              )}
            </div>
            <div style={{
              fontFamily: "var(--font-sans)", fontWeight: 700,
              fontSize: "clamp(26px, 4vw, 36px)", lineHeight: 1,
              color: "#F5F5F2", fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}>
              {displayLast}
            </div>
            {priceInfo && (
              <div style={{
                marginTop: 5, fontSize: 13, fontWeight: 500,
                color: arrowColor, fontVariantNumeric: "tabular-nums",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span>{isUp ? "▲" : "▼"}</span>
                <span>{isUp ? "+" : ""}{priceInfo.changePct.toFixed(2)}%</span>
                <span style={{ opacity: 0.55, fontSize: 12 }}>
                  ({isUp ? "+" : ""}{priceInfo.change.toFixed(dec)})
                </span>
                {isIntraday && (
                  <span style={{ opacity: 0.4, fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
                    · 24H
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Range pills */}
          <div style={{ display: "flex", gap: 5, flexShrink: 0, marginTop: 2 }}>
            {RANGES.map((r) => {
              const active = range === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  style={{
                    fontFamily:   "var(--font-mono)",
                    fontSize:     11,
                    fontWeight:   600,
                    padding:      "5px 13px",
                    borderRadius: 20,
                    cursor:       "pointer",
                    border:       "none",
                    background:   active ? GREEN : "rgba(255,255,255,0.06)",
                    color:        active ? "#000" : "#6B7280",
                    boxShadow:    active ? `0 0 14px ${GREEN}66` : "none",
                    transition:   "all 0.18s",
                    letterSpacing: 0.5,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <div style={{ position: "relative", height: 280 }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              // #374151 daba 2.04:1 sobre negro: el estado de carga era
              // invisible y parecía que la gráfica estaba rota (a11y 2026-08-21).
              color: "#8A8A8E", fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}>
              — <T es="cargando" en="loading" /> —
            </div>
          )}
          {noData && !loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8, padding: "0 24px",
              textAlign: "center",
            }}>
              <span style={{
                color: "#8A8A8E", fontSize: 11, letterSpacing: 2.5,
                textTransform: "uppercase", fontFamily: "var(--font-mono)",
              }}>
                <T es="sin datos" en="no data" />
              </span>
              <span style={{ color: "#8A8A8E", fontSize: 12, lineHeight: 1.6, maxWidth: 320 }}>
                <T
                  es="La fuente de precios no respondió. Preferimos no mostrar nada antes que mostrar un número que no verificamos."
                  en="The price source didn't respond. We'd rather show nothing than a number we haven't verified."
                />
              </span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${currentPair.label} price chart`}
            style={{ opacity: loading || noData ? 0 : 1, transition: "opacity .35s" }}
          />
        </div>

        {/* Session breakdown — 1D only */}
        {isIntraday && sessChanges && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Session Δ chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FX_SESSIONS.map((s) => {
                const delta = sessChanges[s.key];
                if (delta == null) return null;
                const up = delta >= 0;
                return (
                  <div key={s.key} style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           5,
                    padding:       "5px 10px",
                    borderRadius:  20,
                    border:        `1px solid ${s.color}33`,
                    background:    `${s.color}0A`,
                    fontFamily:    "var(--font-mono)",
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: s.color,
                      boxShadow:  `0 0 6px ${s.color}`,
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 11, color: "#8A8A8E", letterSpacing: 1 }}>
                      {lang === "en" ? s.en : s.es}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: dirColor(up, currentPair.peso), fontVariantNumeric: "tabular-nums" }}>
                      {up ? "+" : ""}{delta.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Session color legend */}
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              {FX_SESSIONS.map((s) => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="18" height="6">
                    <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2"
                      style={{ filter: `drop-shadow(0 0 2px ${s.color})` }} />
                  </svg>
                  <span style={{ fontSize: 11, color: "#8A8A8E", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
                    {lang === "en" ? s.en.toUpperCase() : s.es.toUpperCase()}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="18" height="6">
                  <line x1="0" y1="3" x2="18" y2="3" stroke={QUIET_COLOR} strokeWidth="2" strokeDasharray="4 2" />
                </svg>
                <span style={{ fontSize: 11, color: "#8A8A8E", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
                  <T es="SILENCIO" en="QUIET" />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <p style={{
          marginTop: isIntraday ? 10 : 12,
          fontSize: 11, color: "#8A8A8E",
          fontFamily: "var(--font-mono)", letterSpacing: 0.5,
        }}>
          {isIntraday
            ? <T es="Datos intradía 5m · Yahoo Finance · UTC · solo pares FX (mercado 24h)"
                 en="5m intraday data · Yahoo Finance · UTC · FX pairs only (24h market)" />
            : <T es="Cierres diarios · Yahoo Finance · datos con posible retraso"
                 en="Daily closes · Yahoo Finance · data may be delayed" />
          }
          {!isIntraday && openBar && (
            <T es=" · punteado: sesión de hoy, aún abierta" en=" · dashed: today's session, still open" />
          )}
        </p>
      </div>
    </div>
  );
}
