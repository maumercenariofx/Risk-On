// app/alertas/page.jsx — Alertas Pro: cambios de tendencia del índice +
// niveles de USD/MXN por cliente, entregadas por WhatsApp (o correo).
import AlertManager from "../../components/AlertManager";

export const metadata = {
  title: "Alertas Pro — Risk On",
  description:
    "Alertas de cambios de tendencia del índice Risk On y niveles de USD/MXN a tu WhatsApp. Tier Pro de riskon.lat.",
  alternates: { canonical: "/alertas" },
};

export default function AlertasPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 pt-6">
      <header className="reveal">
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: 2,
            color: "#8A8A8E",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Risk-On Pro
        </div>
        <h1 className="font-serif text-3xl font-medium text-bone">Alertas en tiempo real</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          El motor vigila el mercado cada pocos minutos en horario FX: si el índice Risk On
          cruza de banda o el USD/MXN toca uno de tus niveles, te llega la alerta al
          instante — WhatsApp primero, correo de respaldo.
        </p>
      </header>
      <div className="reveal">
        <AlertManager />
      </div>
    </div>
  );
}
