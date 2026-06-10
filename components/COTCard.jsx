"use client";
import { useEffect, useState } from "react";
import { T } from "./Lang";

export default function COTCard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/cot").then((r) => r.json()).then(setData).catch(() => setData({ available: false }));
  }, []);

  if (!data || !data.available) return null;

  const netLong = data.net >= 0;
  const bias = netLong
    ? { es: "Especuladores netos largos en MXN — apuestan a un peso mas fuerte.", en: "Speculators net long MXN — betting on a stronger peso." }
    : { es: "Especuladores netos cortos en MXN — apuestan a un peso mas debil.", en: "Speculators net short MXN — betting on a weaker peso." };

  const changeUp = (data.netChange ?? 0) >= 0;

  return (
    <div className="card-glass" style={{ background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 8 }}>
        <T es="COT · Peso (CME, no comerciales)" en="COT · Peso (CME, non-commercials)" />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, lineHeight: 1, color: netLong ? "#0F8A5F" : "#A32D2D" }}>
        {netLong ? "+" : ""}{data.net.toLocaleString()}
      </div>
      {data.netChange != null && (
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: changeUp ? "#0F8A5F" : "#A32D2D", marginTop: 6 }}>
          {changeUp ? "▲" : "▼"} {Math.abs(data.netChange).toLocaleString()} <T es="vs semana previa" en="vs prior week" />
        </div>
      )}
      <p style={{ fontSize: 12, color: "#8A8A8E", lineHeight: 1.6, marginTop: 10 }}>
        <T es={bias.es} en={bias.en} />
      </p>
      <div style={{ fontSize: 9, color: "#4A4A50", marginTop: 8 }}>
        <T es="Reporte CFTC" en="CFTC report" />: {data.date}
      </div>
    </div>
  );
}
