// app/api/trigger-gen/route.js
// El eslabón que faltaba: cronjob.org (puntual al segundo) dispara AQUÍ a las
// 6:50, y este endpoint le da play al workflow de GitHub Actions (sin límite
// de 60s) vía workflow_dispatch. Así la cadena generar→enviar corre puntual
// sin depender del reloj interno de Actions (flaky: el 2026-07-07 no disparó)
// ni del cron de Vercel Hobby (lag de 40-100 min).
// Responde en <1s — cabe holgado en el límite de Vercel.
// Requiere GITHUB_TOKEN con permiso "Actions: write" en el repo.
import { REPO } from "../../../lib/dailyView";
import { alertAdmin } from "../../../lib/alertAdmin";

export const dynamic = "force-dynamic";

async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

  // Si el correo de hoy YA salió, ni molestamos a Actions.
  try {
    const marker = await fetch(
      `https://api.github.com/repos/${REPO}/contents/sent/${slug}.json?ref=main`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "riskon-daily-cron",
        },
        cache: "no-store",
      }
    );
    if (marker.ok) {
      return Response.json({ ok: true, skipped: "already sent today", slug });
    }
  } catch {}

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/gen-daily.yml/dispatches`,
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
    return Response.json({ ok: true, dispatched: true, slug });
  }
  const detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
  await alertAdmin(`trigger-gen NO pudo despachar el workflow (${slug})`, {
    detail,
    accion:
      "Revisar que el fine-grained PAT (GITHUB_TOKEN en Vercel) tenga el permiso 'Actions: Read and write' sobre el repo Risk-On. El envío caerá a los respaldos 7:00/7:10.",
  });
  return Response.json({ ok: false, error: detail, slug }, { status: 502 });
}

export { handler as GET, handler as POST };
