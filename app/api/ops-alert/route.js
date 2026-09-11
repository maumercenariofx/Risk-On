// app/api/ops-alert/route.js
// Relé de alertas operativas para los pasos de GitHub Actions. RESEND_API_KEY
// vive solo en Vercel, así que un paso best-effort del workflow que fallaba no
// tenía cómo avisar: X respondió 402 "credits depleted" del 7 al 11-sep de 2026
// y nadie se enteró, porque el paso es continue-on-error y el run quedaba verde.
// POST { subject, detail } con Authorization: Bearer CRON_SECRET. El
// destinatario lo fija alertAdmin (solo Mauricio); aquí no se elige.
import { alertAdmin } from "../../../lib/alertAdmin";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let payload = {};
  try { payload = await request.json(); } catch {}
  const subject = String(payload.subject ?? "alerta sin asunto").slice(0, 140);
  const detail = typeof payload.detail === "string"
    ? payload.detail
    : JSON.stringify(payload.detail ?? {}, null, 2);
  const ok = await alertAdmin(subject, detail.slice(0, 4000));
  return Response.json({ ok });
}
