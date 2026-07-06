// app/manifest.js
// PWA básica: "agregar a pantalla de inicio" con nombre, colores y logo de la
// marca en vez del default del navegador.
export default function manifest() {
  return {
    name: "Risk On — Daily macro intelligence",
    short_name: "Risk On",
    description:
      "El índice Risk On y el pre-market diario de Mauricio Mercenario, con foco en el peso mexicano.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/riskon-logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
