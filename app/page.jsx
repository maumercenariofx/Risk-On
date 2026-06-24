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
import { getAllPostsMeta } from "../lib/posts";

export default function Home() {
  const posts  = getAllPostsMeta();
  const latest = posts[0] || null;

  return (
    <div className="space-y-8">
      <div className="reveal" style={{ animationDelay: "0.1s" }}>
        <Ticker />
      </div>

      <RiskGauge post={latest} />

      <div className="reveal"><RiskBands /></div>

      {latest && <DailyWatch post={latest} />}

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
