"use client";
// components/Ticker.jsx
import { useEffect, useState } from "react";

// [symbol, price, direction (1=up 0=down 2=neutral), pctStr]
const FALLBACK = [
  ["S&P 500",  "5,412",   1, "+0.82%"],
  ["NASDAQ",   "17,890",  1, "+1.10%"],
  ["USD/MXN",  "18.420",  0, "-0.18%"],
  ["EUR/USD",  "1.0840",  1, "+0.09%"],
  ["AAPL",     "213.49",  1, "+0.61%"],
  ["TSLA",     "248.12",  0, "-1.43%"],
  ["NVDA",     "1,074",   1, "+2.30%"],
  ["BTC",      "67,420",  1, "+1.82%"],
  ["ETH",      "3,512",   1, "+0.94%"],
];

export default function Ticker() {
  const [items, setItems] = useState(FALLBACK);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => {
        const next = [
          ["S&P 500",  d.spx     ? Math.round(d.spx).toLocaleString()      : FALLBACK[0][1],  d.spxChg  >= 0 ? 1 : 0, d.spxChg  != null ? (d.spxChg  >= 0 ? "+" : "") + d.spxChg.toFixed(2)  + "%" : FALLBACK[0][3]],
          ["NASDAQ",   d.ndx     ? Math.round(d.ndx).toLocaleString()      : FALLBACK[1][1],  d.ndxChg  >= 0 ? 1 : 0, d.ndxChg  != null ? (d.ndxChg  >= 0 ? "+" : "") + d.ndxChg.toFixed(2)  + "%" : FALLBACK[1][3]],
          ["USD/MXN",  d.usdmxn  ? d.usdmxn.toFixed(3)                    : FALLBACK[2][1],  2,                        FALLBACK[2][3]],
          ["EUR/USD",  d.eurusd  ? d.eurusd.toFixed(4)                    : FALLBACK[3][1],  2,                        FALLBACK[3][3]],
          ["AAPL",     d.aapl    ? d.aapl.toFixed(2)                      : FALLBACK[4][1],  d.aaplChg >= 0 ? 1 : 0, d.aaplChg != null ? (d.aaplChg >= 0 ? "+" : "") + d.aaplChg.toFixed(2)  + "%" : FALLBACK[4][3]],
          ["TSLA",     d.tsla    ? d.tsla.toFixed(2)                      : FALLBACK[5][1],  d.tslaChg >= 0 ? 1 : 0, d.tslaChg != null ? (d.tslaChg >= 0 ? "+" : "") + d.tslaChg.toFixed(2)  + "%" : FALLBACK[5][3]],
          ["NVDA",     d.nvda    ? d.nvda.toFixed(2)                      : FALLBACK[6][1],  d.nvdaChg >= 0 ? 1 : 0, d.nvdaChg != null ? (d.nvdaChg >= 0 ? "+" : "") + d.nvdaChg.toFixed(2)  + "%" : FALLBACK[6][3]],
          ["BTC",      d.btc     ? Math.round(d.btc).toLocaleString()     : FALLBACK[7][1],  d.btcChg  >= 0 ? 1 : 0, d.btcChg  != null ? (d.btcChg  >= 0 ? "+" : "") + d.btcChg.toFixed(2)   + "%" : FALLBACK[7][3]],
          ["ETH",      d.eth     ? Math.round(d.eth).toLocaleString()     : FALLBACK[8][1],  d.ethChg  >= 0 ? 1 : 0, d.ethChg  != null ? (d.ethChg  >= 0 ? "+" : "") + d.ethChg.toFixed(2)   + "%" : FALLBACK[8][3]],
        ];
        setItems(next);
      })
      .catch(() => {});
  }, []);

  const arrow = (dir) => (dir === 1 ? "▲" : dir === 0 ? "▼" : "•");
  const color = (dir) => (dir === 1 ? "#0F8A5F" : dir === 0 ? "#A32D2D" : "#8A8A8E");

  const row = (key) =>
    items.map((t, i) => (
      <span key={`${key}-${i}`} style={{ fontFamily: "var(--font-mono)", fontSize: 12, display: "inline-flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ color: "#8A8A8E", letterSpacing: 1 }}>{t[0]}</span>
        <span style={{ color: "#F5F5F2", fontWeight: 500 }}>{t[1]}</span>
        <span style={{ color: color(t[2]), fontSize: 10 }}>{arrow(t[2])} {t[3]}</span>
      </span>
    ));

  return (
    <div style={{
      position: "relative",
      left: "50%",
      marginLeft: "-50vw",
      width: "100vw",
      overflow: "hidden",
      height: 48,
      display: "flex",
      alignItems: "center",
    }}>
      <div
        className="ticker-band"
        style={{
          transform: "rotate(-4deg)",
          background: "#111113",
          borderTop: "1px solid #1E1E22",
          borderBottom: "1px solid #1E1E22",
          padding: "11px 0",
          width: "115%",
          position: "absolute",
          left: "-7.5%",
        }}
      >
        <div className="ticker-track">
          {row("a")}
          {row("b")}
        </div>
      </div>
    </div>
  );
}
