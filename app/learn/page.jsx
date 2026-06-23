"use client";
// app/learn/page.jsx
import { useLang, T } from "../../components/Lang";
import QuantLab from "../../components/QuantLab";

// Glosario por categorías — términos de mercado + conceptos clave de
// CFA Nivel I y del examen AMIB (Figura 3). Bilingüe, explicado para todos.
const CATEGORIES = [
  {
    es: "Macro y riesgo", en: "Macro & risk",
    terms: [
      { term: "Risk-on / Risk-off",
        es: "El humor del mercado. Risk-on = los inversionistas se animan a comprar activos arriesgados (acciones, monedas emergentes). Risk-off = corren a refugiarse (dólar, oro, bonos de EE.UU.).",
        en: "The market's mood. Risk-on = investors buy riskier assets (stocks, emerging-market currencies). Risk-off = they flee to safety (dollar, gold, US Treasuries)." },
      { term: "VIX",
        es: "El \"índice del miedo\". Mide cuánta turbulencia espera el mercado en el S&P 500 los próximos 30 días. Alto = nervios; bajo = calma.",
        en: "The \"fear index\". Measures how much turbulence the market expects in the S&P 500 over the next 30 days. High = nerves; low = calm." },
      { term: "DXY",
        es: "El índice que mide la fuerza del dólar contra una canasta de monedas. Cuando sube, suele ser señal de risk-off.",
        en: "The index measuring the dollar's strength against a basket of currencies. When it rises, it's usually a risk-off signal." },
      { term: "CPI",
        es: "Consumer Price Index: el dato de inflación más vigilado de EE.UU. Mueve mercados porque define qué hará la Fed con las tasas.",
        en: "Consumer Price Index: the most-watched US inflation print. It moves markets because it shapes what the Fed does with rates." },
      { term: "Tasa de referencia",
        es: "La tasa de interés que fija el banco central (la Fed en EE.UU., Banxico en México). Es el ancla de casi todo lo demás: créditos, bonos y el tipo de cambio reaccionan a ella.",
        en: "The policy interest rate set by the central bank (the Fed in the US, Banxico in Mexico). It anchors almost everything else — loans, bonds and the exchange rate all react to it." },
    ],
  },
  {
    es: "Renta fija", en: "Fixed income",
    terms: [
      { term: "Bono",
        es: "Un préstamo que le haces a un gobierno o empresa: te pagan intereses periódicos (cupón) y te devuelven el capital al vencimiento. Es deuda, no propiedad.",
        en: "A loan you make to a government or company: they pay you periodic interest (the coupon) and return your principal at maturity. It's debt, not ownership." },
      { term: "Yield (rendimiento)",
        es: "El retorno anual que realmente ganas con un bono a su precio actual. Si el precio del bono baja, su yield sube — se mueven en direcciones opuestas.",
        en: "The annual return you actually earn on a bond at its current price. When a bond's price falls, its yield rises — they move in opposite directions." },
      { term: "Duración",
        es: "Qué tan sensible es el precio de un bono a los cambios de tasas. Duración de 5 ≈ el bono pierde ~5% si las tasas suben 1%. A mayor plazo, mayor duración y más riesgo.",
        en: "How sensitive a bond's price is to interest-rate changes. A duration of 5 ≈ the bond loses ~5% if rates rise 1%. Longer maturity = higher duration = more risk." },
      { term: "Curva de rendimiento",
        es: "La gráfica de tasas de los bonos del gobierno por plazo (de meses a 30 años). Si las tasas cortas superan a las largas, la curva se \"invierte\" — señal clásica de recesión.",
        en: "The chart of government-bond rates across maturities (months to 30 years). When short rates exceed long ones the curve \"inverts\" — a classic recession signal." },
      { term: "Spread de crédito",
        es: "El extra de tasa que paga una empresa frente al bono del gobierno por el mismo plazo. Mide el riesgo de impago: cuanto más ancho, más nervioso está el mercado.",
        en: "The extra yield a company pays over the government bond of the same maturity. It measures default risk: the wider it gets, the more nervous the market is." },
    ],
  },
  {
    es: "Renta variable", en: "Equity",
    terms: [
      { term: "P/E (precio/utilidad)",
        es: "Cuántas veces sus ganancias anuales vale una acción. P/E alto = el mercado espera mucho crecimiento (o está caro); bajo = barata o con dudas.",
        en: "How many times its annual earnings a stock is worth. A high P/E = the market expects strong growth (or it's pricey); low = cheap or doubted." },
      { term: "EPS (utilidad por acción)",
        es: "La ganancia neta de la empresa dividida entre el número de acciones. Es el \"pedazo\" de utilidad que le toca a cada acción.",
        en: "The company's net profit divided by its number of shares. It's the slice of earnings attributable to each share." },
      { term: "Capitalización de mercado",
        es: "El valor total de una empresa en bolsa: precio de la acción × número de acciones. Define si es de gran, mediana o pequeña capitalización.",
        en: "A company's total stock-market value: share price × number of shares. It defines whether it's large-, mid- or small-cap." },
      { term: "Dividendo (dividend yield)",
        es: "La parte de las ganancias que la empresa reparte en efectivo a sus accionistas. El \"dividend yield\" lo expresa como % del precio de la acción.",
        en: "The portion of earnings a company pays out in cash to shareholders. The dividend yield expresses it as a % of the share price." },
      { term: "Beta",
        es: "Qué tanto se mueve una acción frente al mercado. Beta 1 = se mueve igual; >1 = más volátil (amplifica subidas y bajadas); <1 = más defensiva.",
        en: "How much a stock moves relative to the market. Beta 1 = moves in line; >1 = more volatile (amplifies ups and downs); <1 = more defensive." },
    ],
  },
  {
    es: "Derivados y FX", en: "Derivatives & FX",
    terms: [
      { term: "Spread",
        es: "La diferencia entre el precio al que compras y al que vendes una divisa. Es el \"margen\" de quien te hace el cambio.",
        en: "The gap between the price you buy and sell a currency at. It's the dealer's \"margin\" on your trade." },
      { term: "FX Forward",
        es: "Un acuerdo para comprar o vender divisa en una fecha futura a un precio fijado hoy. Sirve para protegerte de que el tipo de cambio se mueva en tu contra.",
        en: "An agreement to buy or sell currency on a future date at a price locked in today. Used to protect yourself from the exchange rate moving against you." },
      { term: "Opción (call / put)",
        es: "El derecho —no la obligación— de comprar (call) o vender (put) un activo a un precio fijo antes de cierta fecha. Pagas una prima por esa flexibilidad.",
        en: "The right —not the obligation— to buy (call) or sell (put) an asset at a fixed price before a certain date. You pay a premium for that flexibility." },
      { term: "Swap",
        es: "Un contrato para intercambiar flujos entre dos partes: por ejemplo tasa fija por tasa variable, o una divisa por otra. Se usa para cubrir riesgos de tasa o tipo de cambio.",
        en: "A contract to exchange cash flows between two parties — e.g. fixed rate for floating, or one currency for another. Used to hedge rate or FX risk." },
      { term: "Carry",
        es: "La ganancia (o costo) de mantener una posición por la diferencia de tasas de interés entre dos monedas. El peso suele tener carry positivo frente al dólar.",
        en: "The gain (or cost) of holding a position due to the interest-rate difference between two currencies. The peso usually has positive carry vs the dollar." },
      { term: "Punto base (bp)",
        es: "Una centésima de punto porcentual: 100 bps = 1%. Es la unidad estándar para hablar de cambios de tasas y spreads sin ambigüedad.",
        en: "One hundredth of a percentage point: 100 bps = 1%. It's the standard unit for discussing rate moves and spreads without ambiguity." },
      { term: "Dual Currency Note",
        es: "Un instrumento estructurado donde tu rendimiento (o el pago final) depende de cómo se mueva un par de divisas. Combina depósito y opción cambiaria.",
        en: "A structured instrument where your return (or final payout) depends on how a currency pair moves. It blends a deposit with an FX option." },
    ],
  },
  {
    es: "Portafolio y ética (AMIB)", en: "Portfolio & ethics (AMIB)",
    terms: [
      { term: "Diversificación",
        es: "No poner todo en un solo activo. Al combinar inversiones que no suben y bajan al mismo tiempo, reduces el riesgo total sin sacrificar tanto rendimiento.",
        en: "Not putting everything in one asset. By combining investments that don't rise and fall together, you cut total risk without giving up much return." },
      { term: "Sharpe ratio",
        es: "Mide cuánto rendimiento extra obtienes por cada unidad de riesgo que tomas. Más alto = mejor pagado por el riesgo. Sirve para comparar portafolios.",
        en: "Measures how much extra return you get for each unit of risk taken. Higher = better paid for the risk. Used to compare portfolios." },
      { term: "Perfil de riesgo (perfilamiento)",
        es: "El proceso de medir cuánto riesgo puede y quiere tolerar un cliente antes de recomendarle productos. En México la AMIB lo exige: el producto debe ser adecuado al perfil.",
        en: "The process of gauging how much risk a client can and wants to bear before recommending products. In Mexico AMIB requires it: the product must suit the profile." },
      { term: "Deber fiduciario / conflicto de interés",
        es: "La obligación de poner el interés del cliente por encima del propio y revelar cualquier conflicto. Es el corazón de la conducta ética que evalúan CFA y AMIB.",
        en: "The duty to put the client's interest above your own and disclose any conflict. It's the core of the ethical conduct that both CFA and AMIB test." },
    ],
  },
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
          <T es="Los términos del mercado y los conceptos clave de CFA y AMIB, explicados para todos."
             en="Market terms and the key CFA & AMIB concepts, explained for everyone." />
        </p>
      </div>
      <div className="reveal" style={{ animationDelay: "0.05s" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 12 }}>
          &mdash; <T es="Laboratorio cuant" en="Quant lab" />
        </div>
        <QuantLab />
      </div>

      {CATEGORIES.map((cat) => (
        <div key={cat.en} className="space-y-3">
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50" }}>
            &mdash; <T es={cat.es} en={cat.en} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {cat.terms.map((t, i) => (
              <div key={t.term} className="reveal rounded-xl border border-edge bg-ink2/40 p-4"
                   style={{ animationDelay: `${0.05 + i * 0.04}s` }}>
                <div className="mb-1.5 font-medium text-bone">{t.term}</div>
                <p className="text-[13.5px] leading-relaxed text-bone/80">
                  <T es={t.es} en={t.en} />
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
