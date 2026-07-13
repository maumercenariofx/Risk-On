// La página es client component ("use client") y no puede exportar metadata —
// este layout le da título propio y canonical (auditoría SEO 2026-07-13).
export const metadata = {
  title: "Contacto · Risk On",
  description:
    "Mauricio Mercenario — especialista en FX y mercados. Agenda una asesoría 1:1 o escríbeme directo.",
  alternates: { canonical: "/about" },
};

export default function AboutLayout({ children }) {
  return children;
}
