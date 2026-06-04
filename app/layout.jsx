// app/layout.jsx
import "./globals.css";
import { LangProvider } from "../components/Lang";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import TronCanvas from "../components/TronCanvas";

export const metadata = {
  title: "Risk On — Take risks or stay average",
  description:
    "FX y mercados explicados para todos. El indice Risk On te dice cuanto riesgo hay hoy. Por Mauricio Mercenario.",
  openGraph: {
    title: "Risk On — Take risks or stay average",
    description: "FX y mercados explicados para todos. ¿Cuanto risk hay hoy?",
    type: "website",
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
          <TronCanvas />
          <Nav />
          <main className="mx-auto max-w-5xl px-5 pb-20 pt-6">{children}</main>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
