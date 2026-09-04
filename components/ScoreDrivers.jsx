"use client";
// components/ScoreDrivers.jsx
// "Qué mueve el score" (Home V2, 2026-09-03). Una fila por señal: barra de
// empuje w·(sub−50)/Σw a la derecha (risk-on) o a la izquierda (risk-off) del
// punto neutro, y una marca fina donde estaba esa señal en el score PUBLICADO
// de las 7:00. Responde "¿qué movió el índice desde la apertura?", que antes
// no respondía nadie.
//
// Sustituye al Collapse "Componentes del índice" de RiskGauge, que enseñaba
// los mismos sub-scores sin referencia. El detalle por señal y la tabla de
// pesos siguen en /metodologia.
//
// Escala fija: 10 puntos de índice = media barra. El empuje máximo teórico de
// una señal es w/2 (VIX: 10), así que las barras son comparables día a día.
import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useLang } from "./Lang";
import { pushes } from "../lib/homeStats";

const HALF_SCALE = 10;            // puntos que llenan media barra
const POS = "#2FB89A";            // empuja a risk-on (verde de banda, no P&L)
const NEG = "#5B7FB9";            // empuja a risk-off (azul de banda)
const NEUTRAL = "#8A8A8E";

function fmt(n) {
  if (n == null) return "—";
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0.0";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}`;
}

// left/width en % para una barra que nace en 50% y crece según el signo.
function bar(push) {
  const pct = Math.min(Math.abs(push) / HALF_SCALE, 1) * 50;
  return push >= 0 ? { left: "50%", width: `${pct}%` } : { left: `${50 - pct}%`, width: `${pct}%` };
}

export default function ScoreDrivers({ live = null, published = null, anchor = null }) {
  const { lang } = useLang();
  // Monta con las barras en cero y las suelta en el siguiente frame para que
  // la transición CSS se vea (misma idea que thermoIn en RiskGauge).
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(id);
  }, []);

  const usingLive = Array.isArray(live) && live.length > 0;
  const source = usingLive ? live : published;
  if (!Array.isArray(source) || !source.length) return null;

  const rows = pushes(source);
  const pubByLabel = new Map((pushes(published ?? []) ?? []).map((r) => [r.label, r.push]));
  const sorted = [...rows].sort((a, b) => Math.abs(b.push ?? 0) - Math.abs(a.push ?? 0));
  const total = rows.reduce((a, r) => a + (r.push ?? 0), 0);

  return (
    <section aria-labelledby="drivers-title" style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 id="drivers-title" style={{ margin: 0, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: NEUTRAL, fontWeight: 500 }}>
          <T es="Qué mueve el score" en="What's moving the score" />
        </h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, color: NEUTRAL }}>
          {usingLive ? <T es="en vivo" en="live" /> : <T es="publicado" en="published" />}
          {usingLive && anchor && (
            <>
              {" · "}
              <span style={{ display: "inline-block", width: 1, height: 10, background: "#F5F5F2", verticalAlign: "middle", marginRight: 5 }} />
              <T es={anchor.es} en={anchor.en} />
            </>
          )}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {sorted.map((r) => {
          const p = r.push;
          const color = p == null ? NEUTRAL : p >= 0 ? POS : NEG;
          const geo = p == null ? { left: "50%", width: 0 } : bar(grown ? p : 0);
          const pub = usingLive ? pubByLabel.get(r.label) : null;
          const tickLeft = pub == null ? null : `${50 + Math.max(-1, Math.min(1, pub / HALF_SCALE)) * 50}%`;
          return (
            <div key={r.key ?? r.label} style={{ display: "grid", gridTemplateColumns: "84px 1fr 52px", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#B4B4B8", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.label}
              </div>
              <div style={{ position: "relative", height: 10 }}>
                {/* eje neutro */}
                <div style={{ position: "absolute", top: 4, left: 0, right: 0, height: 1.5, background: "#1E1E20", borderRadius: 1 }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "#3A3A3E" }} />
                {/* barra viva */}
                <div className="drivers-bar" style={{ position: "absolute", top: 2, height: 6, borderRadius: 2, background: color, ...geo }} />
                {/* marca del publicado */}
                {tickLeft && (
                  <div
                    className="drivers-tick"
                    title={lang === "en" ? "Published" : "Publicado"}
                    style={{ position: "absolute", top: -2, width: 1.5, height: 14, background: "#F5F5F2", left: grown ? tickLeft : "50%", transform: "translateX(-50%)", boxShadow: "0 0 0 1px rgba(0,0,0,0.6)" }}
                  />
                )}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {fmt(p)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: NEUTRAL, lineHeight: 1.6 }}>
        <span>
          <T
            es="Empuje de cada señal respecto al punto neutro (50). Suman "
            en="Each signal's push relative to the neutral point (50). They add up to "
          />
          <span style={{ fontFamily: "var(--font-mono)", color: "#B4B4B8" }}>{fmt(total)}</span>
          <T es=" = score − 50." en=" = score − 50." />
        </span>
        <Link href="/metodologia" style={{ pointerEvents: "auto" }} className="text-muted underline-offset-4 hover:text-bone hover:underline">
          <T es="¿Cómo se calcula? →" en="How is it calculated? →" />
        </Link>
      </div>
    </section>
  );
}
