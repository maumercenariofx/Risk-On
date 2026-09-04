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
import { T, t, useLang } from "./Lang";
import { pushes } from "../lib/homeStats";

const HALF_SCALE = 10;            // puntos que llenan media barra
const POS = "#2FB89A";            // empuja a risk-on (verde de banda, no P&L)
const NEG = "#5B7FB9";            // empuja a risk-off (azul de banda)
const NEUTRAL = "#8A8A8E";
const LABEL_DIM = "#6A6A70";      // label de una fila sin dato en vivo (F1, 2026-09-03)

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
  const source = usingLive ? live : published; // fuente del total y del rótulo del título

  // F1 (2026-09-03): antes se iteraba solo `live`, así que una señal sin dato
  // vivo (Yahoo caído, /api/rates o /api/curve fallando) desaparecía en vez de
  // avisar — en local llegamos a ver 3 de 9 filas. Ahora las 9 señales SIEMPRE
  // están, indexadas por label (join key entre live y published: los labels
  // son idénticos ES/EN), en el orden canónico que trae `published` — y si no
  // hay published, en el orden de `live`.
  const livePushRows = pushes(live ?? []);
  const pubPushRows = pushes(published ?? []);
  const liveByLabel = new Map(livePushRows.map((r) => [r.label, r.push]));
  const pubByLabel = new Map(pubPushRows.map((r) => [r.label, r.push]));
  const order = pubPushRows.length ? pubPushRows.map((r) => r.label) : livePushRows.map((r) => r.label);
  if (!order.length) return null;

  const rows = order.map((label) => ({
    label,
    livePush: liveByLabel.has(label) ? liveByLabel.get(label) : null,
    pubPush: pubByLabel.has(label) ? pubByLabel.get(label) : null,
  }));

  // El total sigue siendo la suma de empujes de UNA sola fuente (la que se
  // titula arriba), igual que antes de F1 — F1 solo cambia qué filas se
  // pintan, no la aritmética del total (ver F6 para el texto de la leyenda).
  const total = pushes(source ?? []).reduce((a, r) => a + (r.push ?? 0), 0);

  // Orden por magnitud del push que se está DIBUJANDO (vivo si hay, si no
  // publicado); las filas sin ningún dato (ni vivo ni publicado) al final.
  const sorted = [...rows].sort((a, b) => {
    const av = a.livePush ?? a.pubPush;
    const bv = b.livePush ?? b.pubPush;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return Math.abs(bv) - Math.abs(av);
  });

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
          const hasLive = r.livePush != null;
          // F1: en modo "en vivo" una fila sin dato vivo pero con publicado no
          // desaparece — enseña la marca publicada sola, barra vacía, "—" de
          // valor y el label apagado. En modo "publicado" (usingLive false)
          // no hay marca: es el comportamiento de siempre.
          const isLiveMissing = usingLive && !hasLive && r.pubPush != null;
          const drawPush = hasLive ? r.livePush : (usingLive ? null : r.pubPush);
          const color = drawPush == null ? NEUTRAL : drawPush >= 0 ? POS : NEG;
          const geo = drawPush == null ? { left: "50%", width: 0 } : bar(grown ? drawPush : 0);
          const tickLeft = usingLive && r.pubPush != null
            ? `${50 + Math.max(-1, Math.min(1, r.pubPush / HALF_SCALE)) * 50}%`
            : null;
          const rowTitle = isLiveMissing
            ? t(lang, `Sin dato en vivo · publicado ${fmt(r.pubPush)}`, `No live data · published ${fmt(r.pubPush)}`)
            : undefined;
          return (
            <div
              key={r.label}
              title={rowTitle}
              aria-label={rowTitle}
              style={{ display: "grid", gridTemplateColumns: "84px 1fr 52px", alignItems: "center", gap: 10 }}
            >
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 11, color: isLiveMissing ? LABEL_DIM : "#B4B4B8",
                letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {r.label}
              </div>
              <div style={{ position: "relative", height: 10 }}>
                {/* eje neutro */}
                <div style={{ position: "absolute", top: 4, left: 0, right: 0, height: 1.5, background: "#1E1E20", borderRadius: 1 }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "#3A3A3E" }} />
                {/* barra viva (o publicada en modo "publicado") */}
                {!isLiveMissing && (
                  <div className="drivers-bar" style={{ position: "absolute", top: 2, height: 6, borderRadius: 2, background: color, ...geo }} />
                )}
                {/* marca del publicado */}
                {tickLeft && (
                  <div
                    className="drivers-tick"
                    title={lang === "en" ? "Published" : "Publicado"}
                    style={{ position: "absolute", top: -2, width: 1.5, height: 14, background: "#F5F5F2", left: grown ? tickLeft : "50%", transform: "translateX(-50%)", boxShadow: "0 0 0 1px rgba(0,0,0,0.6)" }}
                  />
                )}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: isLiveMissing ? NEUTRAL : color, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {isLiveMissing ? "—" : fmt(drawPush)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: NEUTRAL, lineHeight: 1.6 }}>
        <span>
          {/* F6 (2026-09-03): el total sumaba subs YA redondeados mientras el
              score redondea la media sin redondear — podían discrepar hasta
              ~0.5. La leyenda ya no afirma una igualdad exacta que a veces no
              cuadraba; describe la fórmula y muestra la suma aparte. */}
          <T
            es="Empuje de cada señal respecto al punto neutro (50). El score es 50 más la suma, redondeado."
            en="Each signal's push relative to the neutral point (50). The score is 50 plus the sum, rounded."
          />
          {" "}
          <span style={{ fontFamily: "var(--font-mono)", color: "#B4B4B8" }}>Σ {fmt(total)}</span>
        </span>
        <Link href="/metodologia" style={{ pointerEvents: "auto" }} className="text-muted underline-offset-4 hover:text-bone hover:underline">
          <T es="¿Cómo se calcula? →" en="How is it calculated? →" />
        </Link>
      </div>
    </section>
  );
}
