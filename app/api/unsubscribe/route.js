// app/api/unsubscribe/route.js
// Baja de la lista. El click del correo llega por GET (?email=) y devuelve una
// página de confirmación; el "one-click" de Gmail/Yahoo llega por POST. En ambos
// casos se registra la baja en el Google Sheet (action: "unsubscribe") vía el
// mismo SHEETS_WEBHOOK_URL, para que al conectar la lectura del Sheet el cron ya
// filtre a quien se dio de baja.

export const dynamic = "force-dynamic";

async function recordUnsub(email) {
  const webhook = process.env.SHEETS_WEBHOOK_URL;
  if (!webhook || !email) return false;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action: "unsubscribe", date: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function page(email) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja confirmada · Riskon</title></head>
<body style="margin:0;background:#FAF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1A1A1A">
  <div style="max-width:480px;margin:0 auto;padding:80px 24px;text-align:center">
    <img src="/riskon-logo.png" width="120" alt="Risk On" style="display:block;margin:0 auto 28px" />
    <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 12px">Listo, te diste de baja</h1>
    <p style="font-size:15px;line-height:1.6;color:#6B6B6B;margin:0 0 8px">
      ${email ? `<b>${email}</b> ya no recibirá El Pre-Market.` : "Tu correo ya no recibirá El Pre-Market."}
    </p>
    <p style="font-size:13px;color:#9A9488;margin:24px 0 0">¿Cambiaste de opinión? Escríbenos a view@riskon.lat</p>
    <a href="https://riskon.lat" style="display:inline-block;margin-top:28px;color:#1A1A1A;font-size:13px;font-weight:600">← Volver a riskon.lat</a>
  </div>
</body></html>`;
}

export async function GET(request) {
  const email = new URL(request.url).searchParams.get("email") ?? "";
  await recordUnsub(email);
  return new Response(page(email), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request) {
  // One-click (RFC 8058): el cuerpo trae List-Unsubscribe=One-Click; el email va en el query.
  const email = new URL(request.url).searchParams.get("email") ?? "";
  await recordUnsub(email);
  return Response.json({ ok: true });
}
