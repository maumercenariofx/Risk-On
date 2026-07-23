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
  title: "Risk On — Take risks or stay average",
  description:
    "FX y mercados explicados para todos. El indice Risk On te dice cuanto riesgo hay hoy. Por Mauricio Mercenario.",
  openGraph: {
    title: "Risk On — Take risks or stay average",
    description: "FX y mercados explicados para todos. ¿Cuanto risk hay hoy?",
    url: "https://riskon.lat",
    siteName: "Risk On",
    locale: "es_MX",
    type: "website",
    images: ["/riskon-logo.png"],
  },
  twitter: {
    card: "summary",
    title: "Risk On — Take risks or stay average",
    description: "FX y mercados explicados para todos. ¿Cuanto risk hay hoy?",
    images: ["/riskon-logo.png"],
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
