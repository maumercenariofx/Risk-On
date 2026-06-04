"use client";
// components/Ticker.jsx
import { useEffect, useState } from "react";

const FALLBACK = [
  ["USD/MXN", "18.42", 1], ["EUR/USD", "1.084", 0], ["S&P 500", "5,412", 1],
  ["NASDAQ", "17,890", 1], ["VIX", "13.4", 0], ["DXY", "104.3", 0],
  ["Gold", "2,338", 1], ["BTC", "67,420", 1],
];

export default function Ticker() {
  const [items, setItems] = useState(FALLBACK);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => {
        setItems([
          ["USD/MXN", d.usdmxn?.toFixed(3), 2],
          ["EUR/USD", d.eurusd?.toFixed(4), 2],
          ["S&P 500", Math.round(d.spx).toLocaleString(), 1],
          ["NASDAQ", Math.round(d.ndx).toLocaleString(), 1],
          ["VIX", d.vix?.toFixed(1), d.vix < 15 ? 0 : 1],
          ["DXY", d.dxy?.toFixed(1), 2],
          ["MOVE", Math.round(d.move).toString(), 2],
        ]);
      })
      .catch(() => {});
  }, []);

  const arrow = (s) => (s === 1 ? "▲" : s === 0 ? "▼" : "•");
  const cls = (s) => (s === 1 ? "text-riskon" : s === 0 ? "text-riskoff" : "text-muted");

  const row = (key) =>
    items.map((t, i) => (
      <span key={`${key}-${i}`} className="font-mono text-[13px]">
        <b className="font-medium text-bone">{t[0]}</b> {t[1]}{" "}
        <span className={cls(t[2])}>{arrow(t[2])}</span>
      </span>
    ));

  return (
    <div className="ticker-wrap overflow-hidden border-y border-edge bg-ink2/40 py-2.5">
      <div className="ticker-track">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
