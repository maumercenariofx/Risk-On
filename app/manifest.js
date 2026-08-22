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
    // riskon-logo.png se declaraba como 512x512 y mide 1264x848: no es
    // cuadrado, así que "agregar a pantalla de inicio" producía un icono
    // deformado o recortado (auditoría 2026-08-21). Fuera. En su lugar, el SVG
    // —que escala a cualquier tamaño— más una variante maskable con zona segura
    // para el recorte de Android.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
