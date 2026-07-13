// app/suscribete/page.jsx
// Landing de conversión: una sola llamada a la acción (el form de suscripción),
// el pitch de El Pre-Market y prueba de lo que recibes — el view de hoy tal
// cual salió + el track record público. Pensada para compartirse como link
// directo (bio de X, WhatsApp, firma de correo).
import Link from "next/link";
import { getAllPostsMeta } from "../../lib/posts";
import { riskBand } from "../../lib/riskScore";
import SubscribeForm from "../../components/SubscribeForm";
import { T } from "../../components/Lang";

// Se regenera con el redeploy diario del cron; el revalidate cubre el paso
// de los días para que "el view de hoy" nunca se quede fósil.
export const revalidate = 3600;

export const metadata = {
  title: "Suscríbete · El Pre-Market",
  description:
    "El análisis pre-market de Mauricio Mercenario en tu correo cada mañana antes de la apertura: Índice Risk On, niveles de USD/MXN y una postura clara. Gratis, sin spam.",
};

const PERKS = [
  {
    es_t: "El Índice Risk On del día",
    en_t: "The day's Risk On Index",
    es_d: "Un score 0-100 con 9 señales de mercado (VIX, USD/MXN, S&P, carry…). Metodología pública, sin ediciones retroactivas.",
    en_d: "A 0-100 score built from 9 market signals (VIX, USD/MXN, S&P, carry…). Public methodology, never edited after the fact.",
  },
  {
    es_t: "Niveles accionables de USD/MXN",
    en_t: "Actionable USD/MXN levels",
    es_d: "Soporte y resistencia del día, con el spot exacto del momento del envío — no un cierre atrasado.",
    en_d: "The day's support and resistance, with the exact spot at send time — not a stale close.",
  },
  {
    es_t: "Una postura que se puede auditar",
    en_t: "A stance you can audit",
    es_d: "Sesgo claro (pro-peso, neutral o pro-dólar) con su condición de invalidación. Si nos equivocamos, queda escrito.",
    en_d: "A clear bias (pro-peso, neutral or pro-dollar) with its invalidation condition. If we're wrong, it's on the record.",
  },
];

export default function SuscribetePage() {
  const latest = getAllPostsMeta()[0] ?? null;
  const score = latest?.score != null && !isNaN(Number(latest.score)) ? Number(latest.score) : null;
  const band = score != null ? riskBand(score) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pt-4">
      <div className="reveal">
        <h1 className="font-serif text-3xl font-medium text-bone sm:text-4xl">
          <T es="El Pre-Market, en tu correo" en="The Pre-Market, in your inbox" />
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <T
            es="Cada mañana hábil, antes de la apertura (~7:00 CDMX), un correo corto y directo: dónde amanece el riesgo global, qué niveles importan en USD/MXN y qué vigilar hoy. Escrito para decidir, no para llenar la bandeja."
            en="Every weekday morning, before the open (~7:00 CDMX), one short and direct email: where global risk stands, which USD/MXN levels matter and what to watch today. Written to help you decide, not to fill your inbox."
          />
        </p>
      </div>

      <div className="reveal">
        <SubscribeForm />
        <p className="mt-2 text-xs text-muted">
          <T
            es="Gratis. Sin spam. Baja en un clic desde cualquier correo."
            en="Free. No spam. One-click unsubscribe from any email."
          />
        </p>
      </div>

      <div className="reveal space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          <T es="Qué recibes" en="What you get" />
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PERKS.map((p) => (
            <div key={p.es_t} className="card-glass rounded-xl border border-edge p-4">
              <p className="text-sm font-medium text-bone">
                <T es={p.es_t} en={p.en_t} />
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                <T es={p.es_d} en={p.en_d} />
              </p>
            </div>
          ))}
        </div>
      </div>

      {latest && (
        <div className="reveal">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            <T es="Así se ve el más reciente" en="Here's the latest one" />
          </p>
          <Link
            href={`/archive/${latest.slug}`}
            className="card-spot block rounded-xl border border-edge p-5 transition-colors hover:border-bone/30"
          >
            <div className="flex flex-wrap items-center gap-2">
              {band && (
                <span
                  className="rounded-md border px-2 py-0.5 font-mono text-xs font-semibold"
                  style={{ color: band.color, borderColor: `${band.color}55` }}
                >
                  {score} · {band.key}
                </span>
              )}
              <span className="font-mono text-xs text-muted">{latest.slug}</span>
            </div>
            <p className="mt-2 font-serif text-lg leading-snug text-bone">
              <T es={latest.title_es} en={latest.title_en ?? latest.title_es} />
            </p>
            <p className="mt-2 text-xs text-muted">
              <T es="Leer el view completo →" en="Read the full view →" />
            </p>
          </Link>
          <p className="mt-3 text-xs text-muted">
            <T
              es={<>Cada score queda publicado en el archivo desde 2026 — revisa el <Link href="/indice" className="underline underline-offset-2 hover:text-bone">track record completo</Link>.</>}
              en={<>Every score is published to the archive — check the <Link href="/indice" className="underline underline-offset-2 hover:text-bone">full track record</Link>.</>}
            />
          </p>
        </div>
      )}
    </div>
  );
}
