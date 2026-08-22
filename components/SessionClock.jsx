"use client";
// components/SessionClock.jsx
// Reloj de sesiones FX del hero: Sydney · Tokio · Londres · NY — cuál opera
// AHORA (dot verde; ámbar si abre/cierra en <60 min) y countdown al próximo
// evento global. Matemática de reloj pura con Intl (DST resuelto por timezone,
// fin de semana por día local del centro). Tooltip por chip = hora local.
import { useEffect, useState } from "react";
import { useLang } from "./Lang";

const SESSIONS = [
  { id: "SYD", tz: "Australia/Sydney", open: 8, close: 17, es: "Sídney", en: "Sydney" },
  { id: "TYO", tz: "Asia/Tokyo", open: 9, close: 18, es: "Tokio", en: "Tokyo" },
  { id: "LDN", tz: "Europe/London", open: 8, close: 17, es: "Londres", en: "London" },
  { id: "NYC", tz: "America/New_York", open: 8, close: 17, es: "Nueva York", en: "New York" },
];

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEK = 7 * 1440;

function sessionState(s, now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: s.tz,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dow = DOW[get("weekday")];
  const h = Number(get("hour")) % 24; // Intl puede dar "24" a medianoche
  const m = Number(get("minute"));
  const nowMin = dow * 1440 + h * 60 + m;

  const isOpen = dow >= 1 && dow <= 5 && h >= s.open && h < s.close;

  // Próxima frontera (apertura o cierre Lun-Vie) en minutos: dentro de una
  // sesión abierta la más cercana es SU cierre; cerrada, la próxima apertura.
  let minsToNext = Infinity;
  let nextIsOpen = false;
  for (let d = 1; d <= 5; d++) {
    for (const [hh, opens] of [[s.open, true], [s.close, false]]) {
      const delta = (d * 1440 + hh * 60 - nowMin + WEEK) % WEEK || WEEK;
      if (delta < minsToNext) {
        minsToNext = delta;
        nextIsOpen = opens;
      }
    }
  }

  return { ...s, isOpen, minsToNext, nextIsOpen, local: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

export default function SessionClock() {
  const { lang } = useLang();
  const [states, setStates] = useState(null); // null hasta montar (evita mismatch SSR)

  useEffect(() => {
    const tick = () => setStates(SESSIONS.map((s) => sessionState(s, new Date())));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  if (!states) return null;

  // El evento más próximo de todo el mapa: "LDN cierra en 2h 14m"
  const next = states.reduce((a, b) => (a.minsToNext <= b.minsToNext ? a : b));
  const hrs = Math.floor(next.minsToNext / 60);
  const mins = next.minsToNext % 60;
  const t = `${hrs > 0 ? `${hrs}H ` : ""}${mins}M`;
  const verb = next.nextIsOpen
    ? lang === "en" ? "OPENS IN" : "ABRE EN"
    : lang === "en" ? "CLOSES IN" : "CIERRA EN";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, fontFamily: "var(--font-mono)" }}>
      <div style={{ display: "flex", gap: 6, pointerEvents: "auto" }}>
        {states.map((s) => {
          const soon = s.minsToNext <= 60; // por abrir o cerrar: ámbar
          const col = s.isOpen ? (soon ? "#D9A227" : "#19C39B") : soon ? "#D9A227" : "#3A3A40";
          return (
            <span
              key={s.id}
              data-tip={`${lang === "en" ? s.en : s.es} · ${s.local} local`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 9.5,
                letterSpacing: 1.5,
                color: s.isOpen ? "#8A8F98" : "#3E3E44",
                borderBottom: "none", // anula el dotted de [data-tip]
                cursor: "default",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: col, boxShadow: s.isOpen ? `0 0 6px ${col}` : "none" }} />
              {s.id}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 9.5, letterSpacing: 2, color: "#8A8A8E", textTransform: "uppercase" }}>
        {next.id} {verb} {t}
      </div>
    </div>
  );
}
