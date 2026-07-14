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
import RiskBands from "../../components/RiskBands";
import { T } from "../../components/Lang";

// La página se regenera con el redeploy diario del cron; el revalidate cubre
// además el paso de los días (los forward returns maduran solos).
export const revalidate = 3600;

export const metadata = {
  title: "Índice Risk On · Track record",
  description:
    "Histórico completo del Índice Risk On: el score publicado cada mañana a las 7:00, día por día, contra el mercado. Sin ediciones retroactivas.",
  alternates: { canonical: "/indice" },
};

export default async function IndicePage() {
  const points = getAllPostsMeta()
    .filter((p) => p.score != null && !isNaN(Number(p.score)))
    .map(({ slug, score, title_es, title_en, postura_bias, postura_condicion }) => ({
      slug, score: Number(score), title_es, title_en, postura_bias, postura_condicion,
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

      <div className="reveal">
        <BandEvidence />
      </div>

      <div className="reveal">
        <RiskBands />
      </div>
    </div>
  );
}
