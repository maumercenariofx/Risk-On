"use client";
import { useEffect, useState } from "react";
import { T } from "./Lang";

// ─── ACTUALIZA ESTAS FECHAS CUANDO SE PUBLIQUEN LOS CALENDARIOS ──────────────
// Fed:     reunión FOMC — hora ET (verano = -04:00, invierno = -05:00)
// Banxico: reunión Junta de Gobierno — hora CDMX (-06:00 invierno, -05:00 verano)
const NEXT_FED     = new Date("2026-07-29T14:00:00-04:00");
const NEXT_BANXICO = new Date("2026-06-26T13:00:00-06:00");
// ─────────────────────────────────────────────────────────────────────────────

function useCountdown(target) {
  const [r, setR] = useState(null);
  useEffect(() => {
    const calc = () => {
      const diff = target - Date.now();
      if (diff <= 0) return setR({ d: 0, h: 0, m: 0, s: 0, past: true });
      setR({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        past: false,
      });
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [target]);
  return r;
}

function pad(n) { return String(n ?? 0).padStart(2, "0"); }

function Unit({ value, label }) {
  return (
    <div style={{ textAlign: "center", minWidth: 36 }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500,
        color: "#F5F5F2", lineHeight: 1, letterSpacing: -1,
      }}>
        {pad(value)}
      </div>
      <div style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: "#3A3A3E", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function Colon() {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 16, color: "#2E2E32",
      alignSelf: "flex-start", marginTop: 4, flexShrink: 0,
    }}>:</div>
  );
}

function Countdown({ target, label_es, label_en }) {
  const r = useCountdown(target);
  return (
    <div
      className="card-glass"
      style={{
        background: "rgba(5,5,6,0.50)", border: "1px solid #1E1E20",
        borderRadius: 12, padding: "16px 18px", flex: "1 1 200px",
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 14 }}>
        <T es={label_es} en={label_en} />
      </div>
      {r?.past ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#3A3A3E", letterSpacing: 1 }}>
          <T es="Reunión en curso o finalizada" en="Meeting ongoing or concluded" />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Unit value={r?.d} label={r?.d === 1 ? "día" : "días"} />
          <Colon />
          <Unit value={r?.h} label="hrs" />
          <Colon />
          <Unit value={r?.m} label="min" />
          <Colon />
          <Unit value={r?.s} label="seg" />
        </div>
      )}
    </div>
  );
}

export default function CountdownTimers() {
  return (
    <section className="reveal" style={{ animationDelay: "0.2s" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 12 }}>
        &mdash; <T es="Próximas decisiones de política monetaria" en="Next monetary policy decisions" />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Countdown target={NEXT_FED}     label_es="Próxima Fed (FOMC)"  label_en="Next Fed (FOMC)"  />
        <Countdown target={NEXT_BANXICO} label_es="Próxima Banxico"     label_en="Next Banxico"     />
      </div>
    </section>
  );
}
