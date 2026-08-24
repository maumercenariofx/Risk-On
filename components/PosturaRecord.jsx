"use client";
// components/PosturaRecord.jsx
// Marcador público de posturas: cada view publica un sesgo (pro-peso / neutral
// / pro-dólar) con su condición de invalidación — aquí se cruza contra lo que
// el USD/MXN hizo de verdad en los 5 días hábiles siguientes. Nada se edita
// después: acierto, fallo o en curso, a la vista. La regla de evaluación se
// muestra completa (transparencia > marketing).
import { useLang, T } from "./Lang";
import { cardStyle, sectionLabel } from "../lib/chartHelpers";
import { wilson, overlap, nEfectivo, nNecesarioVsBase } from "../lib/stats";

const BIAS = {
  "pro-peso":  { es: "PRO-PESO",  en: "PRO-PESO",  color: "#2FB89A" },
  "neutral":   { es: "NEUTRAL",   en: "NEUTRAL",   color: "#9CA3AF" },
  "pro-dolar": { es: "PRO-DÓLAR", en: "PRO-USD",   color: "#CE5555" },
};

function fmtDate(slug, lang) {
  return new Date(`${slug}T12:00:00Z`).toLocaleDateString(
    lang === "en" ? "en-US" : "es-MX",
    { day: "numeric", month: "short", timeZone: "UTC" }
  );
}

