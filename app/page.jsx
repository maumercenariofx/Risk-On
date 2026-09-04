// app/page.jsx
// Home V2 (2026-09-03): el índice es el producto. Orden = niveles de lectura:
// score vivo + ancla publicada → qué lo mueve → qué vigilar → el view →
// mercados/tasas/calendario → casos → cómo leer el índice. La página solo
// recompone; ningún componente cambió de contrato salvo RiskGauge, que ya no
// monta DailyRead ni MarketsClient (viven aquí para poder ordenarlos).
import Link from "next/link";
import Ticker from "../components/Ticker";
import RiskGauge from "../components/RiskGauge";
import RiskBands from "../components/RiskBands";
import DailyWatch from "../components/DailyWatch";
import DailyRead from "../components/DailyRead";
import MarketsClient from "../components/MarketsClient";
import ProjectCards from "../components/ProjectCards";
import CountdownTimers from "../components/CountdownTimers";
import RatesSection from "../components/RatesSection";
import EconCalendar from "../components/EconCalendar";
import AdvancedData from "../components/AdvancedData";
import MobileCollapse from "../components/MobileCollapse";
import TapeWidget from "../components/TapeWidget";
import { T } from "../components/Lang";
import { getAllPostsMeta, getPost, getSentAt } from "../lib/posts";
import { regimeAge, range7, bandOf } from "../lib/homeStats";

export const metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const posts = getAllPostsMeta();
  // Post completo (con html) para el overlay lector de la landing.
  const latest = posts[0] ? await getPost(posts[0].slug) : null;
  // Contexto diario del hero: score de AYER (view previo) + serie de 30 días
  // para el sparkline. posts viene desc → [1] es el view anterior.
  const prevScore = posts[1]?.score ?? null;
  const scoreHistory = posts
    .slice(0, 22)
    .map((p) => ({ slug: p.slug, score: Number(p.score) }))
    .filter((p) => !isNaN(p.score))
    .reverse();

  // Ancla del día: el score que fue al correo, con su hora real de envío.
  const published = posts[0] && Number.isFinite(Number(posts[0].score))
    ? {
        slug: posts[0].slug,
        // F9 (Home V2, 2026-09-03): blindado a String — si el front-matter
        // trae la fecha sin comillas, js-yaml la parsea como Date y
        // shortDate() de RiskGauge la metería tal cual en JSX.
        date: String(posts[0].date).slice(0, 10),
        score: Number(posts[0].score),
        band: bandOf(posts[0]),
        signals: Array.isArray(posts[0].signals) ? posts[0].signals : null,
        sentAt: getSentAt(posts[0].slug),
      }
    : null;

  return (
    <div className="space-y-10">
      {/* Mini-tape de progreso: USD/MXN 6m trazándose con el avance de página */}
      <TapeWidget score={posts[0]?.score} />

      {/* 1-3 · Score vivo, ancla publicada, termómetro, strip y drivers.
          El ticker vive DENTRO del gauge, justo bajo el hero a pantalla completa. */}
      <RiskGauge
        prevScore={prevScore}
        scoreHistory={scoreHistory}
        ticker={<Ticker />}
        published={published}
        regimeAge={regimeAge(posts)}
        range7={range7(posts)}
      />

      {/* 4 · Qué vigilar hoy, FX y rango técnico */}
      {latest && <DailyWatch post={latest} />}

      {/* 5 · El Pre-Market (+ SubscribeForm: aquí vive el ancla #subscribe) */}
      {latest && <DailyRead post={latest} />}

      {/* 6 · Mercados, cuenta regresiva y secciones densas (colapsables en móvil) */}
      <div style={{ padding: "8px 0" }}>
        <MarketsClient embed />
      </div>
      <CountdownTimers />
      <MobileCollapse es="Tasas de referencia" en="Reference rates">
        <RatesSection />
      </MobileCollapse>
      <MobileCollapse es="Calendario económico" en="Economic calendar">
        <EconCalendar />
      </MobileCollapse>
      <MobileCollapse es="Datos avanzados" en="Advanced data">
        <AdvancedData />
      </MobileCollapse>

      {/* 7 · Explorar */}
      <ProjectCards />

      {/* 8 · Cómo leer el índice (ancla #bandas) + track record */}
      <div className="reveal pt-4">
        <RiskBands />
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-3 border-t border-edge pt-5">
          <p className="text-sm text-muted">
            <T
              es="Cada score se publica antes de la apertura y se califica contra el USD/MXN real a 5 días."
              en="Every score is published before the open and graded against the actual USD/MXN 5 days later."
            />
          </p>
          <Link href="/indice" className="text-sm text-bone underline-offset-4 hover:underline">
            <T es="Ver el track record →" en="See the track record →" />
          </Link>
        </div>
      </div>
    </div>
  );
}
