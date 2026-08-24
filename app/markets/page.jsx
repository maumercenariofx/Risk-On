// app/markets/page.jsx
import MarketsClient from "../../components/MarketsClient";

export const metadata = { title: "Mercados · Risk On", alternates: { canonical: "/markets" } };

export default function MarketsPage() {
  return (
    <div className="space-y-8">
      <MarketsClient />
    </div>
  );
}
