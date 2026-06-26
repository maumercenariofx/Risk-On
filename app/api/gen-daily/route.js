import { fetchLiveData, generateDailyView, buildMarkdown, publishToGitHub } from "../../../lib/dailyView";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Genera y publica el view del día en GitHub, sin enviar emails.
// Corre via cronjob.org (~6:50 AM México) + Vercel cron de respaldo, para que
// el content esté listo cuando se dispare el envío (~6:58 AM).
// Acepta GET y POST (igual que send-daily) — así no falla con 405 si el
// disparador externo usa POST.
async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  const dateLong = new Date().toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Mexico_City",
  });
  const force = new URL(request.url).searchParams.get("force");

  // Idempotencia: si ya existe el content de hoy, no regenerar (salvo ?force=1).
  if (!force) {
    const exists = await fetch(
      `https://raw.githubusercontent.com/maumercenariofx/Risk-On/main/content/${slug}.md`,
      { cache: "no-store" }
    ).then((r) => r.ok).catch(() => false);
    if (exists) return Response.json({ ok: true, skipped: "already generated today", slug });
  }

  const data = await fetchLiveData("https://riskon.lat");
  const view = await generateDailyView(data, dateLong, slug);
  const md = buildMarkdown(view, slug);
  const pub = await publishToGitHub(slug, md);

  return Response.json({ ok: true, slug, score: view.score, riskState: view.riskState, published: pub.ok, publishError: pub.error });
}

export { handler as GET, handler as POST };
