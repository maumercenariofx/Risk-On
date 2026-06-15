// app/page.jsx
import Ticker from "../components/Ticker";
import RiskGauge from "../components/RiskGauge";
import DailyWatch from "../components/DailyWatch";
import ProjectCards from "../components/ProjectCards";
import CountdownTimers from "../components/CountdownTimers";
import RatesSection from "../components/RatesSection";
import EconCalendar from "../components/EconCalendar";
import AdvancedData from "../components/AdvancedData";
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

      {latest && <DailyWatch post={latest} />}

      <ProjectCards />
      <CountdownTimers />
      <RatesSection />
      <EconCalendar />
      <AdvancedData />
    </div>
  );
}
