"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import {
  GREEN, RED, crosshairPlugin, multiGlowPlugin, lastDatasetDotPlugin,
  makeGradientFn, tooltipDefaults, xScaleDefaults, yScaleDefaults,
  cardStyle, sectionLabel,
} from "../lib/chartHelpers";

// ── helpers ──────────────────────────────────────────────────────────────────

function normalize(points) {
  if (!points.length) return [];
  const base = points[0].close;
  return points.map((p) => ({ date: p.date, value: (p.close / base) * 100 }));
}

function alignToCalendar(normalized, calDates) {
  const map  = new Map(normalized.map((p) => [p.date, p.value]));
  let   last = normalized[0]?.value ?? 100;
  return calDates.map((d) => { if (map.has(d)) last = map.get(d); return last; });
}

function tbillSeries(n) {
  const r = Math.pow(1.05, 1 / 252) - 1;
  return Array.from({ length: n }, (_, i) => +(100 * Math.pow(1 + r, i)).toFixed(4));
}

// ── constants ────────────────────────────────────────────────────────────────

const PALETTE = [
  "#3FA77E", "#BA7517", "#639922", "#D85A30",
  "#3B82F6", "#A855F7", "#EC4899", "#14B8A6",
  "#F97316", "#EAB308", "#06B6D4", "#84CC16",
];

const TBILL_KEY  = "TBILL";
const LS_KEY     = "riskon_portfolio_v3";
const DEFAULTS   = { symbols: ["^GSPC", TBILL_KEY], weights: { "^GSPC": 70, [TBILL_KEY]: 30 } };
const QUICK_ADDS = ["NVDA", "BTC-USD", "GC=F", "TLT", "QQQ", "GLD", "AMXL.MX", "JPM", "TSLA", "AAPL"];

