"use client";
import { T } from "./Lang";
import YieldCurveChart from "./YieldCurveChart";
import COTCard from "./COTCard";
import CorrelationScatter from "./CorrelationScatter";

export default function AdvancedData() {
  return (
    <section className="reveal" style={{ animationDelay: "0.3s" }}>
      <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#8A8A8E", marginBottom: 12 }}>
        &mdash; <T es="Datos avanzados" en="Advanced data" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <YieldCurveChart />
        <COTCard />
        <CorrelationScatter />
      </div>
    </section>
  );
}
