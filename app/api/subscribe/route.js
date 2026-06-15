// app/api/subscribe/route.js
// Recibe { email } y lo reenvía a un Google Apps Script Web App que lo
// agrega como fila a una Google Sheet (ver scripts/apps-script-subscribe.gs).
// Requiere la variable de entorno SHEETS_WEBHOOK_URL (URL del Web App ya
// publicado). Si no está configurada, responde 503 sin tronar el sitio.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  let email;
  try {
    ({ email } = await request.json());
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return Response.json({ error: "invalid email" }, { status: 400 });
  }

  const webhook = process.env.SHEETS_WEBHOOK_URL;
  if (!webhook) {
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, date: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    return Response.json({ error: "upstream error" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
