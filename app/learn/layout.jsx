// La página es client component ("use client") y no puede exportar metadata —
// este layout le da título propio y canonical (auditoría SEO 2026-07-13).
export const metadata = {
  title: "Aprende · Risk On",
  description:
    "Glosario de mercados y FX explicado para todos: risk-on/off, carry, VIX, curva de tasas y los conceptos que mueven al peso. Con laboratorio visual interactivo.",
  alternates: { canonical: "/learn" },
};

export default function LearnLayout({ children }) {
  return children;
}
