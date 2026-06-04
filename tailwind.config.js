/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0B",
        ink2: "#111113",
        ink3: "#1A1A1C",
        bone: "#F5F5F2",
        muted: "#8A8A8E",
        edge: "#1E1E22",
        riskoff: "#A32D2D",
        riskon: "#0F8A5F",
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
