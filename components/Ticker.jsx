"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// Cada item del ticker es un link: pares FX → /markets con el par abierto;
// lo demás → /analisis con la lectura técnica del símbolo.
const HREF = {
  "S&P 500": "/analisis?symbol=%5EGSPC",
  "NASDAQ":  "/analisis?symbol=%5EIXIC",
  "IPC":     "/analisis?symbol=%5EMXX",
  "USD/MXN": "/markets?pair=USDMXN",
  "EUR/USD": "/markets?pair=EURUSD",
  "USD/JPY": "/markets?pair=USDJPY",
  "AAPL":    "/analisis?symbol=AAPL",
  "TSLA":    "/analisis?symbol=TSLA",
  "NVDA":    "/analisis?symbol=NVDA",
  "BTC":     "/analisis?symbol=BTC-USD",
  "ETH":     "/analisis?symbol=ETH-USD",
  "WTI":     "/analisis?symbol=CL%3DF",
  "Gold":    "/analisis?symbol=GC%3DF",
  "US 10Y":  "/analisis?symbol=%5ETNX",
};

// Veracidad: NADA de precios hardcodeados de respaldo (llegaron a mostrarse
// valores con meses de antigüedad como si fueran en vivo). Mientras carga o si
// el feed falla, cada instrumento muestra "—".
const NAMES = [
  "S&P 500", "NASDAQ", "IPC", "USD/MXN", "EUR/USD", "AAPL", "TSLA",
  "NVDA", "BTC", "ETH", "WTI", "Gold", "USD/JPY", "US 10Y",
];
const EMPTY = NAMES.map((n) => [n, "—", 2, ""]);

export default function Ticker() {
  const [items, setItems] = useState(EMPTY);
  const [arrived, setArrived] = useState(false); // flash al llegar datos reales

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => {
        const fmt = (v, d2) => v != null ? (d2 === 0 ? Math.round(v).toLocaleString() : v.toFixed(d2)) : "—";
        const chg = (v) => v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) + "%" : "";
        const dir = (v) => v == null ? 2 : v >= 0 ? 1 : 0;
        setItems([
          ["S&P 500", fmt(d.spx,  0),   dir(d.spxChg),   chg(d.spxChg)],
          ["NASDAQ",  fmt(d.ndx,  0),   dir(d.ndxChg),   chg(d.ndxChg)],
          ["IPC",     fmt(d.ipc,  0),   dir(d.ipcChg),   chg(d.ipcChg)],
          ["USD/MXN", fmt(d.usdmxn, 4), dir(d.usdmxnChg), chg(d.usdmxnChg)],
          ["EUR/USD", fmt(d.eurusd, 4), dir(d.eurusdChg), chg(d.eurusdChg)],
          ["AAPL",    fmt(d.aapl, 2),   dir(d.aaplChg),  chg(d.aaplChg)],
          ["TSLA",    fmt(d.tsla, 2),   dir(d.tslaChg),  chg(d.tslaChg)],
          ["NVDA",    fmt(d.nvda, 2),   dir(d.nvdaChg),  chg(d.nvdaChg)],
          ["BTC",     fmt(d.btc,  0),   dir(d.btcChg),   chg(d.btcChg)],
          ["ETH",     fmt(d.eth,  0),   dir(d.ethChg),   chg(d.ethChg)],
          ["WTI",     fmt(d.wti,  2),   dir(d.wtiChg),   chg(d.wtiChg)],
          ["Gold",    fmt(d.gold, 0),   dir(d.goldChg),  chg(d.goldChg)],
          ["USD/JPY", fmt(d.usdjpy, 2), dir(d.usdjpyChg), chg(d.usdjpyChg)],
          ["US 10Y",  fmt(d.us10y, 2),  dir(d.us10yChg), chg(d.us10yChg)],
        ]);
        setArrived(true);
      })
      .catch(() => {});
  }, []);

  const arrow = (dir) => (dir === 1 ? "▲" : dir === 0 ? "▼" : "·");
  // Tonos con contraste AA sobre negro (los de marca #0F8A5F/#A32D2D dan
  // 4.5/2.8:1 y esto es texto de 10px — auditoría a11y 2026-07-13).
  const color = (dir) => (dir === 1 ? "#14A276" : dir === 0 ? "#CE5555" : "#8A8A8E");

  const row = (key) =>
    items.map((t, i) => {
      const inner = (
        <>
          <span style={{ color: "#8A8A8E", letterSpacing: 1 }}>{t[0]}</span>
          <span style={{ color: "#F5F5F2", fontWeight: 500 }}>{t[1]}</span>
          <span style={{ color: color(t[2]), fontSize: 10 }}>{arrow(t[2])} {t[3]}</span>
        </>
      );
      const style = {
        fontFamily: "var(--font-mono)", fontSize: 12,
        display: "inline-flex", alignItems: "baseline", gap: 5,
        textDecoration: "none",
      };
      const href = HREF[t[0]];
      return href ? (
        <Link key={`${key}-${i}`} href={href} className="ticker-item" style={style}>
          {inner}
        </Link>
      ) : (
        <span key={`${key}-${i}`} style={style}>{inner}</span>
      );
    });

  return (
    <div style={{
      position: "relative",
      left: "50%",
      marginLeft: "-50vw",
      width: "100vw",
      overflow: "hidden",
    }}>
      {/* El flash va en la BANDA, no en la pista: .data-arrive define animation
          y en la pista pisaría el ticker-scroll (así se detuvo el marquee). */}
      <div className={`ticker-band${arrived ? " data-arrive" : ""}`} style={{ padding: "11px 0" }}>
        <div className="ticker-track">
          {row("a")}
          {row("b")}
        </div>
      </div>
    </div>
  );
}
