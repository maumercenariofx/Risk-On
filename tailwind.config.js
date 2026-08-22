/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // Ratios WCAG verificados sobre ink (#0A0A0B) e ink2 (#111113), que son
      // los dos fondos reales del sitio. Todo color de TEXTO vive aquí; el que
      // no aparezca en esta lista es un hex suelto y no debería existir.
      colors: {
        ink: "#0A0A0B",
        ink2: "#111113",
        ink3: "#1A1A1C",
        bone: "#F5F5F2",   // 18.12:1 / 17.27:1
        muted: "#8A8A8E",  //  5.75:1 /  5.48:1 — piso de texto secundario, pasa AA
        faint: "#7E7E86",  //  4.92:1 /  4.68:1 — el escalón tenue, todavía AA
        edge: "#1E1E22",   // borde decorativo, no es color de texto
        // Borde de INPUT. `edge` daba 1.26:1 y era lo único que marcaba dónde
        // se escribe: falla SC 1.4.11 (3:1 para límites de componente) justo en
        // los formularios de suscripción y alertas, que son la conversión.
        line: "#62626A",   //  3.27:1 /  3.12:1 — pasa el umbral de UI
        // riskoff #A32D2D daba 2.97:1 y riskon #0F8A5F daba 4.33:1 sobre las
        // cards — ambos reprobaban AA. components/Ticker.jsx:66 ya los parcheaba
        // en local desde la auditoría de 2026-07-13 en vez de arreglar el token;
        // aquí se corrige el origen y el parche local puede irse (2026-08-21).
        riskoff: "#CE5555", // 4.76:1 / 4.54:1 — pasa AA
        riskon: "#14A276",  // 6.09:1 / 5.80:1 — pasa AA
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
