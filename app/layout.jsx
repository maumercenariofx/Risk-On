// app/layout.jsx
import "./globals.css";
import "flag-icons/css/flag-icons.min.css";
import { Fraunces } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { LangProvider } from "../components/Lang";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import RevealObserver from "../components/RevealObserver";
import CommandPalette from "../components/CommandPalette";

// Fuentes self-hosted vía next/font (antes: <link> a Google Fonts, render-blocking).
// Fraunces variable con eje óptico; Geist/Geist Mono del paquete oficial.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL("https://riskon.lat"),
  title: "Risk On — ¿Cuánto riesgo hay hoy? Índice diario para MXN",
  description:
    "Índice Risk On: 9 señales, un régimen, publicado antes de las 7:00 CDMX y calificado en público contra el USD/MXN. Research de Mauricio Mercenario.",
  openGraph: {
    title: "Risk On — ¿Cuánto riesgo hay hoy?",
    description: "9 señales, un régimen, antes de las 7:00. Calificado en público contra el USD/MXN.",
    url: "https://riskon.lat",
    siteName: "Risk On",
    locale: "es_MX",
    type: "website",
    // Tarjeta generada en app/api/og/route.js con el marcador público en vivo.
    images: [{ url: "https://riskon.lat/api/og", width: 1200, height: 630, alt: "Risk On — marcador público de posturas" }],
  },
  twitter: {
    // "summary" mostraba una miniatura cuadrada del logo mientras las notas de
    // /archive ya usaban summary_large_image: la portada se compartía peor que
    // sus propios artículos. Con app/api/og/route.js la home ya tiene
    // tarjeta grande propia (auditoría 2026-08-21).
    card: "summary_large_image",
    images: ["https://riskon.lat/api/og"],
    title: "Risk On — ¿Cuánto riesgo hay hoy?",
    description: "9 señales, un régimen, antes de las 7:00. Calificado en público contra el USD/MXN.",
  },
  alternates: {
    types: { "application/rss+xml": "https://riskon.lat/feed.xml" },
  },
};

// JSON-LD del sitio (Organization + WebSite) — datos estructurados para Google.
const SITE_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://riskon.lat/#org",
      name: "Risk On",
      url: "https://riskon.lat",
      logo: "https://riskon.lat/riskon-logo.png",
      founder: { "@type": "Person", name: "Mauricio Mercenario" },
    },
    {
      "@type": "WebSite",
      url: "https://riskon.lat",
      name: "Risk On",
      publisher: { "@id": "https://riskon.lat/#org" },
      inLanguage: ["es-MX", "en"],
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* apple-touch-icon a mano: en cuanto existe app/icon.svg, Next da
            prioridad a la convención de archivo y DESCARTA metadata.icons, así
            que el `apple` declarado allá nunca llegaba al head. iOS no lee SVG
            para este rel, de ahí la ruta que lo genera en PNG. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/api/og/apple" />
        {/* html.io ANTES del primer paint → el reveal por scroll no parpadea.
            Sin IO o con reduced-motion se queda el fallback (animar al montar). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('io')}catch(e){}",
          }}
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_LD) }}
        />
        <RevealObserver />
        <LangProvider>
          <Nav />
          <main className="mx-auto max-w-5xl px-5 pb-20 pt-6">{children}</main>
          <Footer />
          <CommandPalette />
        </LangProvider>
        <Analytics />
      </body>
    </html>
  );
}
