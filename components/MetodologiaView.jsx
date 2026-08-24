"use client";
// components/MetodologiaView.jsx
// Presentación de la metodología. La tabla de señales llega como prop desde el
// servidor, leída de lib/riskScore.js — nada aquí está transcrito a mano.
import Link from "next/link";
import { useLang, T } from "./Lang";
import { cardStyle, sectionLabel } from "../lib/chartHelpers";

export default function MetodologiaView({ signals, bands }) {
  const { lang } = useLang();
  const en = lang === "en";
  const total = signals.reduce((a, s) => a + s.w, 0);

  return (
    <div className="space-y-6 pt-4">
      <header className="reveal space-y-3">
        <h1 className="font-serif text-3xl font-medium leading-tight text-bone">
          <T es="Metodología del Índice Risk On" en="Risk On Index methodology" />
        </h1>
        <p className="text-sm leading-relaxed text-muted" style={{ maxWidth: 680 }}>
          <T
            es="El índice es determinístico: mismos insumos, mismo número, siempre. No lo calcula un modelo de lenguaje — lo calcula lib/riskScore.js, y el redactor del view diario recibe la instrucción explícita de explicarlo y jamás de cambiarlo."
            en="The index is deterministic: same inputs, same number, every time. It is not computed by a language model — lib/riskScore.js computes it, and the daily writer is explicitly instructed to explain it and never to change it."
          />
        </p>
      </header>

      {/* ── Las 9 señales ─────────────────────────────────────────────────── */}
      <div className="reveal card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
        <div style={{ ...sectionLabel, marginBottom: 6 }}>
          <T es="Las 9 señales y sus pesos" en="The 9 signals and their weights" />
        </div>
        <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
          <T
            es="Cada señal se normaliza a 0-100 y se promedia con estos pesos. Suman 100%."
            en="Each signal is normalized to 0-100 and averaged with these weights. They sum to 100%."
          />
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>
                {[en ? "Signal" : "Señal", en ? "Weight" : "Peso", en ? "Reference range" : "Rango de referencia"].map((h, i) => (
                  <th key={h} style={{ ...sectionLabel, fontSize: 11, padding: "0 8px 8px 0", textAlign: i === 1 ? "right" : "left", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "9px 8px 9px 0", fontSize: 12.5, color: "#F5F5F2" }}>{s.label}</td>
                  <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#F5F5F2", fontVariantNumeric: "tabular-nums" }}>{s.w}%</td>
                  <td style={{ padding: "9px 0", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "#8A8A8E" }}>{s.range ?? "—"}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid rgba(255,255,255,0.14)" }}>
                <td style={{ padding: "9px 8px 9px 0", fontSize: 12.5, color: "#8A8A8E" }}><T es="Total" en="Total" /></td>
                <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#8A8A8E" }}>{total}%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "12px 0 0" }}>
          <T
            es="El índice NO usa DXY. Durante meses el README y la documentación interna describieron un compuesto de 5 señales con DXY al 22% — era un archivo muerto sin un solo importador, ya borrado. Esta tabla se lee directamente del código que corre."
            en="The index does NOT use DXY. For months the README and internal docs described a 5-signal composite with DXY at 22% — that was a dead file with no importer, now deleted. This table is read straight from the code that runs."
          />
        </p>
      </div>

      {/* ── Normalización ─────────────────────────────────────────────────── */}
      <div className="reveal card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
        <div style={{ ...sectionLabel, marginBottom: 6 }}>
          <T es="Cómo se normaliza cada señal" en="How each signal is normalized" />
        </div>
        <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.75, margin: 0 }}>
          <T
            es="Cada señal se convierte a un z robusto contra su propia desviación reciente (MAD sobre ~60 días) y se mapea con una logística. La ventana rodante importa: el rango se ensancha en pánico y se estrecha en calma, así que el índice sigue siendo sensible tanto en días de miedo como de euforia, en vez de pegarse a 0 o 100. Las señales lentas —carry y curva— usan rangos de referencia fijos, porque su deriva es estructural y no tiene sentido medirla contra 60 días."
            en="Each signal becomes a robust z-score against its own recent deviation (MAD over ~60 days) and is mapped through a logistic. The rolling window matters: the range widens in panic and narrows in calm, so the index stays sensitive on both fearful and euphoric days instead of pinning at 0 or 100. Slow signals —carry and curve— use fixed reference ranges, because their drift is structural and measuring it against 60 days makes no sense."
          />
        </p>
      </div>

      {/* ── Bandas ────────────────────────────────────────────────────────── */}
      <div className="reveal card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
        <div style={{ ...sectionLabel, marginBottom: 6 }}>
          <T es="Los cortes de banda" en="The band cuts" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "10px 0 12px" }}>
          {bands.map((b, i) => (
            <span key={b.key} style={{
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5,
              color: b.color, border: `1px solid ${b.color}44`, borderRadius: 20,
              padding: "4px 11px", whiteSpace: "nowrap",
            }}>
              {b.key} · {i === 0 ? "0" : bands[i - 1].max + 1}–{b.max}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: 0 }}>
          <T
            es="Los cortes salen de quantile-matching sobre el backtest, de modo que RISK-OFF y RISK-ON sean bandas de COLA reservadas a extremos reales (~3% de los días cada una). Cambiaron una vez, el 13-jul-2026 (antes 29/48/72). Desde el 21-ago-2026 cada view guarda su banda en el front-matter al publicarse, así que un cambio futuro de cortes ya no puede reclasificar lo que ya salió."
            en="The cuts come from quantile-matching on the backtest, so RISK-OFF and RISK-ON are TAIL bands reserved for real extremes (~3% of days each). They changed once, on Jul 13, 2026 (previously 29/48/72). Since Aug 21, 2026 every view stores its band in the front-matter at publish time, so a future change of cuts can no longer reclassify what already shipped."
          />
        </p>
      </div>

      {/* ── Lo que el índice NO es ────────────────────────────────────────── */}
      <div className="reveal card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
        <div style={{ ...sectionLabel, marginBottom: 6 }}>
          <T es="Lo que el índice NO es" en="What the index is NOT" />
        </div>
        <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.75, margin: "0 0 12px" }}>
          <T
            es="Es un NOWCAST: describe el régimen de riesgo de HOY. No es un pronóstico direccional del USD/MXN, y durante meses dejamos que se leyera como si lo fuera. La correlación del compuesto con el retorno del par a 5 días es +0.029 con un t de 0.4 — indistinguible del azar."
            en="It is a NOWCAST: it describes TODAY's risk regime. It is not a directional forecast of USD/MXN, and for months we let it read like one. The composite's correlation with the pair's 5-day return is +0.029 with a t of 0.4 — indistinguishable from chance."
          />
        </p>
        <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: 0 }}>
          <T
            es="El desglose señal por señal, con lo que aporta cada una y lo que no, está en el track record."
            en="The signal-by-signal breakdown, with what each one contributes and what it does not, is on the track record."
          />{" "}
          <Link href="/indice" className="text-bone underline underline-offset-2">
            <T es="Ver el marcador y la auditoría de señales →" en="See the scoreboard and signal audit →" />
          </Link>
        </p>
      </div>

      <p className="reveal text-xs leading-relaxed text-muted" style={{ maxWidth: 680 }}>
        <T
          es="Contenido informativo. El índice no es asesoría de inversión ni recomendación de operar. Los pesos nunca se optimizaron contra el resultado: entraron en un solo commit y no se han movido, lo cual es verificable en el historial público del repositorio."
          en="Informational content. The index is not investment advice or a recommendation to trade. The weights were never optimized against the outcome: they entered in a single commit and have not moved, which is verifiable in the repository's public history."
        />
      </p>
    </div>
  );
}
