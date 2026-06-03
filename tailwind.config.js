/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#14141A",
        ink2: "#1C1B24",
        ink3: "#23202E",
        gold: "#C8A765",
        goldsoft: "#E0CB9A",
        bone: "#F5F2EC",
        muted: "#9A97A6",
        riskoff: "#A32D2D",
        riskon: "#0F6E56",
        caution: "#BA7517",
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
