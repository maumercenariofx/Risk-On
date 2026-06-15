// app/markets/page.jsx
import MarketsClient from "../../components/MarketsClient";
import PortfolioSection from "../../components/PortfolioSection";

export const metadata = { title: "Mercados · Risk On" };

export default function MarketsPage() {
  return (
    <div className="space-y-8">
      <MarketsClient />
      <PortfolioSection />
    </div>
  );
}
