"use client";
// components/SignalAudit.jsx
// Auditoría de las 9 señales del índice, en público.
//
// La pregunta que un lector técnico hace primero —"¿cuál de tus nueve señales
// está cargando el resultado?"— no tenía respuesta en el sitio. La tiene ahora,
// y no es cómoda: ninguna alcanza significancia estadística a 5 días, y dos de
// ellas (carry y curva, 17% del peso combinado) tienen correlación con el
// retorno futuro esencialmente igual a cero.
//
// Cifras de scripts/research-posturas.mjs re-corrido el 21-ago-2026 con
// gmtoffset corregido (n=1,175 días, dic-2021 → ago-2026). IC = correlación de
// Spearman del sub-score contra el retorno del USD/MXN a 5 días hábiles; t es
// el estadístico con n efectivo ajustado por el traslape de ventanas.
//
// Publicar esto es contraintuitivo y por eso vale: cualquiera puede afirmar que
// su índice funciona; casi nadie enseña qué parte de él no aporta nada.
import { useLang, T } from "./Lang";
import { cardStyle, sectionLabel } from "../lib/chartHelpers";

const SIGNALS = [
  { key: "VIX",         w: 20, ic: +0.073, t: +1.1 },
  { key: "USD/MXN",     w: 18, ic: +0.024, t: +0.4 },
  { key: "S&P 500",     w: 15, ic: -0.116, t: -1.8 },
  { key: "Carry",       w: 10, ic: -0.013, t: -0.2 },
  { key: "MXN vol",     w: 10, ic: +0.070, t: +1.1 },
  { key: "MOVE",        w:  8, ic: +0.074, t: +1.1 },
  { key: "Bitcoin",     w:  7, ic: -0.065, t: -1.0 },
  { key: "Curva 2s10s", w:  7, ic: +0.007, t: +0.1 },
  { key: "Oro",         w:  5, ic: +0.088, t: +1.4 },
];
// El compuesto y la señal que NO está en el índice, para el contraste.
const SCORE      = { ic: +0.029, t: +0.4 };
const ESTIRA     = { ic: -0.142, t: -2.2 };
const RUIDO_PESO = SIGNALS.filter((s) => Math.abs(s.t) < 0.3).reduce((a, s) => a + s.w, 0);

const fmt = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;

export default function SignalAudit() {
  const { lang } = useLang();
  const en = lang === "en";

  const veredicto = (t) => {
    if (Math.abs(t) < 0.3) return { txt: en ? "ruido" : "ruido", color: "#CE5555" };
    if (Math.abs(t) < 1.0) return { txt: en ? "weak" : "débil", color: "#D9A227" };
    return { txt: en ? "some signal" : "algo de señal", color: "#8A8A8E" };
  };

  return (
    <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
      <div style={{ ...sectionLabel, marginBottom: 6 }}>
        <T es="¿Qué parte del índice aporta?" en="Which part of the index earns its place?" />
      </div>
      <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
        <T
          es="Correlación de cada sub-score con lo que el USD/MXN hizo 5 días después, sobre 1,175 días. Ninguna de las nueve alcanza significancia estadística, y eso también lo publicamos."
          en="Each sub-score's correlation with what USD/MXN did 5 days later, over 1,175 days. None of the nine reaches statistical significance, and we publish that too."
        />
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 430 }}>
          <thead>
            <tr>
              {[en ? "Signal" : "Señal", en ? "Weight" : "Peso", "IC 5d", "t", ""].map((h, i) => (
                <th key={h || i} style={{
                  ...sectionLabel, fontSize: 11, padding: "0 8px 8px 0",
                  textAlign: i === 0 ? "left" : "right", fontWeight: 400,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SIGNALS.map((s) => {
              const v = veredicto(s.t);
              return (
                <tr key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "9px 8px 9px 0", fontSize: 12.5, color: "#F5F5F2" }}>{s.key}</td>
                  <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>{s.w}%</td>
                  <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>{fmt(s.ic)}</td>
                  <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>{fmt(s.t)}</td>
                  <td style={{ padding: "9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, color: v.color, whiteSpace: "nowrap" }}>{v.txt}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "1px solid rgba(255,255,255,0.14)" }}>
              <td style={{ padding: "9px 8px 9px 0", fontSize: 12.5, color: "#F5F5F2", fontWeight: 600 }}>
                <T es="El compuesto (score)" en="The composite (score)" />
              </td>
              <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#8A8A8E" }}>100%</td>
              <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#F5F5F2", fontVariantNumeric: "tabular-nums" }}>{fmt(SCORE.ic)}</td>
              <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#F5F5F2", fontVariantNumeric: "tabular-nums" }}>{fmt(SCORE.t)}</td>
              <td style={{ padding: "9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, color: "#D9A227", whiteSpace: "nowrap" }}>
                <T es="débil" en="weak" />
              </td>
            </tr>
            <tr>
              <td style={{ padding: "9px 8px 9px 0", fontSize: 12.5, color: "#9CA3AF" }}>
                <T es="Estiramiento (NO está en el índice)" en="Stretch (NOT in the index)" />
              </td>
              <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF" }}>—</td>
              <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#2FB89A", fontVariantNumeric: "tabular-nums" }}>{fmt(ESTIRA.ic)}</td>
              <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#2FB89A", fontVariantNumeric: "tabular-nums" }}>{fmt(ESTIRA.t)}</td>
              <td style={{ padding: "9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, color: "#2FB89A", whiteSpace: "nowrap" }}>
                <T es="la más fuerte" en="strongest" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "12px 0 0" }}>
        <T
          es={`Tres lecturas incómodas. Primera: carry y curva suman ${RUIDO_PESO}% del peso del índice y su correlación con el retorno futuro es prácticamente cero — ese porcentaje del modelo no está aportando. Segunda: el compuesto de nueve señales (t +0.4) predice MENOS que el estiramiento del par por sí solo (t −2.2), que es un oscilador de reversión de tres líneas y ni siquiera forma parte del índice. Tercera: |t| por debajo de 2 significa que ninguna señal individual es distinguible del azar a este horizonte.`}
          en={`Three uncomfortable readings. First: carry and curve make up ${RUIDO_PESO}% of the index's weight and their correlation with future returns is essentially zero — that share of the model is not contributing. Second: the nine-signal composite (t +0.4) predicts LESS than the pair's own stretch (t −2.2), a three-line mean-reversion oscillator that is not even part of the index. Third: |t| below 2 means no individual signal is distinguishable from chance at this horizon.`}
        />
      </p>
      <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "10px 0 0" }}>
        <T
          es="Entonces, ¿para qué sirve el índice? Para describir el régimen de HOY — es un nowcast, y como tal se sostiene. Lo que estos números dicen es que no es un pronóstico direccional, y llevábamos tiempo dejando que se leyera como si lo fuera. Los pesos, eso sí, nunca se optimizaron contra el resultado: entraron de una vez y no se han movido, lo cual es verificable en el historial del repo y es la razón por la que estas cifras no están infladas por sobreajuste."
          en="So what is the index for? To describe TODAY's regime — it is a nowcast, and as one it holds up. What these numbers say is that it is not a directional forecast, and we let it read like one for too long. The weights, at least, were never optimized against the outcome: they went in once and have not moved, which is verifiable in the repo's history and is why these figures are not inflated by overfitting."
        />
      </p>
    </div>
  );
}
