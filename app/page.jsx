// app/page.jsx
import Ticker from "../components/Ticker";
import RiskGauge from "../components/RiskGauge";
import DailyRead from "../components/DailyRead";
import DailyWatch from "../components/DailyWatch";
import CountdownTimers from "../components/CountdownTimers";
import RatesSection from "../components/RatesSection";
import EconCalendar from "../components/EconCalendar";
import Disclaimer from "../components/Disclaimer";
import { getAllPostsMeta } from "../lib/posts";

export default function Home() {
  const posts  = getAllPostsMeta();
  const latest = posts[0] || null;

  return (
    <div className="space-y-8">
      <section className="reveal pt-4 text-center">
        <div className="tron-corner inline-block px-10 py-3">
          <h1 className="font-serif text-5xl font-medium tracking-tight text-bone sm:text-6xl">
            Risk On
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[3px] text-muted">
            [ take risks or stay average ]
          </p>
        </div>
      </section>

      <div className="reveal" style={{ animationDelay: "0.1s" }}>
        <Ticker />
      </div>

      <RiskGauge />

      {latest && <DailyRead  post={latest} />}
      {latest && <DailyWatch post={latest} />}

      <CountdownTimers />
      <RatesSection />
      <EconCalendar />
      <Disclaimer />
    </div>
  );
}
