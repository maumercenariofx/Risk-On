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
import { getAllPostsMeta, getPost } from "../lib/posts";

export default async function Home() {
  const posts = getAllPostsMeta();
  // Post completo (con html) para el overlay lector de la landing.
  const latest = posts[0] ? await getPost(posts[0].slug) : null;

  return (
    <div className="space-y-10">
      {/* El ticker vive DENTRO del gauge, justo bajo el hero a pantalla completa */}
      <RiskGauge post={latest} ticker={<Ticker />} />

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
