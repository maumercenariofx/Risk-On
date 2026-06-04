"use client";
import { useLang, T } from "./Lang";
import calendarData from "../data/calendar.json";

const IMPACT = {
  high:   { color: "#A32D2D", label_es: "ALTO",  label_en: "HIGH" },
  medium: { color: "#BA7517", label_es: "MEDIO", label_en: "MED"  },
  low:    { color: "#3A3A3E", label_es: "BAJO",  label_en: "LOW"  },
};

function dayLabel(dateStr, lang) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(lang === "en" ? "en-US" : "es-MX", {
    weekday: "short", day: "numeric", month: "short",
  });
}

export default function EconCalendar() {
  const { lang } = useLang();
  const today = new Date().toISOString().slice(0, 10);
  const events = [...calendarData].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="reveal" style={{ animationDelay: "0.35s" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 12 }}>
        &mdash; <T es="Calendario económico semanal" en="Weekly economic calendar" />
      </div>
      <div
        className="card-glass"
        style={{
          background: "rgba(11,11,12,0.85)",
          border: "1px solid #1E1E20",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {events.map((ev, i) => {
          const imp = IMPACT[ev.impact] || IMPACT.low;
          const isToday = ev.date === today;
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "10px 16px",
                borderBottom: i < events.length - 1 ? "1px solid #141416" : "none",
                background: isToday ? "rgba(245,245,242,0.02)" : "transparent",
              }}
            >
              <div style={{
                minWidth: 86, fontFamily: "var(--font-mono)", fontSize: 10,
                color: isToday ? "#C8C8C4" : "#4A4A50", letterSpacing: 0.5,
              }}>
                {dayLabel(ev.date, lang)}
              </div>
              <div style={{ minWidth: 42, fontFamily: "var(--font-mono)", fontSize: 10, color: "#3A3A3E" }}>
                {ev.time}
              </div>
              <div style={{ flex: 1, fontSize: 12, color: isToday ? "#E8E6E0" : "#8A8A8E", lineHeight: 1.4 }}>
                {lang === "en" ? ev.event_en : ev.event_es}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: imp.color }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: 1.5, color: imp.color }}>
                  {lang === "en" ? imp.label_en : imp.label_es}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
