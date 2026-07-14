// scripts/gen-recap-action.mjs
// Genera el RECAP SEMANAL en GitHub Actions (viernes 16:00 CDMX, sin límite de
// tiempo). Escribe content/recaps/<viernes>.md y el workflow lo commitea; el
// envío lo hace /api/send-recap (con marcador anti-doble-envío fail-closed).
// Idempotente: si el archivo ya existe, sale. DRY_RUN=1 genera sin escribir.
import fs from "fs";
import path from "path";
import { generateWeeklyRecap, buildRecapMarkdown } from "../lib/weeklyRecap.js";

const TZ = "America/Mexico_City";
const slug = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const dateLong = new Date().toLocaleDateString("es-MX", {
  weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TZ,
});
const dryRun = process.env.DRY_RUN === "1";
const outDir = path.join(process.cwd(), "content", "recaps");
const outFile = path.join(outDir, `${slug}.md`);

// Solo viernes (el cron ya es viernes; esto cubre un dispatch manual en otro día).
const dow = new Date(`${slug}T12:00:00Z`).getUTCDay();
if (dow !== 5 && !dryRun) {
  console.log(`[recap] ${slug} no es viernes — nada que generar (usa dry_run=1 para probar).`);
  process.exit(0);
}
if (!dryRun && fs.existsSync(outFile)) {
  console.log(`[recap] content/recaps/${slug}.md ya existe — idempotente, salgo.`);
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[recap] FALTA ANTHROPIC_API_KEY (secret del repo).");
  process.exit(1);
}

const t0 = Date.now();
console.log(`[recap] ${slug} — reuniendo la semana y generando…`);
const recap = await generateWeeklyRecap(slug, dateLong);
console.log(`[recap] listo en ${((Date.now() - t0) / 1000).toFixed(1)}s — "${recap.title_es}"`);

const md = buildRecapMarkdown(recap, slug);
if (dryRun) {
  console.log(`[recap] DRY_RUN=1 — no escribo el archivo. Recap completo:\n${md}`);
} else {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, md);
  console.log(`[recap] escrito content/recaps/${slug}.md (${md.length} chars)`);
}
