// app/api/trigger-gen/route.js
// El eslabón que faltaba: cronjob.org (puntual al segundo) dispara AQUÍ a las
// 6:50, y este endpoint le da play al workflow de GitHub Actions (sin límite
// de 60s) vía workflow_dispatch. Así la cadena generar→enviar corre puntual
// sin depender del reloj interno de Actions (flaky: el 2026-07-07 no disparó)
// ni del cron de Vercel Hobby (lag de 40-100 min).
// Responde en <1s — cabe holgado en el límite de Vercel.
// Requiere GITHUB_TOKEN con permiso "Actions: write" en el repo.
//
// 2026-09-11: también dispara el RECAP con ?wf=recap. El recap se promete a las
// 16:00 CDMX y sus crons de Actions (22:00 y 22:30 UTC) llegan tarde SIEMPRE:
// salió 16:31 (14-ago), 16:32 (21-ago), 21:38 (28-ago) y 17:55 (4-sep). Con
// ?wf=recap, cronjob.org lo dispara puntual igual que el view diario. La guarda
// del marcador solo aplica al view; el recap tiene la suya en send-recap.
import { REPO, checkSentMarker } from "../../../lib/dailyView";
import { alertAdmin } from "../../../lib/alertAdmin";

export const dynamic = "force-dynamic";

async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  const url = new URL(request.url);
  const force = url.searchParams.get("force"); // prueba: salta la guarda
  // Lista blanca: nadie con el secreto puede despachar un workflow arbitrario.
  const WORKFLOWS = { daily: "gen-daily.yml", recap: "recap-weekly.yml" };
  const wf = WORKFLOWS[url.searchParams.get("wf") ?? "daily"];
  if (!wf) return Response.json({ error: "workflow desconocido" }, { status: 400 });

  // Si el correo de hoy YA salió, ni molestamos a Actions. Con "unknown"
  // (GitHub caído) despachamos de todos modos: el workflow es idempotente y la
  // guarda dura (fail-closed) vive en send-daily; no despachar por un error
  // transitorio sí costaría la puntualidad del día.
  let markerCheck = wf === WORKFLOWS.daily ? "skipped-by-force" : "no-aplica-al-recap";
  if (!force && wf === WORKFLOWS.daily) {
    const marker = await checkSentMarker(slug);
    markerCheck = marker.status;
    if (marker.status === "sent") {
      return Response.json({ ok: true, skipped: "already sent today", slug, marker });
    }
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${wf}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "riskon-daily-cron",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  // 204 = dispatch aceptado. 403/404 casi siempre = al token le falta el
  // permiso Actions:write → avisar con instrucción concreta.
  if (res.status === 204) {
    return Response.json({ ok: true, dispatched: true, workflow: wf, slug, markerCheck });
  }
  const detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
  await alertAdmin(`trigger-gen NO pudo despachar ${wf} (${slug})`, {
    detail,
    accion:
      "Revisar que el fine-grained PAT (GITHUB_TOKEN en Vercel) tenga el permiso 'Actions: Read and write' sobre el repo Risk-On. El envío diario caerá a los respaldos 7:00/7:10; el recap, a sus crons de Actions.",
  });
  return Response.json({ ok: false, error: detail, slug }, { status: 502 });
}

export { handler as GET, handler as POST };
