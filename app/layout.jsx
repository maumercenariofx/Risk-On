// app/layout.jsx
import "./globals.css";
import "flag-icons/css/flag-icons.min.css";
import { LangProvider } from "../components/Lang";
import Nav from "../components/Nav";
import Footer from "../components/Footer";

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
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Geist:wght@400;500&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LangProvider>
          <Nav />
          <main className="mx-auto max-w-5xl px-5 pb-20 pt-6">{children}</main>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
