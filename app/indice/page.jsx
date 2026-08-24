// app/indice/page.jsx
// Track record público del Índice Risk On: histórico completo del score diario
// contra el mercado. Los datos salen del front-matter de content/*.md, así que
// la página se refresca sola con el redeploy diario del cron.
import { getAllPostsMeta } from "../../lib/posts";
import { computeForwardReturns, posturaRecord } from "../../lib/forwardReturns";
import TrackRecord from "../../components/TrackRecord";
import WhatHappenedNext from "../../components/WhatHappenedNext";
import PosturaRecord from "../../components/PosturaRecord";
import BandEvidence from "../../components/BandEvidence";
import SignalAudit from "../../components/SignalAudit";
import RiskBands from "../../components/RiskBands";
import { T } from "../../components/Lang";

// La página se regenera con el redeploy diario del cron; el revalidate cubre
// además el paso de los días (los forward returns maduran solos).
export const revalidate = 3600;

export const metadata = {
  title: "Índice Risk On · Track record",
  description:
    "Histórico completo del Índice Risk On: el score publicado cada mañana antes de las 7:00, día por día, contra el mercado. Sin ediciones retroactivas.",
  alternates: { canonical: "/indice" },
};

export default async function IndicePage() {
  const points = getAllPostsMeta()
    .filter((p) => p.score != null && !isNaN(Number(p.score)))
    // prior_bias se descartaba aquí, así que forwardReturns.js siempre recibía
    // prior: null y la marca "≠ prior" que PosturaRecord le promete al lector
    // no podía aparecer JAMÁS — ofrecíamos una auditoría que no funcionaba
    // (2026-08-21).
    .map(({ slug, score, title_es, title_en, postura_bias, postura_condicion, prior_bias, band }) => ({
      slug, score: Number(score), title_es, title_en, postura_bias, postura_condicion, prior_bias,
      band, // banda congelada al publicar; sin ella forwardReturns recalcula
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));

  const [fwd, posturas] = await Promise.all([
    computeForwardReturns(points),
    posturaRecord(points),
  ]);

  return (
    <div className="space-y-6 pt-4">
      <div className="reveal">
        <h1 className="font-serif text-3xl font-medium text-bone">
          <T es="Track record del índice" en="Index track record" />
        </h1>
        <p className="mt-1 text-sm text-muted">
          <T
            es="Cada score se publica antes de la apertura y queda escrito en el archivo — nada se edita después. Esto es el histórico completo."
            en="Every score is published before the open and written to the archive — nothing is edited after the fact. This is the complete history."
          />
        </p>
      </div>

      <div className="reveal">
        <TrackRecord points={points} />
      </div>

      {posturas && (
        <div className="reveal">
          <PosturaRecord data={posturas} />
        </div>
      )}

      {fwd && (
        <div className="reveal">
          <WhatHappenedNext data={fwd} />
        </div>
      )}

      <div className="reveal" style={{ marginTop: 34 }}>
        <div style={{ borderTop: "1px solid #2C2C30", paddingTop: 18 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2.5,
            textTransform: "uppercase", color: "#8A8A8E", marginBottom: 8,
          }}>
            <T es="A partir de aquí: backtest, no track record" en="From here on: backtest, not track record" />
          </div>
          <p style={{ fontSize: 13, color: "#9CA3AF", lineHeight: 1.65, margin: 0, maxWidth: 680 }}>
            <T
              es="Todo lo de arriba son posturas que publicamos ANTES de saber el resultado, con muestra chica. Lo que sigue es un backtest sobre 5 años de datos pasados: muestra grande, pero construido sabiendo cómo terminó la historia. No son comparables, y mezclarlos sería el truco más viejo del gremio."
              en="Everything above are stances we published BEFORE knowing the outcome, on a small sample. What follows is a backtest over 5 years of past data: large sample, but built knowing how the story ended. They are not comparable, and blending them would be the oldest trick in the book."
            />
          </p>
        </div>
      </div>

      <div className="reveal">
        <BandEvidence />
      </div>

      <div className="reveal">
        <SignalAudit />
      </div>

      <div className="reveal">
        <RiskBands />
      </div>
    </div>
  );
}
