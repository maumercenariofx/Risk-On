// app/api/subscribe/route.js
// Recibe { email } y lo reenvía a un Google Apps Script Web App que lo
// agrega como fila a una Google Sheet (ver scripts/apps-script-subscribe.gs).
// Requiere la variable de entorno SHEETS_WEBHOOK_URL (URL del Web App ya
// publicado). Si no está configurada, responde 503 sin tronar el sitio.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Campos de personalización opcionales: si el suscriptor los llena, el correo
// diario lo saluda por su nombre ("¡Buenos días, Mauricio!"). Recortados y sin
// caracteres de control para no romper el HTML del correo.
const cleanField = (s) =>
  typeof s === "string" ? s.replace(/[<>&"'`]/g, "").trim().slice(0, 60) : "";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const email = body?.email;
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return Response.json({ error: "invalid email" }, { status: 400 });
  }

  const nombre    = cleanField(body?.nombre);
  const apellidos = cleanField(body?.apellidos);
  const trato     = cleanField(body?.trato);

  const webhook = process.env.SHEETS_WEBHOOK_URL;
  if (!webhook) {
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nombre, apellidos, trato, date: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    return Response.json({ error: "upstream error" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
