// scripts/gen-daily-action.mjs
// Generador del view diario para GitHub Actions — SIN límite de 60s (la razón
// de existir: el view bilingüe pide hasta 6000 tokens a Claude ≈ 55-90s, que
// no cabe en una función de Vercel Hobby; aquí puede tardar lo que necesite).
// Reusa lib/dailyView.js tal cual. Escribe content/<slug>.md y el workflow lo
// commitea (el push dispara el redeploy de Vercel). Idempotente: si el archivo
// ya existe, sale sin hacer nada. DRY_RUN=1 genera pero no escribe.
import fs from "fs";
import path from "path";
import { fetchLiveData, generateDailyView, buildMarkdown } from "../lib/dailyView.js";

const TZ = "America/Mexico_City";
const slug = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const dateLong = new Date().toLocaleDateString("es-MX", {
  weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TZ,
});
const outFile = path.join(process.cwd(), "content", `${slug}.md`);
const dryRun = process.env.DRY_RUN === "1";

// Sáb/dom no hay view (el cron ya es L-V; esto cubre un dispatch manual).
const dow = new Date(`${slug}T12:00:00Z`).getUTCDay();
if (dow === 0 || dow === 6) {
  console.log(`[gen] ${slug} es fin de semana — nada que generar.`);
  process.exit(0);
}

if (!dryRun && fs.existsSync(outFile)) {
  console.log(`[gen] content/${slug}.md ya existe — idempotente, salgo.`);
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[gen] FALTA ANTHROPIC_API_KEY (secret del repo).");
  process.exit(1);
}

const t0 = Date.now();
console.log(`[gen] ${slug} — obteniendo datos en vivo…`);
const data = await fetchLiveData("https://riskon.lat");
console.log(`[gen] datos OK (${((Date.now() - t0) / 1000).toFixed(1)}s) — generando view con Claude…`);
const view = await generateDailyView(data, dateLong, slug);
const md = buildMarkdown(view, slug);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[gen] view listo en ${secs}s — score ${view.score} · "${view.title_es}"`);

if (dryRun) {
  console.log("[gen] DRY_RUN=1 — no escribo el archivo. Muestra:");
  console.log(md.slice(0, 600));
  process.exit(0);
}
fs.writeFileSync(outFile, md, "utf8");
console.log(`[gen] escrito content/${slug}.md (${md.length} bytes) — el workflow lo commitea.`);
