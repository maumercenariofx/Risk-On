// app/page.jsx
import Ticker from "../components/Ticker";
import RiskGauge from "../components/RiskGauge";
import RiskBands from "../components/RiskBands";
import DailyWatch from "../components/DailyWatch";
import ProjectCards from "../components/ProjectCards";
import CountdownTimers from "../components/CountdownTimers";
import RatesSection from "../components/RatesSection";
import EconCalendar from "../components/EconCalendar";
import AdvancedData from "../components/AdvancedData";
import MobileCollapse from "../components/MobileCollapse";
import TapeWidget from "../components/TapeWidget";
import { getAllPostsMeta, getPost } from "../lib/posts";

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

  return (
    <div className="space-y-10">
      {/* Mini-tape de progreso: USD/MXN 6m trazándose con el avance de página */}
      <TapeWidget score={posts[0]?.score} />

      {/* El ticker vive DENTRO del gauge, justo bajo el hero a pantalla completa */}
      <RiskGauge post={latest} prevScore={prevScore} scoreHistory={scoreHistory} ticker={<Ticker />} />

      {/* Primero el contenido DEL DÍA; la enciclopedia (bandas) después */}
      {latest && <DailyWatch post={latest} />}

      <div className="reveal pt-4"><RiskBands /></div>

      <ProjectCards />
      <CountdownTimers />

      {/* Secciones densas: colapsables en móvil para evitar scroll infinito */}
      <MobileCollapse es="Tasas de referencia" en="Reference rates">
        <RatesSection />
      </MobileCollapse>
      <MobileCollapse es="Calendario económico" en="Economic calendar">
        <EconCalendar />
      </MobileCollapse>
      <MobileCollapse es="Datos avanzados" en="Advanced data">
        <AdvancedData />
      </MobileCollapse>
    </div>
  );
}