export default function PosturaRecord({ data }) {
  const { lang } = useLang();
  if (!data?.rows?.length) return null;

  const pctHit = data.resolved ? Math.round((100 * data.hits) / data.resolved) : null;
  const ic = data.resolved ? wilson(data.hits, data.resolved) : null;
  const icBench = data.benchmark?.n ? wilson(data.benchmark.hits, data.benchmark.n) : null;
  const seTraslapan = overlap(ic, icBench);
  const nEf = nEfectivo(data.resolved);
  const nFalta = nNecesarioVsBase(0.62, 0.57);
  const retorno = data.retorno;

  return (
    <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={sectionLabel}>
          <T es="Marcador de posturas" en="Stance scoreboard" />
        </div>
        {pctHit != null && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#F5F5F2" }}>
            {data.hits}/{data.resolved} <T es="aciertos" en="hits" /> ·{" "}
            <span style={{ color: pctHit >= 60 ? "#2FB89A" : pctHit >= 40 ? "#D9A227" : "#CE5555", fontWeight: 700 }}>
              {pctHit}%
            </span>
            {/* El intervalo va PEGADO al número, no en una nota al pie: un
                porcentaje sin su incertidumbre se lee como si fuera exacto. */}
            {ic && (
              <span style={{ color: "#8A8A8E", fontWeight: 400 }}>
                {" "}[{ic.lo.toFixed(0)}–{ic.hi.toFixed(0)}]
              </span>
            )}
          </span>
        )}
        {data.byBias && Object.keys(data.byBias).length > 1 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#9CA3AF" }}>
            {Object.entries(data.byBias).map(([b, s], i) => (
              <span key={b}>
                {i > 0 && " · "}
                <span style={{ color: (BIAS[b] ?? BIAS.neutral).color }}>{lang === "en" ? (BIAS[b] ?? BIAS.neutral).en : (BIAS[b] ?? BIAS.neutral).es}</span> {s.hits}/{s.n}
              </span>
            ))}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
        <T
          es="Cada mañana el view publica una postura falsable. Aquí queda contra lo que el USD/MXN hizo en los 5 días hábiles siguientes — sin ediciones retroactivas."
          en="Every morning the view publishes a falsifiable stance. Here it stands against what USD/MXN actually did over the next 5 trading days — no retroactive edits."
        />
      </p>

      {/* ── La comparación incómoda ────────────────────────────────────────
          Un marcador solo significa algo contra la alternativa trivial. Sin
          esta fila, 81% se lee como criterio; con ella se ve que el criterio
          aporta una llamada. Va ARRIBA de la tabla, no escondido al final. */}
      {icBench && (
        <div style={{
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6,
          padding: "12px 14px", margin: "0 0 14px",
        }}>
          <div style={{ ...sectionLabel, fontSize: 11, marginBottom: 8 }}>
            <T es="Contra la alternativa trivial" en="Against the trivial alternative" />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
              <tbody>
                {[
                  { k: "postura", es: "Postura publicada", en: "Published stance", h: data.hits, n: data.resolved, ic },
                  { k: "bench", es: "«Pro-peso todos los días»", en: "“Pro-peso every day”", h: data.benchmark.hits, n: data.benchmark.n, ic: icBench },
                ].map((r) => (
                  <tr key={r.k} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "8px 10px 8px 0", fontSize: 12.5, color: r.k === "bench" ? "#9CA3AF" : "#F5F5F2" }}>
                      <T es={r.es} en={r.en} />
                    </td>
                    <td style={{ padding: "8px 10px 8px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {r.h}/{r.n}
                    </td>
                    <td style={{ padding: "8px 10px 8px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: r.k === "bench" ? "#9CA3AF" : "#F5F5F2", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {r.ic.pct.toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "#8A8A8E", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      [{r.ic.lo.toFixed(1)}–{r.ic.hi.toFixed(1)}]
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11.5, color: "#8A8A8E", lineHeight: 1.6, margin: "10px 0 0" }}>
            {seTraslapan ? (
              <T
                es={`Los dos intervalos de confianza se traslapan: con ${data.resolved} posturas resueltas, la diferencia entre publicar nuestra postura y escribir "pro-peso" todos los días NO es estadísticamente distinguible. Lo decimos nosotros antes de que lo diga alguien más.`}
                en={`The two confidence intervals overlap: with ${data.resolved} resolved stances, the gap between our published stance and simply writing "pro-peso" every day is NOT statistically distinguishable. We'd rather say it first.`}
              />
            ) : (
              <T es="Los intervalos no se traslapan: la diferencia sobrevive a la incertidumbre de la muestra." en="The intervals do not overlap: the difference survives the sample's uncertainty." />
            )}
          </p>
          {retorno?.media != null && (
            <p style={{ fontSize: 11.5, color: "#8A8A8E", lineHeight: 1.6, margin: "8px 0 0" }}>
              <T
                es={`Magnitud, no solo signo: a favor de la postura el movimiento medio a 5 días es ${retorno.media.toFixed(2)}% y la mediana ${retorno.mediana.toFixed(2)}%. Restando ${retorno.centavos} centavos de spread ida y vuelta (${retorno.friccionPct.toFixed(2)}%, lo que enfrentaría alguien operando en retail), quedan ${retorno.mediaNeta.toFixed(2)}%. El veredicto de arriba es una prueba de signo: un acierto de 0.02% cuenta igual que uno de 2%.`}
                en={`Magnitude, not just sign: in the stance's favor the average 5-day move is ${retorno.media.toFixed(2)}% and the median ${retorno.mediana.toFixed(2)}%. Net of ${retorno.centavos} centavos of round-trip spread (${retorno.friccionPct.toFixed(2)}%, what a retail reader would face), ${retorno.mediaNeta.toFixed(2)}% remains. The verdict above is a sign test: a 0.02% hit counts the same as a 2% one.`}
              />
            </p>
          )}
          <p style={{ fontSize: 11.5, color: "#8A8A8E", lineHeight: 1.6, margin: "8px 0 0" }}>
            <T
              es={`Y el tamaño de muestra real es menor de lo que parece: las ventanas de 5 días hábiles se traslapan, así que ${data.resolved} posturas consecutivas equivalen a del orden de ${nEf} observaciones independientes. Para distinguir con rigor un 62% de la base de 57% del par harían falta ~${nFalta} posturas — unos ${(nFalta / 252).toFixed(1)} años publicando a diario. Llevamos ${data.resolved}.`}
              en={`And the real sample is smaller than it looks: 5-day windows overlap, so ${data.resolved} consecutive stances amount to roughly ${nEf} independent observations. Rigorously telling 62% apart from the pair's 57% base would need ~${nFalta} stances — about ${(nFalta / 252).toFixed(1)} years of daily publishing. We're at ${data.resolved}.`}
            />
          </p>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 420 }}>
          <tbody>
            {data.rows.map((r) => {
              const b = BIAS[r.bias] ?? BIAS.neutral;
              return (
                <tr key={r.slug} className="row-hover" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "10px 10px 10px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                    <a href={`/archive/${r.slug}`} className="transition-colors hover:text-bone">{fmtDate(r.slug, lang)}</a>
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", whiteSpace: "nowrap" }}>
                    <span style={{
                      fontSize: 11, letterSpacing: 1.5, fontFamily: "var(--font-mono)",
                      color: b.color, border: `1px solid ${b.color}44`,
                      borderRadius: 20, padding: "3px 9px",
                    }}>{lang === "en" ? b.en : b.es}</span>
                    {r.prior && r.prior !== r.bias && (
                      <span title={lang === "en" ? `quant prior was ${r.prior}` : `el prior cuant era ${r.prior}`}
                        style={{ marginLeft: 6, fontSize: 11, fontFamily: "var(--font-mono)", color: "#6A6A70", letterSpacing: 0.5 }}>
                        ≠<T es=" prior" en=" prior" />
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontVariantNumeric: "tabular-nums", color: r.mxn5 == null ? "#9CA3AF" : r.mxn5 < 0 ? "#2FB89A" : "#CE5555", whiteSpace: "nowrap" }}>
                    {r.mxn5 != null
                      ? `${r.mxn5 > 0 ? "+" : ""}${r.mxn5.toFixed(2)}%`
                      : r.sofar != null
                      ? `${r.sofar > 0 ? "+" : ""}${r.sofar.toFixed(2)}%`
                      : "—"}
                  </td>
                  <td style={{ padding: "10px 0 10px 0", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {r.verdict == null ? (
                      <span style={{ color: "#8A8A8E" }}>
                        ⏳ {r.days > 0
                          ? (lang === "en" ? `day ${r.days}/5` : `día ${r.days}/5`)
                          : <T es="en curso" en="pending" />}
                      </span>
                    ) : r.verdict ? (
                      <span style={{ color: "#2FB89A" }}>✓ <T es="acierto" en="hit" /></span>
                    ) : (
                      <span style={{ color: "#CE5555" }}>✗ <T es="fallo" en="miss" /></span>
                    )}
                  </td>
                  <td className="hidden md:table-cell" style={{ padding: "10px 0 10px 12px", fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>
                    {r.condicion?.length > 90 ? r.condicion.slice(0, 87) + "…" : r.condicion}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Compliance: este es el bloque de mayor exposición del sitio — publica
          sesgo direccional con condición de invalidación — y era el ÚNICO sin
          aviso, porque components/Disclaimer.jsx nunca se importó (2026-08-21). */}
      <p style={{ fontSize: 11.5, color: "#8A8A8E", lineHeight: 1.6, margin: "12px 0 0" }}>
        <T
          es="Esto es una postura de mercado con fines informativos, no asesoría de inversión ni recomendación de operar. No incluye niveles de entrada o salida, instrumentos ni tamaños de posición. Operar con divisas implica riesgo."
          en="This is a market stance published for information only — not investment advice or a recommendation to trade. It carries no entry or exit levels, instruments, or position sizes. Trading currencies involves risk."
        />
      </p>

      <p style={{ fontSize: 11.5, color: "#6A6A70", lineHeight: 1.6, margin: "12px 0 0" }}>
        <T
          es="Regla de evaluación (fija): pro-peso acierta si el USD/MXN cerró más abajo 5 días hábiles después; pro-dólar si cerró más arriba; neutral si el movimiento fue ≤0.35% en cualquier dirección. Las filas en curso muestran su avance parcial (día X/5 y movimiento acumulado, en gris) — el veredicto siempre se toma al cierre del día 5. Las posturas se publican desde el 10-jul-2026. Verde = peso más fuerte. Desde el 31-jul-2026 cada view registra además el prior cuantitativo del día (backtest de 5 años) — la marca ≠ prior señala cuándo el criterio editorial se apartó del modelo, para auditar cuál suma."
          en="Evaluation rule (fixed): pro-peso hits if USD/MXN closed lower 5 trading days later; pro-USD if it closed higher; neutral if the move was ≤0.35% either way. Pending rows show their partial progress (day X/5 and accumulated move, in gray) — the verdict is always taken at day 5's close. Stances are published since Jul 10, 2026. Green = stronger peso. Since Jul 31, 2026 each view also records the day's quant prior (5-year backtest) — the ≠ prior mark flags when the editorial call departed from the model, so you can audit which one adds value."
        />
      </p>
    </div>
  );
}
