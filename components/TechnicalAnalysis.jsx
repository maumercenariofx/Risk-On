"use client";
// components/TechnicalAnalysis.jsx
// Sección de análisis técnico interactiva: el usuario elige un activo de la
// lista curada (o escribe cualquier símbolo de Yahoo) y se calcula el tablero
// de indicadores + señal al instante contra /api/ta.
import { useEffect, useState, useCallback } from "react";
import { useLang, t } from "./Lang";

const GREEN = "#00C805";
const RED = "#FF5000";
const AMBER = "#F59E0B";

const CURATED = [
  { symbol: "MXN=X", label: "USD/MXN" },
  { symbol: "EURMXN=X", label: "EUR/MXN" },
  { symbol: "EURUSD=X", label: "EUR/USD" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "ES=F", label: "S&P Futuros" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^MXX", label: "IPC México" },
  { symbol: "GC=F", label: "Oro" },
  { symbol: "CL=F", label: "WTI" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "^TNX", label: "US 10Y" },
  { symbol: "DX-Y.NYB", label: "DXY" },
];

const BIAS = {
  bull: { dot: GREEN, es: "ALCISTA", en: "BULLISH" },
  bear: { dot: RED, es: "BAJISTA", en: "BEARISH" },
  neutral: { dot: AMBER, es: "NEUTRAL", en: "NEUTRAL" },
};

const REASON_LABEL = {
  "ema50|bull": ["Sobre la EMA50", "Above EMA50"],
  "ema50|bear": ["Bajo la EMA50", "Below EMA50"],
  "ema200|bull": ["Sobre la EMA200", "Above EMA200"],
  "ema200|bear": ["Bajo la EMA200", "Below EMA200"],
  "cross|bull": ["Golden cross (EMA50>200)", "Golden cross (EMA50>200)"],
  "cross|bear": ["Death cross (EMA50<200)", "Death cross (EMA50<200)"],
  "macd|bull": ["MACD positivo", "MACD positive"],
  "macd|bear": ["MACD negativo", "MACD negative"],
  "rsi|overbought": ["RSI sobrecompra", "RSI overbought"],
  "rsi|oversold": ["RSI sobreventa", "RSI oversold"],
  "rsi|neutral": ["RSI neutral", "RSI neutral"],
};

export default function TechnicalAnalysis() {
  const { lang } = useLang();
  const [symbol, setSymbol] = useState("MXN=X");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (sym) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ta?symbol=${encodeURIComponent(sym)}`);
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "error");
      setData(j);
    } catch (e) {
      setError(e.message); setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(symbol); }, [symbol, load]);

  const submitSearch = (e) => {
    e.preventDefault();
    const s = search.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  const dp = data?.decimals ?? 4;
  const fmt = (x) =>
    x == null ? "—" : Number(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const curatedLabel = CURATED.find((c) => c.symbol === symbol)?.label;
  const bias = data ? BIAS[data.verdict.bias] : null;
  const up = (data?.chgPct ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-medium text-bone">
          {t(lang, "Análisis Técnico", "Technical Analysis")}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t(lang,
            "Elige un activo y obtén lectura técnica al instante: tendencia, MACD, RSI, niveles y señal.",
            "Pick an asset for an instant technical read: trend, MACD, RSI, levels and signal.")}
        </p>
      </header>

      {/* Selector */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {CURATED.map((c) => (
            <button
              key={c.symbol}
              onClick={() => { setSymbol(c.symbol); setSearch(""); }}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                symbol === c.symbol
                  ? "border-bone/50 bg-white/10 text-bone"
                  : "border-edge text-muted hover:text-bone"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <form onSubmit={submitSearch} className="sm:ml-auto">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(lang, "Símbolo (AAPL, TSLA…)", "Symbol (AAPL, TSLA…)")}
            className="w-full rounded-md border border-edge bg-black px-3 py-1.5 text-sm text-bone placeholder:text-muted focus:border-bone/50 focus:outline-none sm:w-48"
          />
        </form>
      </div>

      {/* Estado */}
      {loading && <Card><div className="py-12 text-center text-muted">{t(lang, "Cargando…", "Loading…")}</div></Card>}
      {error && !loading && (
        <Card>
          <div className="py-12 text-center text-muted">
            {t(lang, "No se pudo analizar ", "Couldn't analyze ")}
            <span className="text-bone">{symbol}</span> — {error}.
            <div className="mt-1 text-xs">{t(lang, "Revisa el símbolo (formato Yahoo Finance).", "Check the symbol (Yahoo Finance format).")}</div>
          </div>
        </Card>
      )}

      {data && !loading && !error && (
        <Card>
          {/* Encabezado del activo */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-4">
            <div>
              <div className="font-serif text-2xl text-bone">{curatedLabel || data.symbol}</div>
              <div className="text-xs text-muted">{data.symbol}{data.exchange ? ` · ${data.exchange}` : ""}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl text-bone">{fmt(data.price)}</div>
              <div className="font-mono text-sm" style={{ color: up ? GREEN : RED }}>
                {up ? "+" : ""}{data.chgPct?.toFixed(2)}%
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-edge px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: bias.dot }} />
              <span className="text-sm font-medium text-bone">{t(lang, bias.es, bias.en)}</span>
            </div>
          </div>

          {/* Razones (chips) */}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.verdict.reasons.map((r, i) => {
              const lab = REASON_LABEL[`${r.k}|${r.dir}`];
              if (!lab) return null;
              const col = r.dir === "bull" || r.dir === "oversold" ? GREEN
                : r.dir === "bear" || r.dir === "overbought" ? RED : "#9CA3AF";
              return (
                <span key={i} className="rounded border border-edge px-2 py-1 text-xs" style={{ color: col }}>
                  {lang === "en" ? lab[1] : lab[0]}
                </span>
              );
            })}
          </div>

          {/* Indicadores */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="EMA 20/50/200" value={`${fmt(data.indicators.ema20)} · ${fmt(data.indicators.ema50)} · ${fmt(data.indicators.ema200)}`} small />
            <Metric label="RSI(14)" value={data.indicators.rsi ?? "—"}
              color={data.indicators.rsi >= 70 ? RED : data.indicators.rsi <= 30 ? GREEN : undefined} />
            <Metric label="MACD"
              value={macdText(data.indicators.macd, lang)}
              color={data.indicators.macd?.histogram > 0 ? GREEN : RED} small />
            <Metric label="ATR(14)" value={fmt(data.indicators.atr)} />
          </div>

          {/* Niveles */}
          <div className="mt-5 rounded-md border border-edge p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-muted">{t(lang, "Niveles clave", "Key levels")}</div>
            <div className="grid grid-cols-5 gap-2 text-center font-mono text-sm">
              <Lvl tag="S2" v={fmt(data.levels.pivots?.s2)} color={GREEN} />
              <Lvl tag="S1" v={fmt(data.levels.pivots?.s1)} color={GREEN} />
              <Lvl tag="PP" v={fmt(data.levels.pivots?.pp)} />
              <Lvl tag="R1" v={fmt(data.levels.pivots?.r1)} color={RED} />
              <Lvl tag="R2" v={fmt(data.levels.pivots?.r2)} color={RED} />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted">
              <span>{t(lang, "Máx ayer", "Prev high")}: <span className="font-mono text-bone">{fmt(data.levels.prevHigh)}</span></span>
              <span>{t(lang, "Mín ayer", "Prev low")}: <span className="font-mono text-bone">{fmt(data.levels.prevLow)}</span></span>
              <span>VWAP: <span className="font-mono text-bone">{data.indicators.vwap ? fmt(data.indicators.vwap) : t(lang, "N/D (sin volumen)", "N/A (no volume)")}</span></span>
              <span>Bollinger: <span className="font-mono text-bone">{fmt(data.indicators.bollinger?.lower)} – {fmt(data.indicators.bollinger?.upper)}</span></span>
            </div>
          </div>

          {/* Señal */}
          <div className="mt-5 rounded-md border-l-2 p-4" style={{ borderColor: bias.dot, background: "rgba(255,255,255,0.02)" }}>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted">{t(lang, "Señal", "Signal")}</div>
            <p className="text-sm leading-relaxed text-bone">{lang === "en" ? data.signal.en : data.signal.es}</p>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            {t(lang,
              "Indicadores calculados con datos de Yahoo Finance (diario 6m + intradía 1m). Informativo, no es recomendación de inversión.",
              "Indicators computed from Yahoo Finance data (6m daily + 1m intraday). Informational, not investment advice.")}
          </p>
        </Card>
      )}
    </div>
  );
}

function macdText(m, lang) {
  if (!m) return "—";
  const sign = m.histogram > 0 ? "+" : "";
  const dir = m.rising ? (lang === "en" ? "↑" : "↑") : "↓";
  const cross = m.cross === "bull" ? (lang === "en" ? " cross▲" : " cruce▲")
    : m.cross === "bear" ? (lang === "en" ? " cross▼" : " cruce▼") : "";
  return `${sign}${m.histogram} ${dir}${cross}`;
}

function Card({ children }) {
  return <div className="rounded-lg border border-edge bg-white/[0.02] p-5">{children}</div>;
}

function Metric({ label, value, color, small }) {
  return (
    <div className="rounded-md border border-edge p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-mono ${small ? "text-sm" : "text-lg"} text-bone`} style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function Lvl({ tag, v, color }) {
  return (
    <div>
      <div className="text-[10px] text-muted">{tag}</div>
      <div style={color ? { color } : undefined} className={color ? "" : "text-bone"}>{v}</div>
    </div>
  );
}
