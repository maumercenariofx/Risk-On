// lib/signalLabels.js
// Etiquetas de señal para PRESENTACIÓN (2026-09-11). lib/riskScore.js emite
// los labels en español ("Oro", "Curva 2s10s") y esos mismos labels son la
// llave de unión entre el breakdown vivo y el `signals` congelado en el
// front-matter de cada view — por eso NO se traducen en origen: se traducen
// solo al pintarlos. En ES, o sin traducción registrada, sale tal cual.
const EN = {
  "Oro": "Gold",
  "Curva 2s10s": "2s10s curve",
  // Formato viejo (label + descripción en un solo texto): solo lo trae el
  // view del 2026-06-17.
  "VIX (vol acciones)": "VIX (equity vol)",
  "USD/MXN (dirección peso)": "USD/MXN (peso direction)",
  "Vol. realizada USD/MXN": "USD/MXN realized vol",
  "MOVE (vol bonos)": "MOVE (bond vol)",
  "Bitcoin (apetito riesgo)": "Bitcoin (risk appetite)",
  "Oro (cobertura, inverso)": "Gold (hedge, inverse)",
};

export function signalLabel(label, lang) {
  if (lang !== "en") return label;
  return EN[label] ?? label;
}
