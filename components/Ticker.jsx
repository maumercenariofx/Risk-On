"use client";
// components/Ticker.jsx
import { useEffect, useState } from "react";

// [symbol, price, direction (1=up 0=down 2=neutral), pctStr]
const FALLBACK = [
  ["S&P 500",  "5,412",   1, "+0.82%"],
  ["NASDAQ",   "17,890",  1, "+1.10%"],
  ["IPC",      "55,100",  1, "+0.40%"],
  ["USD/MXN",  "18.420",  0, "-0.18%"],
  ["EUR/USD",  "1.0840",  1, "+0.09%"],
  ["AAPL",     "213.49",  1, "+0.61%"],
  ["TSLA",     "248.12",  0, "-1.43%"],
  ["NVDA",     "1,074",   1, "+2.30%"],
  ["BTC",      "67,420",  1, "+1.82%"],
  ["ETH",      "3,512",   1, "+0.94%"],
  ["WTI",      "72.40",   0, "-0.55%"],
  ["Gold",     "3,320",   1, "+0.30%"],
];

export default function Ticker() {
  const [items, setItems] = useState(FALLBACK);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => {
        const fmt = (v, d2) => v != null ? (d2 === 0 ? Math.round(v).toLocaleString() : v.toFixed(d2)) : null;
        const chg = (v, fb) => v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) + "%" : fb;
        const dir = (v) => v == null ? 2 : v >= 0 ? 1 : 0;
        const next = [
          ["S&P 500", fmt(d.spx,  0) ?? FALLBACK[0][1],  dir(d.spxChg),  chg(d.spxChg,  FALLBACK[0][3])],
          ["NASDAQ",  fmt(d.ndx,  0) ?? FALLBACK[1][1],  dir(d.ndxChg),  chg(d.ndxChg,  FALLBACK[1][3])],
          ["IPC",     fmt(d.ipc,  0) ?? FALLBACK[2][1],  dir(d.ipcChg),  chg(d.ipcChg,  FALLBACK[2][3])],
          ["USD/MXN", fmt(d.usdmxn,3) ?? FALLBACK[3][1], 2,              FALLBACK[3][3]],
          ["EUR/USD", fmt(d.eurusd,4) ?? FALLBACK[4][1], 2,              FALLBACK[4][3]],
          ["AAPL",    fmt(d.aapl, 2) ?? FALLBACK[5][1],  dir(d.aaplChg), chg(d.aaplChg, FALLBACK[5][3])],
          ["TSLA",    fmt(d.tsla, 2) ?? FALLBACK[6][1],  dir(d.tslaChg), chg(d.tslaChg, FALLBACK[6][3])],
          ["NVDA",    fmt(d.nvda, 2) ?? FALLBACK[7][1],  dir(d.nvdaChg), chg(d.nvdaChg, FALLBACK[7][3])],
          ["BTC",     fmt(d.btc,  0) ?? FALLBACK[8][1],  dir(d.btcChg),  chg(d.btcChg,  FALLBACK[8][3])],
          ["ETH",     fmt(d.eth,  0) ?? FALLBACK[9][1],  dir(d.ethChg),  chg(d.ethChg,  FALLBACK[9][3])],
          ["WTI",     fmt(d.wti,  2) ?? FALLBACK[10][1], dir(d.wtiChg),  chg(d.wtiChg,  FALLBACK[10][3])],
          ["Gold",    fmt(d.gold, 0) ?? FALLBACK[11][1], dir(d.goldChg), chg(d.goldChg, FALLBACK[11][3])],
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
