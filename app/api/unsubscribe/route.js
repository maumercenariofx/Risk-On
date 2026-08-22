// app/api/unsubscribe/route.js
// Baja de la lista. El click del correo llega por GET (?email=) y devuelve una
// página de confirmación; el "one-click" de Gmail/Yahoo llega por POST. En ambos
// casos se registra la baja en el Google Sheet (action: "unsubscribe") vía el
// mismo SHEETS_WEBHOOK_URL, para que al conectar la lectura del Sheet el cron ya
// filtre a quien se dio de baja.
//
// SEGURIDAD (auditoría 2026-08-21). Dos fallas, ambas arregladas aquí:
//
//   1. XSS reflejado. page() interpolaba ${email} crudo en el HTML de respuesta,
//      así que cualquier URL /api/unsubscribe?email=<script>… ejecutaba script
//      en riskon.lat. Ahora todo lo que viene del query pasa por escapeHtml().
//
//   2. Baja sin autenticar. Un GET bastaba para dar de baja a cualquiera cuyo
//      correo conocieras, y los enlaces del correo diario llevan el email en
//      claro. Ahora un GET SIN FIRMA VÁLIDA ya no da de baja: muestra una página
//      de confirmación cuyo botón hace POST. Eso mata el ataque de un solo click
//      (un <img src> o un link no bastan) sin romper NADA de lo ya enviado:
//      todos los correos históricos siguen funcionando, con un click extra.
//
// El one-click de RFC 8058 (POST) queda intacto — es exactamente el mismo
// mecanismo que usa el botón de confirmación, y lo dispara el propio lector
// desde su bandeja. Cuando el generador del correo empiece a firmar el enlace
// con sig() el GET firmado volverá a ser inmediato, sin paso intermedio.

import { createHmac, timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

// Misma construcción que app/api/alerts/route.js: HMAC del correo con CRON_SECRET.
function sig(email) {
  return createHmac("sha256", process.env.CRON_SECRET || "")
    .update(String(email).trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

function validSig(email, given) {
  if (!email || !given || !process.env.CRON_SECRET) return false;
  const a = Buffer.from(sig(email));
  const b = Buffer.from(String(given));
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

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

function shell(inner) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja · Riskon</title>
<meta name="robots" content="noindex"></head>
<body style="margin:0;background:#FAF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1A1A1A">
  <div style="max-width:480px;margin:0 auto;padding:80px 24px;text-align:center">
    <img src="/riskon-logo.png" width="120" alt="Risk On" style="display:block;margin:0 auto 28px" />
    ${inner}
    <a href="https://riskon.lat" style="display:inline-block;margin-top:28px;color:#1A1A1A;font-size:13px;font-weight:600">← Volver a riskon.lat</a>
  </div>
</body></html>`;
}

function donePage(email) {
  const who = email
    ? `<b>${escapeHtml(email)}</b> ya no recibirá El Pre-Market.`
    : "Tu correo ya no recibirá El Pre-Market.";
  return shell(`
    <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 12px">Listo, te diste de baja</h1>
    <p style="font-size:15px;line-height:1.6;color:#6B6B6B;margin:0 0 8px">${who}</p>
    <p style="font-size:13px;color:#9A9488;margin:24px 0 0">¿Cambiaste de opinión? Escríbenos a view@riskon.lat</p>`);
}

function confirmPage(email) {
  const safe = escapeHtml(email);
  return shell(`
    <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 12px">¿Confirmas la baja?</h1>
    <p style="font-size:15px;line-height:1.6;color:#6B6B6B;margin:0 0 20px">
      Vamos a dar de baja a <b>${safe}</b>. Dejarás de recibir El Pre-Market.
    </p>
    <form method="POST" action="/api/unsubscribe?email=${encodeURIComponent(email)}" style="margin:0">
      <button type="submit" style="background:#1A1A1A;color:#FAF8F3;border:0;border-radius:8px;padding:12px 22px;font-size:14px;font-weight:600;cursor:pointer">
        Sí, darme de baja
      </button>
    </form>
    <p style="font-size:13px;color:#9A9488;margin:22px 0 0">
      ¿Llegaste aquí por error? No hagas nada y sigues suscrito.
    </p>`);
}

const html = (body) =>
  new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "";
  const given = url.searchParams.get("sig") ?? "";

  // Enlace firmado → baja inmediata, como siempre.
  if (validSig(email, given)) {
    await recordUnsub(email);
    return html(donePage(email));
  }

  // Sin firma → confirmación explícita. No se registra nada todavía.
  if (!email) return html(donePage(""));
  return html(confirmPage(email));
}

export async function POST(request) {
  // One-click (RFC 8058): el cuerpo trae List-Unsubscribe=One-Click; el email va
  // en el query. También es el destino del botón de confirmPage().
  const email = new URL(request.url).searchParams.get("email") ?? "";
  await recordUnsub(email);

  // El one-click de Gmail espera JSON; el form del navegador espera una página.
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return html(donePage(email));
  return Response.json({ ok: true });
}
