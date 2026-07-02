import { fetchLiveData, generateDailyView, buildMarkdown, publishToGitHub } from "../../../lib/dailyView";
import { alertAdmin } from "../../../lib/alertAdmin";

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

  try {
    const data = await fetchLiveData("https://riskon.lat");
    const view = await generateDailyView(data, dateLong, slug);
    const md = buildMarkdown(view, slug);
    const pub = await publishToGitHub(slug, md);

    // Si la publicación falló, send-daily (7:00) intentará generar inline, pero
    // avisa desde ya para poder intervenir antes del envío.
    if (!pub.ok) await alertAdmin(`gen-daily no pudo publicar el view (${slug})`, pub.error);

    return Response.json({ ok: true, slug, score: view.score, riskState: view.riskState, published: pub.ok, publishError: pub.error });
  } catch (e) {
    const error = String(e?.message ?? e);
    await alertAdmin(`gen-daily falló (${slug})`, { error });
    return Response.json({ ok: false, slug, error }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
