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

// Patterns that directly move USD/MXN — mapped to a 1-line MXN impact note
const MXN_MOVERS = [
  {
    patterns: ["FOMC", "Fed Rate", "Federal Reserve", "Federal Funds"],
    es: "Mueve el diferencial carry Banxico-Fed — impacto directo en el peso.",
    en: "Shifts the Banxico-Fed carry spread — direct impact on the peso.",
  },
  {
    patterns: ["Banxico", "Mexico Rate", "Banco de México"],
    es: "Decisión de política monetaria de México — máximo impacto en el MXN.",
    en: "Mexico's monetary policy decision — maximum MXN impact.",
  },
  {
    patterns: ["Nonfarm Payroll", "Non-Farm", "NFP", "Payroll"],
    es: "Si el empleo en EE.UU. sorprende, la Fed ajusta expectativas — el peso reacciona.",
    en: "A jobs surprise shifts Fed expectations — the peso reacts accordingly.",
  },
  {
    patterns: ["Consumer Price Index", "CPI", "Inflación", "Inflation"],
    es: "Dato clave de inflación en EE.UU. — un dato caliente puede presionar al peso.",
    en: "Key US inflation print — a hot reading pressures the peso.",
  },
  {
    patterns: ["PCE", "Personal Consumption", "Core PCE"],
    es: "Indicador de inflación favorito de la Fed — influye en el ciclo de tasas.",
    en: "The Fed's preferred inflation gauge — shapes the rate cycle outlook.",
  },
  {
    patterns: ["Jobless Claims", "Initial Claims", "Desempleo Semanal"],
    es: "Señal de salud laboral en EE.UU. — dato semanal que ajusta las apuestas de la Fed.",
    en: "Weekly US labor health signal — adjusts Fed rate bets.",
  },
  {
    patterns: ["BOJ", "Japan Rate", "Bank of Japan"],
    es: "Si el BOJ sube tasas, el yen se fortalece y puede reducir el apetito por carry global.",
    en: "A BOJ hike strengthens the yen and can dent global carry appetite.",
  },
  {
    patterns: ["GDP", "PIB", "Gross Domestic"],
    es: "Dato de crecimiento — un PIB débil puede cambiar el sesgo de la Fed o Banxico.",
    en: "Growth data — a weak print can shift the Fed or Banxico bias.",
  },
];

function getMxnNote(eventName) {
  if (!eventName) return null;
  const lower = eventName.toLowerCase();
  for (const m of MXN_MOVERS) {
    if (m.patterns.some((p) => lower.includes(p.toLowerCase()))) return m;
  }
  return null;
}

function dayLabel(dateStr, lang) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(lang === "en" ? "en-US" : "es-MX", {
    weekday: "short", day: "numeric", month: "short",
  });
}

export default function EconCalendar() {
  const { lang } = useLang();
  const [events, setEvents]       = useState(null);
  const [expanded, setExpanded]   = useState(null);

  useEffect(() => {
    fetch("/api/calendar?days=14")
      .then((r) => r.json())
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const today  = new Date().toISOString().slice(0, 10);
  const sorted = (events ?? []).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="reveal" style={{ animationDelay: "0.35s" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 12 }}>
        &mdash; <T es="Calendario económico — próximos 14 días" en="Economic calendar — next 14 days" />
      </div>
      <div
        className="card-glass"
        style={{
          background: "rgba(11,11,12,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
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
          const imp     = IMPACT[ev.impact] || IMPACT.low;
          const isToday = ev.date === today;
          const evName  = lang === "en" ? ev.event_en : ev.event_es;
          const mxnNote = getMxnNote(ev.event_en ?? ev.event_es);
          const isOpen  = expanded === i;
          const hasMxn  = !!mxnNote && ev.impact === "high";

          return (
            <div key={i} style={{ borderBottom: i < sorted.length - 1 ? "1px solid #141416" : "none" }}>
              {/* Main row */}
              <div
                onClick={() => hasMxn && setExpanded(isOpen ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "10px 16px",
                  background: isToday ? "rgba(245,245,242,0.025)" : "transparent",
                  cursor: hasMxn ? "pointer" : "default",
                  transition: "background .15s",
                }}
                onMouseEnter={e => { if (hasMxn) e.currentTarget.style.background = "rgba(245,245,242,0.035)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = isToday ? "rgba(245,245,242,0.025)" : "transparent"; }}
              >
                {/* Date */}
                <div style={{
                  minWidth: 86, fontFamily: "var(--font-mono)", fontSize: 10,
                  color: isToday ? "#C8C8C4" : "#4A4A50", letterSpacing: 0.5,
                }}>
                  {dayLabel(ev.date, lang)}
                </div>

                {/* Time */}
                <div style={{ minWidth: 42, fontFamily: "var(--font-mono)", fontSize: 10, color: "#3A3A3E" }}>
                  {ev.time}
                </div>

                {/* Flag + Event name */}
                <div style={{ flex: 1, fontSize: 12, color: isToday ? "#E8E6E0" : "#8A8A8E", lineHeight: 1.4, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  {ev.flag && FLAG_BADGE[ev.flag] && (
                    <span
                      className={`fi fi-${FLAG_BADGE[ev.flag].fi}`}
                      style={{ fontSize: 14, flexShrink: 0, borderRadius: 2, lineHeight: 1 }}
                    />
                  )}
                  <span>{evName}</span>
                  {/* MXN tag */}
                  {hasMxn && (
                    <span style={{
                      fontSize: 7.5, letterSpacing: 1.5, fontFamily: "var(--font-mono)",
                      color: "#3FA77E", border: "1px solid #3FA77E44",
                      borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                    }}>
                      MXN
                    </span>
                  )}
                </div>

                {/* Impact + expand arrow */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: imp.color }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: 1.5, color: imp.color }}>
                    {lang === "en" ? imp.label_en : imp.label_es}
                  </span>
                  {hasMxn && (
                    <span style={{ fontSize: 8, color: "#4A4A50", marginLeft: 2 }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable MXN impact note */}
              {hasMxn && (
                <div style={{
                  maxHeight: isOpen ? 80 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.3s ease",
                }}>
                  <div style={{
                    padding: "8px 16px 10px 148px",
                    fontSize: 11, color: "#5A5A68", lineHeight: 1.6,
                    borderTop: "1px solid #141416",
                  }}>
                    <span style={{ color: "#3FA77E", marginRight: 5 }}>↳</span>
                    {lang === "en" ? mxnNote.en : mxnNote.es}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
