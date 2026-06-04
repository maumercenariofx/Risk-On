"use client";
// app/learn/page.jsx
import { useLang, T } from "../../components/Lang";

const TERMS = [
  { term: "Risk-on / Risk-off",
    es: "El humor del mercado. Risk-on = los inversionistas se animan a comprar activos arriesgados (acciones, monedas emergentes). Risk-off = corren a refugiarse (dólar, oro, bonos de EE.UU.).",
    en: "The market's mood. Risk-on = investors buy riskier assets (stocks, emerging-market currencies). Risk-off = they flee to safety (dollar, gold, US Treasuries)." },
  { term: "VIX",
    es: "El \"índice del miedo\". Mide cuánta turbulencia espera el mercado en el S&P 500 los próximos 30 días. Alto = nervios; bajo = calma.",
    en: "The \"fear index\". Measures how much turbulence the market expects in the S&P 500 over the next 30 days. High = nerves; low = calm." },
  { term: "Spread",
    es: "La diferencia entre el precio al que compras y al que vendes una divisa. Es el \"margen\" de quien te hace el cambio.",
    en: "The gap between the price you buy and sell a currency at. It's the dealer's \"margin\" on your trade." },
  { term: "FX Forward",
    es: "Un acuerdo para comprar o vender divisa en una fecha futura a un precio fijado hoy. Sirve para protegerte de que el tipo de cambio se mueva en tu contra.",
    en: "An agreement to buy or sell currency on a future date at a price locked in today. Used to protect yourself from the exchange rate moving against you." },
  { term: "DXY",
    es: "El índice que mide la fuerza del dólar contra una canasta de monedas. Cuando sube, suele ser señal de risk-off.",
    en: "The index measuring the dollar's strength against a basket of currencies. When it rises, it's usually a risk-off signal." },
  { term: "CPI",
    es: "Consumer Price Index: el dato de inflación más vigilado de EE.UU. Mueve mercados porque define qué hará la Fed con las tasas.",
    en: "Consumer Price Index: the most-watched US inflation print. It moves markets because it shapes what the Fed does with rates." },
  { term: "Carry",
    es: "La ganancia (o costo) de mantener una posición por la diferencia de tasas de interés entre dos monedas. El peso suele tener carry positivo frente al dólar.",
    en: "The gain (or cost) of holding a position due to the interest-rate difference between two currencies. The peso usually has positive carry vs the dollar." },
  { term: "Dual Currency Note",
    es: "Un instrumento estructurado donde tu rendimiento (o el pago final) depende de cómo se mueva un par de divisas. Combina depósito y opción cambiaria.",
    en: "A structured instrument where your return (or final payout) depends on how a currency pair moves. It blends a deposit with an FX option." },
];

export default function LearnPage() {
  const { lang } = useLang();
  return (
    <div className="space-y-6 pt-4">
      <div className="reveal">
        <h1 className="font-serif text-3xl font-medium text-bone">
          <T es="Aprende" en="Learn" />
        </h1>
        <p className="mt-1 text-sm text-muted">
          <T es="Los términos del mercado, en inglés y explicados para todos."
             en="Market terms, in English and explained for everyone." />
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TERMS.map((t, i) => (
          <div key={t.term} className="reveal rounded-xl border border-edge bg-ink2/40 p-4"
               style={{ animationDelay: `${0.05 + i * 0.05}s` }}>
            <div className="mb-1.5 font-medium text-bone">{t.term}</div>
            <p className="text-[13.5px] leading-relaxed text-bone/80">
              <T es={t.es} en={t.en} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
