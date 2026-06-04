// app/page.jsx
import Ticker from "../components/Ticker";
import RiskGauge from "../components/RiskGauge";
import DailyRead from "../components/DailyRead";
import { getAllPostsMeta } from "../lib/posts";

export default function Home() {
  const posts = getAllPostsMeta();
  const latest = posts[0] || null;

  return (
    <div className="space-y-8">
      <section className="reveal pt-4 text-center">
        <h1 className="font-serif text-5xl font-medium tracking-tight text-bone sm:text-6xl">
          Risk On
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[3px] text-muted">
          [ take risks or stay average ]
        </p>
      </section>

      <div className="reveal" style={{ animationDelay: "0.1s" }}>
        <Ticker />
      </div>

      <RiskGauge />

      {latest && <DailyRead post={latest} />}
    </div>
  );
}
