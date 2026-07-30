// app/api/subscribe/route.js
// Recibe { email, nombre?, apellidos?, trato?, lang?, whatsapp?, fuente? }, lo
// reenvía a un Google Apps Script Web App que lo agrega a la Google Sheet (ver
// scripts/apps-script-subscribe.gs) y manda un correo de bienvenida.
// whatsapp = teléfono opcional para las futuras alertas intradía (tier Pro);
// fuente = canal de adquisición (x|linkedin|google|colega|otro) para medir
// qué canal convierte. Requiere SHEETS_WEBHOOK_URL y RESEND_API_KEY.

import { Resend } from "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE = "https://riskon.lat";
const CALENDLY = "https://calendly.com/mauriciomercenariofx/30min";

// Campos de personalización opcionales: si el suscriptor los llena, el correo
// diario lo saluda por su nombre ("¡Buenos días, Mauricio!"). Recortados y sin
// caracteres de control para no romper el HTML del correo.
const cleanField = (s) =>
  typeof s === "string" ? s.replace(/[<>&"'`]/g, "").trim().slice(0, 60) : "";

// Teléfono: solo dígitos, +, espacios, guiones y paréntesis (máx 24 chars).
const cleanPhone = (s) =>
  typeof s === "string" ? s.replace(/[^0-9+()\-\s]/g, "").trim().slice(0, 24) : "";

// Canal de adquisición: allowlist cerrada — cualquier otra cosa se descarta.
const FUENTES = new Set(["x", "linkedin", "google", "colega", "otro"]);
const cleanFuente = (s) =>
  typeof s === "string" && FUENTES.has(s.toLowerCase()) ? s.toLowerCase() : "";

// Con trato (Sr./Sra.) usa el apellido (o el nombre); si solo hay nombre, el
// nombre de pila; si no, "". Misma regla que el correo diario.
function saludoNombre({ nombre, apellidos, trato }) {
  if (trato && apellidos) return `${trato} ${apellidos}`;
  if (trato && nombre)    return `${trato} ${nombre}`;
  return nombre;
}

const C = {
  bg: "#EFEAE0", card: "#FBF9F4", border: "#E2DCD0",
  text: "#1A1A1A", bone: "#FBF9F4", muted: "#6B6B6B", faint: "#9A9A9A",
};

function welcomeEmail({ name, lang }) {
  const sans  = "'Helvetica Neue',Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";
  const en = lang === "en";
  const hi = name
    ? (en ? `Welcome, ${name}!` : `¡Bienvenido, ${name}!`)
    : (en ? "Welcome!" : "¡Bienvenido!");

  const lead = en
    ? "You're in. Starting tomorrow, every market morning <strong>El Pre-Market</strong> lands in your inbox <strong>before 7:00 (CDMX)</strong>, built on minutes-old data: the day's Risk On score, the macro context behind the moves and what to watch — with a clear focus on the peso."
    : "Ya estás dentro. A partir de mañana, cada mañana de mercado <strong>El Pre-Market</strong> llega a tu bandeja <strong>antes de las 7:00 (CDMX)</strong>, con datos de minutos: el Risk On score del día, el contexto macro detrás de los movimientos y qué vigilar — con foco en el peso.";

  const bullets = en
    ? ["The Risk On index (0–100): risk-off, defensive, constructive or risk-on.",
       "The exact USD/MXN spot at send time — minutes old, never last night's close.",
       "Direct, analytical read — the why behind the moves, no noise."]
    : ["El índice Risk On (0–100): risk-off, defensivo, constructivo o risk-on.",
       "El spot exacto del USD/MXN al momento del envío — datos de minutos, nunca el cierre de anoche.",
       "Lectura directa y analítica — el porqué de los movimientos, sin ruido."];

  const noSpam = en
    ? "No spam. You can unsubscribe anytime from the footer of any email."
    : "Sin spam. Puedes darte de baja cuando quieras desde el pie de cualquier correo.";
  const tip = en
    ? `Tip so it never lands in spam: add <strong>view@riskon.lat</strong> to your contacts. And if you're curious about how the index has done, the full track record is public: <a href="${SITE}/indice" style="color:${C.text}">riskon.lat/indice</a>.`
    : `Tip para que nunca caiga en spam: agrega <strong>view@riskon.lat</strong> a tus contactos. Y si te da curiosidad cómo le ha ido al índice, el historial completo es público: <a href="${SITE}/indice" style="color:${C.text}">riskon.lat/indice</a>.`;
  const ctaSite = en ? "Explore riskon.lat →" : "Explora riskon.lat →";
  const ctaCal  = en ? "Book a 1-on-1 advisory" : "Agenda una asesoría 1 a 1";
  const sign    = en ? "— Mauricio Mercenario" : "— Mauricio Mercenario";

  const html = `<!DOCTYPE html><html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
    <tr><td align="center" style="padding:28px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-bottom:none;border-radius:4px 4px 0 0">
        <tr><td align="center" style="padding:34px 44px 22px 44px">
          <img src="${SITE}/riskon-logo.png" width="148" alt="Risk On" style="display:block;width:148px;max-width:55%;height:auto;margin:0 auto" />
          <div style="font-family:${sans};font-size:10px;letter-spacing:3px;color:${C.faint};text-transform:uppercase;margin-top:14px">Daily views by Mauricio Mercenario</div>
        </td></tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 4px 4px">
        <tr><td style="padding:34px 44px 40px 44px">
          <div style="font-family:${serif};font-size:24px;font-weight:700;color:${C.text};margin-bottom:16px">${hi}</div>
          <div style="font-family:${sans};font-size:15px;line-height:1.7;color:#3a3a3a;margin-bottom:22px">${lead}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            ${bullets.map((b) => `<tr>
              <td style="padding:0 0 12px 0;vertical-align:top;width:18px"><div style="width:6px;height:6px;border-radius:50%;background:${C.text};margin-top:8px"></div></td>
              <td style="padding:0 0 12px 0;font-family:${sans};font-size:14px;color:#3a3a3a;line-height:1.6">${b}</td>
            </tr>`).join("")}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:22px">
            <tr><td style="background:${C.text};border-radius:4px">
              <a href="${SITE}" style="display:inline-block;padding:13px 26px;font-family:${sans};font-size:14px;font-weight:600;color:${C.bone};text-decoration:none">${ctaSite}</a>
            </td></tr>
          </table>
          <div style="font-family:${sans};font-size:13px;line-height:1.7;color:${C.muted};margin-bottom:14px">
            ${tip}
          </div>
          <div style="font-family:${sans};font-size:13px;line-height:1.6;color:${C.muted};margin-bottom:22px">
            ${noSpam}
          </div>
          <div style="border-top:1px solid ${C.border};padding-top:18px;font-family:${sans};font-size:13px;color:${C.muted}">
            <a href="${CALENDLY}" style="color:${C.text};font-weight:600;text-decoration:none">${ctaCal} →</a>
            <div style="margin-top:14px;font-family:${serif};font-style:italic;color:${C.text}">${sign}</div>
          </div>
        </td></tr>
      </table>
      <div style="font-family:${sans};font-size:11px;color:${C.faint};padding:18px 0">riskon.lat</div>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    hi, "",
    (en ? "You're in. Starting tomorrow, El Pre-Market lands in your inbox before 7:00 (CDMX) every market morning, built on minutes-old data: the day's Risk On score, the macro context and what to watch — focused on the peso."
        : "Ya estás dentro. A partir de mañana, El Pre-Market llega a tu bandeja antes de las 7:00 (CDMX) cada mañana de mercado, con datos de minutos: el Risk On score del día, el contexto macro y qué vigilar — con foco en el peso."),
    "",
    ...bullets.map((b) => `- ${b}`),
    "",
    noSpam, "",
    `${ctaSite} ${SITE}`,
    `${ctaCal}: ${CALENDLY}`,
    "", sign, "riskon.lat",
  ].join("\n");

  const subject = en ? "Welcome to Risk On" : "Bienvenido a Risk On";
  return { subject, html, text };
}

// GET → conteo de suscriptores activos (para el social proof del form).
// Cacheado 1h en CDN; si el Sheet falla devuelve null y el form usa copy genérico.
export async function GET() {
  try {
    const url = process.env.SHEETS_LIST_URL;
    if (!url) return Response.json({ count: null });
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const active = Array.isArray(data) ? data.length : (data?.active?.length ?? 0);
    return Response.json(
      { count: active > 0 ? active : null },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch {
    return Response.json({ count: null });
  }
}

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
  const lang      = body?.lang === "en" ? "en" : "es";
  const whatsapp  = cleanPhone(body?.whatsapp);
  const fuente    = cleanFuente(body?.fuente);

  const webhook = process.env.SHEETS_WEBHOOK_URL;
  if (!webhook) {
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nombre, apellidos, trato, lang, whatsapp, fuente, date: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    return Response.json({ error: "upstream error" }, { status: 502 });
  }

  // Correo de bienvenida (best-effort: si falla, el alta ya quedó registrada).
  let welcomed = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const { subject, html, text } = welcomeEmail({ name: saludoNombre({ nombre, apellidos, trato }), lang });
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        // Mismo remitente que el correo diario — reconocimiento desde el día 1.
        from: '"Mauricio | Risk-On" <view@riskon.lat>',
        to: email, subject, html, text,
      });
      welcomed = !error;
    } catch {}
  }

  return Response.json({ ok: true, welcomed });
}
