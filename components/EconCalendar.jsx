"use client";
import { useEffect, useState } from "react";
import { useLang, T } from "./Lang";

const FLAG_BADGE = {
  "🇺🇸": { fi: "us" },
  "🇲🇽": { fi: "mx" },
  "🇪🇺": { fi: "eu" },
  "🇬🇧": { fi: "gb" },
  "🇯🇵": { fi: "jp" },
};

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
  const [events, setEvents] = useState(null);

  useEffect(() => {
    fetch("/api/calendar?days=14")
      .then((r) => r.json())
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const sorted = (events ?? []).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="reveal" style={{ animationDelay: "0.35s" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 12 }}>
        &mdash; <T es="Calendario económico — próximos 14 días" en="Economic calendar — next 14 days" />
      </div>
      <div
        className="card-glass"
        style={{
          background: "rgba(5,5,6,0.50)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid #1E1E20",
          borderRadius: 12,
          overflow: "hidden",
          minHeight: 60,
        }}
      >
        {events === null && (
          <div style={{ padding: "20px 16px", fontSize: 12, color: "#3A3A3E" }}>
            <T es="Cargando calendario…" en="Loading calendar…" />
          </div>
        )}
        {events !== null && sorted.length === 0 && (
          <div style={{ padding: "20px 16px", fontSize: 12, color: "#3A3A3E" }}>
            <T es="Sin eventos de alto impacto en los próximos 14 días." en="No high-impact events in the next 14 days." />
          </div>
        )}
        {sorted.map((ev, i) => {
          const imp = IMPACT[ev.impact] || IMPACT.low;
          const isToday = ev.date === today;
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "10px 16px",
                borderBottom: i < sorted.length - 1 ? "1px solid #141416" : "none",
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
              <div style={{ flex: 1, fontSize: 12, color: isToday ? "#E8E6E0" : "#8A8A8E", lineHeight: 1.4, display: "flex", alignItems: "center", gap: 7 }}>
                {ev.flag && FLAG_BADGE[ev.flag] && (
                  <span
                    className={`fi fi-${FLAG_BADGE[ev.flag].fi}`}
                    style={{ fontSize: 14, flexShrink: 0, borderRadius: 2, lineHeight: 1 }}
                  />
                )}
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
