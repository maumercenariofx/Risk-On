"use client";
// components/TAMethodology.jsx
// Explicación CLARA (para clientes, sin jerga) de cómo se calcula el Índice
// Técnico de Estiramiento. Acordeón bilingüe.
import { useState } from "react";
import { useLang, t } from "./Lang";

function Section({ open, onClick, title, children }) {
  return (
    <div className="border-b border-edge">
      <button onClick={onClick} className="flex w-full items-center justify-between py-3.5 text-left">
        <span className="text-sm font-medium text-bone">{title}</span>
        <span className="ml-3 text-lg leading-none text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="pb-4 text-[13px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

const FACTORS = [
  { c: "#5B7FB9", w: 40, es: ["Tendencia", "¿El precio está por encima o por debajo de sus promedios de mediano (50 días) y largo plazo (200 días)? ¿La tendencia apenas empieza o ya está madura? Usa medias móviles (EMA)."],
                        en: ["Trend", "Is price above or below its medium- (50-day) and long-term (200-day) averages? Is the trend young or mature? Uses moving averages (EMA)."] },
  { c: "#9B7FC8", w: 30, es: ["Momentum", "La fuerza del movimiento: ¿se está acelerando o agotando? Usa MACD y RSI."],
                        en: ["Momentum", "The strength of the move: is it accelerating or fading? Uses MACD and RSI."] },
  { c: "#D9A227", w: 15, es: ["Posición", "Qué tan pegado está a los extremos de su rango reciente y de sus Bandas de Bollinger. Cerca del extremo = estirado."],
                        en: ["Position", "How close it is to the edges of its recent range and Bollinger Bands. Near the edge = stretched."] },
  { c: "#2FB89A", w: 15, es: ["Volumen", "¿El movimiento va respaldado por dinero real? Usa el VWAP. En divisas al contado (USD/MXN) no hay datos de volumen, así que se omite y los otros tres reparten su peso."],
                        en: ["Volume", "Is the move backed by real money? Uses VWAP. Spot FX (USD/MXN) has no volume data, so it's skipped and the other three share its weight."] },
];

const BANDS = [
  { c: "#00C805", es: ["0–20 · Muy sobrevendido", "Muy castigado. El histórico favorece un rebote."], en: ["0–20 · Deeply oversold", "Beaten down. History favors a bounce."] },
  { c: "#5BC88A", es: ["20–40 · Sobreventa", "Sesgo a la baja, algo sobrevendido."], en: ["20–40 · Oversold", "Downward bias, somewhat oversold."] },
  { c: "#9CA3AF", es: ["40–60 · Equilibrio", "Sin estiramiento claro; mandan los niveles."], en: ["40–60 · Balanced", "No clear stretch; levels dominate."] },
  { c: "#F59E0B", es: ["60–80 · Estirado al alza", "Sesgo al alza, algo extendido."], en: ["60–80 · Stretched up", "Upward bias, somewhat extended."] },
  { c: "#FF5000", es: ["80–100 · Muy sobrecomprado", "Muy estirado. Riesgo de corrección."], en: ["80–100 · Deeply overbought", "Very stretched. Pullback risk."] },
];

export default function TAMethodology() {
  const { lang } = useLang();
  const [open, setOpen] = useState(0);
  const tg = (i) => setOpen(open === i ? -1 : i);

  return (
    <section className="mt-8 rounded-lg border border-edge bg-white/[0.02] p-5">
      <h2 className="font-serif text-xl text-bone">{t(lang, "Cómo se calcula", "How it's calculated")}</h2>
      <p className="mt-1 mb-2 text-[13px] text-muted">
        {t(lang, "En palabras simples, sin jerga.", "In plain words, no jargon.")}
      </p>

      <Section open={open === 0} onClick={() => tg(0)} title={t(lang, "¿Qué mide este número?", "What does this number measure?")}>
        {t(lang,
          "Mide qué tan «estirado» está un activo técnicamente, de 0 a 100. Piénsalo como una liga: entre más se estira, más probable que regrese a su lugar. Un número ALTO (cerca de 100) = subió mucho o muy rápido, está sobrecomprado → tiende a corregir. Un número BAJO (cerca de 0) = muy castigado, sobrevendido → tiende a rebotar. 50 es equilibrio.",
          "It measures how technically «stretched» an asset is, from 0 to 100. Think of a rubber band: the more it stretches, the more likely it snaps back. A HIGH number (near 100) = rose a lot or too fast, overbought → tends to pull back. A LOW number (near 0) = beaten down, oversold → tends to bounce. 50 is balance.")}
      </Section>

      <Section open={open === 1} onClick={() => tg(1)} title={t(lang, "Los 4 ingredientes (y su peso)", "The 4 ingredients (and their weight)")}>
        <div className="space-y-3">
          {FACTORS.map((f, i) => {
            const [name, desc] = lang === "en" ? f.en : f.es;
            return (
              <div key={i} className="flex gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.c }} />
                <div>
                  <span className="font-medium text-bone">{name}</span>
                  <span className="text-muted"> · {f.w}%</span>
                  <div>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3">
          {t(lang,
            "Cada ingrediente se califica de 0 a 100 y se promedia según su peso. Ese promedio es el número de Estiramiento.",
            "Each ingredient is scored 0 to 100 and averaged by its weight. That average is the Stretch number.")}
        </p>
      </Section>

      <Section open={open === 2} onClick={() => tg(2)} title={t(lang, "La Convicción (qué tanto confiar hoy)", "Conviction (how much to trust it today)")}>
        {t(lang,
          "Junto al número va un porcentaje de Convicción. Sube cuando los 4 ingredientes apuntan a lo mismo y hay una tendencia clara y definida (lo medimos con el ADX). Baja cuando se contradicen entre sí. Y baja también cuando hay un evento macro importante —decisión de la Fed, dato de inflación, Banxico— HOY o en los próximos días: cerca de esos eventos el gráfico se vuelve poco fiable, y entre más cerca, más baja la convicción.",
          "Next to the number is a Conviction percentage. It rises when all 4 ingredients agree and there's a clear, defined trend (measured with ADX). It falls when they conflict. It also falls when there's a major macro event —a Fed decision, inflation print, Banxico— TODAY or in the coming days: near those events the chart becomes unreliable, and the closer it is, the lower the conviction.")}
      </Section>

      <Section open={open === 3} onClick={() => tg(3)} title={t(lang, "Las zonas", "The zones")}>
        <div className="space-y-2">
          {BANDS.map((b, i) => {
            const [name, desc] = lang === "en" ? b.en : b.es;
            return (
              <div key={i} className="flex gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.c }} />
                <div><span className="font-medium text-bone">{name}</span> — {desc}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section open={open === 4} onClick={() => tg(4)} title={t(lang, "¿Por qué «estiramiento» y no «compra/venta»?", "Why «stretch» and not «buy/sell»?")}>
        {t(lang,
          "Porque lo probamos con 5 años de datos reales en 10 mercados, y la conclusión fue clara: un setup técnicamente «fuerte» NO anticipa más subidas — al contrario, tiende a corregir en las siguientes 1 a 4 semanas. En vez de venderte una señal de compra que los datos no respaldan, preferimos decirte la verdad: qué tan estirado está y hacia dónde apuntan las probabilidades. Por eso un número alto es «cuidado, puede corregir», no «compra». Es un indicador propietario de Mauricio Mercenario, informativo y no es recomendación de inversión.",
          "Because we tested it on 5 years of real data across 10 markets, and the conclusion was clear: a technically «strong» setup does NOT predict further gains — on the contrary, it tends to correct over the next 1 to 4 weeks. Instead of selling you a buy signal the data doesn't support, we'd rather tell you the truth: how stretched it is and where the odds point. That's why a high number means «careful, it may pull back», not «buy». It's a proprietary indicator by Mauricio Mercenario, informational and not investment advice.")}
      </Section>
    </section>
  );
}
