// Guarda el snapshot DIARIO de riesgo por país (insumo del time-lapse del
// globo). Corre en el pipeline de Actions después de generar el view; el
// archivo vive en public/ para servirse estático (/data/country-risk-history.json).
// Best-effort: cualquier fallo sale con 0 — jamás bloquea el correo de las 7am.
import fs from "node:fs";

const OUT = "public/data/country-risk-history.json";
const slug = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

try {
  const res = await fetch("https://riskon.lat/api/country-risk", {
    headers: { "User-Agent": "riskon-actions" },
  });
  if (!res.ok) throw new Error(`country-risk ${res.status}`);
  const scores = (await res.json())?.scores ?? null;
  if (!scores || !Object.keys(scores).length) throw new Error("sin scores");

  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}
  hist = hist.filter((h) => h.date !== slug);
  hist.push({ date: slug, scores });
  hist.sort((a, b) => a.date.localeCompare(b.date));
  fs.mkdirSync("public/data", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(hist.slice(-90)) + "\n");
  console.log(`[snapshot] country-risk ${slug} guardado (${Math.min(hist.length, 90)} días de historia)`);
} catch (e) {
  console.log(`[snapshot] omitido: ${e?.message ?? e}`);
}