function loadLS() { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveLS(s, w) { try { localStorage.setItem(LS_KEY, JSON.stringify({ symbols: s, weights: w })); } catch {} }

// ── component ────────────────────────────────────────────────────────────────

export default function PortfolioSection() {
  const { lang } = useLang();
  const canvasRef    = useRef(null);
  const chartRef     = useRef(null);

  const [symbols,     setSymbols]     = useState(DEFAULTS.symbols);
  const [weights,     setWeights]     = useState(DEFAULTS.weights);
  const [assetData,   setAssetData]   = useState({});
  const [loadingSet,  setLoadingSet]  = useState(new Set());
  const [lastError,   setLastError]   = useState(null);
  const [query,       setQuery]       = useState("");
  const [portValue,   setPortValue]   = useState(null);
  const [lineColor,   setLineColor]   = useState(GREEN);
  const [showLines,   setShowLines]   = useState(false);
  const [initialized, setInitialized] = useState(false);

  const fetchAsset = useCallback(async (sym) => {
    if (sym === TBILL_KEY) return;
    setLoadingSet((s) => new Set([...s, sym]));
    setLastError(null);
    try {
      const res = await fetch(`/api/asset?symbol=${encodeURIComponent(sym)}`);
      const d   = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "not found");
      setAssetData((prev) => ({ ...prev, [sym]: d }));
    } catch (e) {
      setLastError({ sym, msg: e.message });
      setSymbols((prev) => prev.filter((s) => s !== sym));
      setWeights((prev) => { const w = { ...prev }; delete w[sym]; return w; });
    } finally {
      setLoadingSet((s) => { const n = new Set(s); n.delete(sym); return n; });
    }
  }, []);

  useEffect(() => {
    const saved = loadLS();
    const syms  = saved?.symbols ?? DEFAULTS.symbols;
    const wgts  = saved?.weights ?? DEFAULTS.weights;
    setSymbols(syms);
    setWeights(wgts);
    Promise.all(syms.filter((s) => s !== TBILL_KEY).map(fetchAsset))
      .finally(() => setInitialized(true));
  }, []); // eslint-disable-line

  useEffect(() => { if (initialized) saveLS(symbols, weights); }, [symbols, weights, initialized]);

  // ── chart rebuild ─────────────────────────────────────────────────────────

  useEffect(() => {
    const loaded = symbols.filter((s) => s === TBILL_KEY || assetData[s]?.points?.length);
    if (!loaded.length || !canvasRef.current) return;

    // Master calendar
    let calDates = [];
    for (const s of loaded) {
      if (s === TBILL_KEY) continue;
      const pts = assetData[s]?.points ?? [];
      if (pts.length > calDates.length) calDates = pts.map((p) => p.date);
    }
    if (!calDates.length) return;

    const n = calDates.length;
    const labels = calDates.map((d) =>
      new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    );

    const seriesMap = {};
    for (const s of loaded) {
      seriesMap[s] = s === TBILL_KEY
        ? tbillSeries(n)
        : alignToCalendar(normalize(assetData[s].points), calDates);
    }

    const total     = Object.values(weights).reduce((a, b) => a + b, 0);
    const unalloc   = Math.max(0, 100 - total);
    const portfolio = calDates.map((_, i) => {
      let sum = unalloc;
      for (const s of loaded) {
        const v = seriesMap[s]?.[i];
        if (v != null) sum += ((weights[s] ?? 0) / 100) * v;
      }
      return +(sum).toFixed(4);
    });

    const lastVal = portfolio[portfolio.length - 1] ?? 100;
    const isUp    = lastVal >= 100;
    const color   = isUp ? GREEN : RED;

    setPortValue(lastVal);
    setLineColor(color);

    const gradFn = makeGradientFn(color);

    let cancelled = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled) return;
      if (chartRef.current) chartRef.current.destroy();

      const datasets = [
        // Dataset 0: portfolio gradient fill
        {
          label:           "fill",
          data:            portfolio,
          borderColor:     "transparent",
          borderWidth:     0,
          backgroundColor: gradFn,
          fill:            true,
          tension:         0.25,
          pointRadius:     0,
        },
      ];

      // Individual asset lines (when toggled)
      if (showLines) {
        loaded.forEach((sym, idx) => {
          datasets.push({
            label:       assetData[sym]?.name ?? sym,
            data:        seriesMap[sym],
            borderColor: PALETTE[idx % PALETTE.length],
            borderWidth: 1,
            pointRadius: 0,
            tension:     0.25,
            fill:        false,
          });
        });
      }

      // Portfolio combined line (always last)
      datasets.push({
        label:                     lang === "en" ? "Portfolio" : "Portafolio",
        data:                      portfolio,
        borderColor:               color,
        borderWidth:               2,
        backgroundColor:           "transparent",
        fill:                      false,
        tension:                   0.25,
        pointRadius:               0,
        pointHoverRadius:          4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor:     "#000",
        pointHoverBorderWidth:     2,
      });

      chartRef.current = new Chart(canvasRef.current, {
        type:    "line",
        plugins: [crosshairPlugin, multiGlowPlugin, lastDatasetDotPlugin],
        data:    { labels, datasets },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          interaction:         { intersect: false, mode: "index" },
          animation:           { duration: 220 },
          plugins: {
            legend:  { display: false },
            tooltip: {
              ...tooltipDefaults,
              itemSort:  (a, b) => b.raw - a.raw,
              filter:    (item) => item.dataset.label !== "fill",
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (c)     => ` ${c.dataset.label}: ${(+c.parsed.y).toFixed(2)}`,
              },
            },
          },
          scales: {
            x: xScaleDefaults(10),
            y: {
              ...yScaleDefaults((v) => v.toFixed(0)),
              position: "right",
            },
          },
        },
      });
    })();

    return () => { cancelled = true; };
  }, [symbols, assetData, weights, showLines, lang]);

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleAdd = () => {
    const sym = query.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) { setQuery(""); return; }
    setQuery("");
    setSymbols((prev) => [...prev, sym]);
    setWeights((prev) => ({ ...prev, [sym]: 0 }));
    fetchAsset(sym);
  };

  const handleRemove = (sym) => {
    setSymbols((prev) => prev.filter((s) => s !== sym));
    setWeights((prev) => { const w = { ...prev }; delete w[sym]; return w; });
    setAssetData((prev) => { const d = { ...prev }; delete d[sym]; return d; });
    if (lastError?.sym === sym) setLastError(null);
  };

  const handleSlider = (key, raw) => {
    const value = Number(raw);
    setWeights((prev) => {
      const otherTotal = Object.entries(prev).filter(([k]) => k !== key).reduce((a, [, v]) => a + v, 0);
      return { ...prev, [key]: Math.min(value, Math.max(0, 100 - otherTotal)) };
    });
  };

  const handleReset = () => {
    setSymbols(DEFAULTS.symbols); setWeights(DEFAULTS.weights);
    setAssetData({}); setLastError(null);
    DEFAULTS.symbols.filter((s) => s !== TBILL_KEY).forEach(fetchAsset);
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const total    = Object.values(weights).reduce((a, b) => a + b, 0);
  const perf     = portValue != null ? portValue - 100 : null;
  const isUp     = perf != null ? perf >= 0 : true;
  const loading  = loadingSet.size > 0;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <section className="reveal" style={{ animationDelay: "0.15s" }}>

      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div style={{ ...sectionLabel, marginBottom: 6 }}>
            <T es="Portafolio simulado · 1 año" en="Simulated portfolio · 1Y" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 32, lineHeight: 1, color: "#F5F5F2", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {portValue != null ? portValue.toFixed(2) : "—"}
            </div>
            {perf != null && (
              <span style={{ fontSize: 14, fontWeight: 500, color: lineColor, fontVariantNumeric: "tabular-nums" }}>
                {isUp ? "▲ +" : "▼ "}{perf.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button
            onClick={() => setShowLines((v) => !v)}
            style={{
              fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "var(--font-mono)",
              color:      showLines ? "#000" : "#6B7280",
              border:     "none",
              background: showLines ? GREEN : "rgba(255,255,255,0.06)",
              boxShadow:  showLines ? `0 0 12px rgba(0,200,5,0.35)` : "none",
              borderRadius: 20, padding: "5px 12px", cursor: "pointer", transition: "all .2s",
            }}
          >
            <T es="Ver activos" en="Show assets" />
          </button>
          <button
            onClick={handleReset}
            style={{
              fontSize: 12, color: "#4B5563", background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20,
              padding: "5px 11px", cursor: "pointer",
            }}
            title="Reset portfolio"
          >↺</button>
        </div>
      </div>

      {/* Card */}
      <div style={{ ...cardStyle(initialized ? isUp : null), padding: "20px 20px 18px", transition: "border-color .4s" }}>

        {/* Chart */}
        <div style={{ position: "relative", height: 260 }}>
          {!initialized && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              — <T es="cargando" en="loading" /> —
            </div>
          )}
          <canvas ref={canvasRef} style={{ opacity: initialized ? 1 : 0, transition: "opacity .3s" }} />
        </div>

        {/* Sliders */}
        <div className="mt-5 space-y-3">
          {symbols.map((sym, idx) => {
            const dotColor  = PALETTE[idx % PALETTE.length];
            const isLoading = loadingSet.has(sym);
            const name =
              sym === TBILL_KEY ? "T-Bills · 5% est."
              : isLoading       ? "…"
              : (assetData[sym]?.name ?? sym);

            return (
              <div key={sym}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: isLoading ? "#1F2937" : dotColor,
                      boxShadow:  isLoading ? "none" : `0 0 7px ${dotColor}80`,
                    }} />
                    <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-sans)" }} className="truncate" title={name}>
                      {name}
                    </span>
                    {sym !== TBILL_KEY && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#374151", letterSpacing: 0.5 }}>{sym}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F5F2", fontVariantNumeric: "tabular-nums" }}>
                      {weights[sym] ?? 0}%
                    </span>
                    <button
                      onClick={() => handleRemove(sym)}
                      style={{ color: "#374151", fontSize: 16, lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: "0 3px", transition: "color .15s" }}
                      onMouseEnter={(e) => e.currentTarget.style.color = RED}
                      onMouseLeave={(e) => e.currentTarget.style.color = "#374151"}
                    >×</button>
                  </div>
                </div>
                <input
                  type="range" min={0} max={100} step={1}
                  value={weights[sym] ?? 0}
                  onChange={(e) => handleSlider(sym, e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                  style={{ accentColor: dotColor, opacity: isLoading ? 0.3 : 1 }}
                />
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="mt-5">
          <div style={{ display: "flex", gap: 7 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value.toUpperCase()); setLastError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={lang === "en" ? "Add ticker… NVDA, BTC-USD, AMXL.MX, GC=F" : "Agregar ticker… NVDA, BTC-USD, AMXL.MX, GC=F"}
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${lastError ? "rgba(255,80,0,0.35)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 12, padding: "9px 13px", fontSize: 13,
                fontFamily: "var(--font-mono)", color: "#F5F5F2", outline: "none", letterSpacing: 0.5,
                transition: "border-color .2s",
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!query.trim() || loading}
              style={{
                background: query.trim() ? `rgba(0,200,5,0.16)` : "transparent",
                border:     `1px solid ${query.trim() ? "rgba(0,200,5,0.35)" : "rgba(255,255,255,0.07)"}`,
                boxShadow:  query.trim() ? "0 0 12px rgba(0,200,5,0.20)" : "none",
                borderRadius: 12, padding: "9px 18px", fontSize: 18, lineHeight: 1,
                color:   query.trim() ? GREEN : "#374151",
                cursor:  query.trim() ? "pointer" : "default",
                transition: "all .2s",
              }}
            >+</button>
          </div>

          {lastError && (
            <div style={{ fontSize: 11, color: RED, marginTop: 6, fontFamily: "var(--font-mono)" }}>
              <T es={`"${lastError.sym}" no encontrado`} en={`"${lastError.sym}" not found`} />
            </div>
          )}

          {/* Quick-add chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
            {QUICK_ADDS.map((s) =>
              !symbols.includes(s) ? (
                <button key={s}
                  onClick={() => { setSymbols((p) => [...p, s]); setWeights((p) => ({ ...p, [s]: 0 })); fetchAsset(s); }}
                  style={{
                    fontSize: 9.5, letterSpacing: 0.5, fontFamily: "var(--font-mono)",
                    color: "#4B5563", border: "1px solid rgba(255,255,255,0.07)",
                    background: "transparent", borderRadius: 20, padding: "3px 9px", cursor: "pointer", transition: "all .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#F5F5F2"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#4B5563"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
                >{s}</button>
              ) : null
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "#4B5563", fontFamily: "var(--font-mono)" }}>
            <T es="Asignado" en="Allocated" />: <span style={{ color: "#F5F5F2" }}>{total}%</span>
          </span>
          <span style={{ fontSize: 11, color: "#4B5563", fontFamily: "var(--font-mono)" }}>
            <T es="Efectivo libre" en="Cash" />:{" "}
            <span style={{ color: 100 - total > 0 ? "#FACC15" : "#374151", fontVariantNumeric: "tabular-nums" }}>
              {Math.max(0, 100 - total)}%
            </span>
          </span>
        </div>

        <p style={{ marginTop: 8, fontSize: 10, color: "#374151", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
          <T
            es="Base 100 · sin ajuste por dividendos · simulación educativa, no asesoría"
            en="Base 100 · unadjusted for dividends · educational simulation, not advice"
          />
        </p>
      </div>
    </section>
  );
}
