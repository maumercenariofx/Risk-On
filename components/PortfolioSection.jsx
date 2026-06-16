"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

// ── helpers ──────────────────────────────────────────────────────────────────

function normalize(points) {
  if (!points.length) return [];
  const base = points[0].close;
  return points.map((p) => ({ date: p.date, value: (p.close / base) * 100 }));
}

function alignToCalendar(normalized, calDates) {
  const map  = new Map(normalized.map((p) => [p.date, p.value]));
  let   last = normalized[0]?.value ?? 100;
  return calDates.map((d) => {
    if (map.has(d)) last = map.get(d);
    return last;
  });
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

const TBILL_KEY = "TBILL";

const LS_KEY = "riskon_portfolio_v3";

const DEFAULTS = {
  symbols: ["^GSPC", TBILL_KEY],
  weights: { "^GSPC": 70, [TBILL_KEY]: 30 },
};

// ── localStorage ─────────────────────────────────────────────────────────────

function loadLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLS(symbols, weights) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ symbols, weights })); } catch {}
}

// ── crosshair plugin ─────────────────────────────────────────────────────────

const crosshairPlugin = {
  id: "crosshair",
  afterDraw(chart) {
    if (!chart.tooltip._active?.length) return;
    const ctx = chart.ctx;
    const x   = chart.tooltip._active[0].element.x;
    const { top, bottom } = chart.scales.y;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top); ctx.lineTo(x, bottom);
    ctx.lineWidth   = 1;
    ctx.strokeStyle = "rgba(245,245,242,0.12)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

// ── component ────────────────────────────────────────────────────────────────

export default function PortfolioSection() {
  const { lang } = useLang();
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const [symbols,        setSymbols]        = useState(DEFAULTS.symbols);
  const [weights,        setWeights]        = useState(DEFAULTS.weights);
  const [assetData,      setAssetData]      = useState({});   // { sym: { name, currency, points[] } }
  const [loadingSet,     setLoadingSet]     = useState(new Set());
  const [lastError,      setLastError]      = useState(null); // { sym, msg }
  const [query,          setQuery]          = useState("");
  const [portValue,      setPortValue]      = useState(null);
  const [showLines,      setShowLines]      = useState(false);
  const [initialized,    setInitialized]    = useState(false);

  // ── fetch one symbol ──────────────────────────────────────────────────────

  const fetchAsset = useCallback(async (sym) => {
    if (sym === TBILL_KEY) return;                   // synthetic, no fetch needed
    setLoadingSet((s) => new Set([...s, sym]));
    setLastError(null);
    try {
      const res = await fetch(`/api/asset?symbol=${encodeURIComponent(sym)}`);
      const d   = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "not found");
      setAssetData((prev) => ({ ...prev, [sym]: d }));
    } catch (e) {
      setLastError({ sym, msg: e.message });
      // Roll back the optimistic add
      setSymbols((prev) => prev.filter((s) => s !== sym));
      setWeights((prev) => { const w = { ...prev }; delete w[sym]; return w; });
    } finally {
      setLoadingSet((s) => { const n = new Set(s); n.delete(sym); return n; });
    }
  }, []);

  // ── initialize from localStorage ─────────────────────────────────────────

  useEffect(() => {
    const saved = loadLS();
    const syms  = saved?.symbols ?? DEFAULTS.symbols;
    const wgts  = saved?.weights ?? DEFAULTS.weights;
    setSymbols(syms);
    setWeights(wgts);
    Promise.all(syms.filter((s) => s !== TBILL_KEY).map(fetchAsset))
      .finally(() => setInitialized(true));
  }, []); // eslint-disable-line

  // ── save to localStorage on change ───────────────────────────────────────

  useEffect(() => {
    if (initialized) saveLS(symbols, weights);
  }, [symbols, weights, initialized]);

  // ── build + render chart ─────────────────────────────────────────────────

  useEffect(() => {
    const loaded = symbols.filter((s) => s === TBILL_KEY || assetData[s]?.points?.length);
    if (!loaded.length || !canvasRef.current) return;

    // Master calendar: longest non-TBILL series
    let calDates = [];
    for (const s of loaded) {
      if (s === TBILL_KEY) continue;
      const pts = assetData[s]?.points ?? [];
      if (pts.length > calDates.length) calDates = pts.map((p) => p.date);
    }
    if (!calDates.length) return;

    const n      = calDates.length;
    const labels = calDates.map((d) =>
      new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    );

    // Align all series to calendar
    const seriesMap = {};
    for (const s of loaded) {
      seriesMap[s] = s === TBILL_KEY
        ? tbillSeries(n)
        : alignToCalendar(normalize(assetData[s].points), calDates);
    }

    // Weighted portfolio (unallocated → cash at 100)
    const total     = Object.values(weights).reduce((a, b) => a + b, 0);
    const unalloc   = Math.max(0, 100 - total);
    const portfolio = calDates.map((_, i) => {
      let sum = unalloc; // unallocated treated as flat cash
      for (const s of loaded) {
        const w = (weights[s] ?? 0) / 100;
        const v = seriesMap[s]?.[i];
        if (v != null) sum += w * v;
      }
      return +(sum).toFixed(4);
    });

    setPortValue(portfolio[portfolio.length - 1] ?? null);

    let cancelled = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled) return;
      if (chartRef.current) chartRef.current.destroy();

      const datasets = [];

      // Individual asset lines (toggled)
      if (showLines) {
        loaded.forEach((sym, idx) => {
          const color = PALETTE[idx % PALETTE.length];
          datasets.push({
            label:       assetData[sym]?.name ?? sym,
            data:        seriesMap[sym],
            borderColor: color + "70",
            borderWidth: 1,
            pointRadius: 0,
            tension:     0.25,
            fill:        false,
          });
        });
      }

      // Portfolio combined (always last = topmost)
      datasets.push({
        label:                     lang === "en" ? "Portfolio" : "Portafolio",
        data:                      portfolio,
        borderColor:               "#F5F5F2",
        backgroundColor:           "rgba(245,245,242,0.04)",
        fill:                      true,
        tension:                   0.25,
        pointRadius:               0,
        pointHoverRadius:          4,
        pointHoverBackgroundColor: "#F5F5F2",
        pointHoverBorderColor:     "#0A0A0B",
        pointHoverBorderWidth:     2,
        borderWidth:               2,
      });

      chartRef.current = new Chart(canvasRef.current, {
        type:    "line",
        plugins: [crosshairPlugin],
        data:    { labels, datasets },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          interaction:         { intersect: false, mode: "index" },
          animation:           { duration: 220 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#111113",
              borderColor:     "#1E1E22",
              borderWidth:     1,
              titleColor:      "#8A8A8E",
              bodyColor:       "#F5F5F2",
              titleFont:       { size: 11 },
              bodyFont:        { family: "var(--font-mono)", size: 12 },
              padding:         10,
              itemSort:        (a, b) => b.raw - a.raw,
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (c) => ` ${c.dataset.label}: ${(+c.parsed.y).toFixed(2)}`,
              },
            },
          },
          scales: {
            x: {
              ticks:  { color: "#8A8A8E", font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 },
              grid:   { display: false },
              border: { color: "#1E1E22" },
            },
            y: {
              ticks:  { color: "#8A8A8E", font: { size: 10, family: "var(--font-mono)" }, callback: (v) => v.toFixed(0), maxTicksLimit: 6 },
              grid:   { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
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
      const otherTotal = Object.entries(prev)
        .filter(([k]) => k !== key)
        .reduce((a, [, v]) => a + v, 0);
      return { ...prev, [key]: Math.min(value, Math.max(0, 100 - otherTotal)) };
    });
  };

  const handleReset = () => {
    setSymbols(DEFAULTS.symbols);
    setWeights(DEFAULTS.weights);
    setAssetData({});
    setLastError(null);
    DEFAULTS.symbols.filter((s) => s !== TBILL_KEY).forEach(fetchAsset);
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const total   = Object.values(weights).reduce((a, b) => a + b, 0);
  const perf    = portValue != null ? portValue - 100 : null;
  const loading = loadingSet.size > 0;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <section className="reveal" style={{ animationDelay: "0.15s" }}>

      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted">
            <T es="Portafolio simulado · 1 año" en="Simulated portfolio · 1Y" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="font-mono text-2xl font-medium text-bone">
              {portValue != null ? portValue.toFixed(2) : "—"}
            </div>
            {perf != null && (
              <span className="font-mono text-sm" style={{ color: perf >= 0 ? "#0F8A5F" : "#A32D2D" }}>
                {perf >= 0 ? "+" : ""}{perf.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          {/* Toggle individual lines */}
          <button
            onClick={() => setShowLines((v) => !v)}
            style={{
              fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              color:      showLines ? "#F5F5F2" : "#4A4A50",
              border:     `1px solid ${showLines ? "#3A3A3E" : "#1E1E20"}`,
              background: showLines ? "rgba(255,255,255,0.06)" : "transparent",
              borderRadius: 6, padding: "4px 9px", cursor: "pointer", transition: "all .2s",
            }}
          >
            <T es="Ver activos" en="Show assets" />
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            style={{
              fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              color: "#4A4A50", border: "1px solid #1E1E20",
              background: "transparent",
              borderRadius: 6, padding: "4px 9px", cursor: "pointer",
            }}
            title="Reset portfolio"
          >
            ↺
          </button>
        </div>
      </div>

      <div
        className="card-glass rounded-2xl p-5"
        style={{ background: "rgba(5,5,6,0.50)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      >
        {/* Chart */}
        <div style={{ position: "relative", height: 260 }}>
          {!initialized && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "#8A8A8E", fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
            }}>
              — <T es="cargando" en="loading" /> —
            </div>
          )}
          <canvas ref={canvasRef} style={{ opacity: initialized ? 1 : 0, transition: "opacity .3s" }} />
        </div>

        {/* Sliders */}
        <div className="mt-5 space-y-3">
          {symbols.map((sym, idx) => {
            const dotColor = PALETTE[idx % PALETTE.length];
            const isLoading = loadingSet.has(sym);
            const name =
              sym === TBILL_KEY
                ? (lang === "en" ? "T-Bills · 5% est." : "T-Bills · 5% est.")
                : isLoading
                ? "…"
                : (assetData[sym]?.name ?? sym);

            return (
              <div key={sym}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: isLoading ? "#2A2A2E" : dotColor,
                      boxShadow:  isLoading ? "none" : `0 0 5px ${dotColor}55`,
                    }} />
                    <span className="text-xs text-muted truncate" style={{ maxWidth: 200 }}>{name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3A3A3E", letterSpacing: 1, flexShrink: 0 }}>
                      {sym === TBILL_KEY ? "" : sym}
                    </span>
                    {isLoading && (
                      <span style={{ fontSize: 9, color: "#3A3A3E", letterSpacing: 1 }}>…</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#F5F5F2" }}>
                      {weights[sym] ?? 0}%
                    </span>
                    <button
                      onClick={() => handleRemove(sym)}
                      style={{
                        color: "#3A3A3E", fontSize: 16, lineHeight: 1,
                        background: "none", border: "none", cursor: "pointer",
                        padding: "0 3px", transition: "color .15s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = "#A32D2D"}
                      onMouseLeave={(e) => e.currentTarget.style.color = "#3A3A3E"}
                      title="Remove"
                    >
                      ×
                    </button>
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

        {/* Search bar */}
        <div className="mt-5">
          <div style={{ display: "flex", gap: 7 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value.toUpperCase()); setLastError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={lang === "en" ? "Add ticker… NVDA, BTC-USD, AMXL.MX, GC=F" : "Agregar ticker… NVDA, BTC-USD, AMXL.MX, GC=F"}
              style={{
                flex:        1,
                background:  "rgba(255,255,255,0.04)",
                border:      `1px solid ${lastError ? "#A32D2D55" : "#1E1E20"}`,
                borderRadius: 8,
                padding:     "9px 12px",
                fontSize:    13,
                fontFamily:  "var(--font-mono)",
                color:       "#F5F5F2",
                outline:     "none",
                letterSpacing: 0.5,
                transition:  "border-color .2s",
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!query.trim() || loading}
              style={{
                background:   query.trim() ? "rgba(63,167,126,0.14)" : "transparent",
                border:       `1px solid ${query.trim() ? "#3FA77E55" : "#1E1E20"}`,
                borderRadius: 8,
                padding:      "9px 18px",
                fontSize:     16,
                fontFamily:   "var(--font-mono)",
                color:        query.trim() ? "#3FA77E" : "#4A4A50",
                cursor:       query.trim() ? "pointer" : "default",
                transition:   "all .2s",
                lineHeight:   1,
              }}
            >
              +
            </button>
          </div>

          {lastError && (
            <div style={{ fontSize: 11, color: "#A32D2D", marginTop: 6, fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}>
              <T
                es={`"${lastError.sym}" no encontrado — verifica el símbolo`}
                en={`"${lastError.sym}" not found — check the symbol`}
              />
            </div>
          )}

          {/* Quick-add chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
            {["NVDA", "BTC-USD", "GC=F", "TLT", "QQQ", "GLD", "AMXL.MX", "JPM", "TSLA", "AAPL"].map((s) =>
              !symbols.includes(s) ? (
                <button
                  key={s}
                  onClick={() => { setQuery(""); setSymbols((p) => [...p, s]); setWeights((p) => ({ ...p, [s]: 0 })); fetchAsset(s); }}
                  style={{
                    fontSize: 9.5, letterSpacing: 1, fontFamily: "var(--font-mono)",
                    color: "#5A5A68", border: "1px solid #1E1E20",
                    background: "transparent", borderRadius: 5,
                    padding: "3px 8px", cursor: "pointer", transition: "all .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#F5F5F2"; e.currentTarget.style.borderColor = "#3A3A3E"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#5A5A68"; e.currentTarget.style.borderColor = "#1E1E20"; }}
                >
                  {s}
                </button>
              ) : null
            )}
          </div>
        </div>

        {/* Footer bar */}
        <div className="mt-4 flex items-center justify-between border-t border-edge pt-3 text-[11px]">
          <span className="text-muted">
            <T es="Asignado" en="Allocated" />:{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: "#F5F5F2" }}>{total}%</span>
          </span>
          <span className="text-muted">
            <T es="Efectivo libre" en="Unallocated cash" />:{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: 100 - total > 0 ? "#BA7517" : "#4A4A50" }}>
              {Math.max(0, 100 - total)}%
            </span>
          </span>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-muted/70">
          <T
            es="Base 100 · sin ajuste por dividendos ni splits · simulación educativa, no asesoría de inversión"
            en="Base 100 · unadjusted for dividends/splits · educational simulation, not investment advice"
          />
        </p>
      </div>
    </section>
  );
}
