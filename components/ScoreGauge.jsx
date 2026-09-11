"use client";
// components/ScoreGauge.jsx
// Gauge animado del Risk On score + desglose de señales (hover para ver el peso).
// Recibe el score y el arreglo `signals` [{label, sub, w}] persistido en la nota.
//
// 2026-09-11: el desglose sale a su propio export (ScoreBreakdown) para que
// /archive/[slug] lo ponga DESPUÉS del cuerpo del view — el lector diario
// cruzaba dos bloques de explicación antes de la primera frase. El contenido
// de cada bloque no cambia; ScoreGauge queda como el score compacto.
import { useEffect, useState } from "react";
import { T } from "./Lang";

const BANDS = [
  { max: 25,  label: "RISK-OFF",     color: "#5B7FB9" },
  { max: 50,  label: "DEFENSIVE",    color: "#D9A227" },
  { max: 75,  label: "CONSTRUCTIVE", color: "#2FB89A" },
  { max: 100, label: "RISK-ON",      color: "#19C39B" },
];

function band(score) {
  return BANDS.find((b) => score <= b.max) ?? BANDS[BANDS.length - 1];
}

// Monta con las barras en 0 y las suelta en el siguiente tick (transición).
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);
  return mounted;
}

export default function ScoreGauge({ score = 50 }) {
  const mounted = useMounted();
  const b = band(score);

  return (
    <div className="rounded-2xl border border-edge bg-ink2/40 p-5">
      {/* Score + estado */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[2px] text-muted">Risk On Score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-medium tabular-nums" style={{ color: b.color }}>{score}</span>
            <span className="text-sm text-muted">/ 100</span>
          </div>
        </div>
        <span
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide"
          style={{ color: b.color, border: `1px solid ${b.color}55`, background: `${b.color}14` }}
        >
          ◇ {b.label}
        </span>
      </div>

      {/* Barra principal */}
      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-edge/60">
        <div
          className="h-full rounded-full"
          style={{
            width: mounted ? `${score}%` : "0%",
            background: b.color,
            transition: "width 900ms cubic-bezier(.22,1,.36,1)",
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] uppercase tracking-wide text-muted/70">
        <span><T es="0 · risk-off" en="0 · risk-off" /></span>
        <span><T es="risk-on · 100" en="risk-on · 100" /></span>
      </div>
    </div>
  );
}

// Desglose de señales: misma card que el gauge, para que funcione suelto
// debajo del cuerpo del view.
export function ScoreBreakdown({ signals = [] }) {
  const mounted = useMounted();
  const [hover, setHover] = useState(null);
  if (!signals.length) return null;

  return (
    <div className="rounded-2xl border border-edge bg-ink2/40 p-5">
      <div className="mb-3 text-[11px] uppercase tracking-[2px] text-muted">
        <T es="Desglose ponderado" en="Weighted breakdown" />
      </div>
      <div className="space-y-2.5">
        {signals.map((s, i) => (
          <div
            key={s.label}
            className="group cursor-default"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-bone/75">{s.label}</span>
              <span className="font-mono tabular-nums text-muted">
                {hover === i ? <T es={`peso ${s.w}%`} en={`weight ${s.w}%`} /> : `${s.sub}`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge/50">
              <div
                className="h-full rounded-full"
                style={{
                  width: mounted ? `${s.sub}%` : "0%",
                  background: band(s.sub).color,
                  opacity: hover === null || hover === i ? 1 : 0.4,
                  transition: `width 900ms cubic-bezier(.22,1,.36,1) ${i * 60}ms, opacity .2s`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] leading-relaxed text-muted/70">
        <T
          es="Cada señal se normaliza a 0-100 (100 = más risk-on) y se promedia por su peso. Pasa el cursor para ver el peso."
          en="Each signal is normalized to 0-100 (100 = more risk-on) and averaged by weight. Hover to see the weight."
        />
      </div>
    </div>
  );
}
