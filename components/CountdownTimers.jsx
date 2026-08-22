"use client";
import { useEffect, useState } from "react";
import { T } from "./Lang";

function useCountdown(target) {
  const [r, setR] = useState(null);
  useEffect(() => {
    if (!target) return;
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
      <div style={{ fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", color: "#8A8A8E", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function Colon() {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 16, color: "#8A8A8E",
      alignSelf: "flex-start", marginTop: 4, flexShrink: 0,
    }}>:</div>
  );
}

function Countdown({ isoDate, label_es, label_en }) {
  const target = isoDate ? new Date(isoDate).getTime() : null;
  const r = useCountdown(target);
  return (
    <div
      className="card-glass"
      style={{
        background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20",
        borderRadius: 12, padding: "16px 18px", flex: "1 1 200px",
      }}
    >
      <div style={{ fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase", color: "#8A8A8E", marginBottom: 14 }}>
        <T es={label_es} en={label_en} />
      </div>
      {!isoDate ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8A8A8E", letterSpacing: 1 }}>
          —
        </div>
      ) : r?.past ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8A8A8E", letterSpacing: 1 }}>
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
  const [dates, setDates] = useState({ fed: null, banxico: null });

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then(setDates)
      .catch(() => {});
  }, []);

  return (
    <section className="reveal" style={{ animationDelay: "0.2s" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#8A8A8E", marginBottom: 12 }}>
        &mdash; <T es="Próximas decisiones de política monetaria" en="Next monetary policy decisions" />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Countdown isoDate={dates.fed}     label_es="Próxima Fed (FOMC)"  label_en="Next Fed (FOMC)"  />
        <Countdown isoDate={dates.banxico} label_es="Próxima Banxico"     label_en="Next Banxico"     />
      </div>
    </section>
  );
}
