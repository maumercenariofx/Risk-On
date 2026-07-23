// lib/alertSend.js
// Despachador de alertas del tier Pro: WhatsApp (Meta Cloud API) con fallback
// automático a correo (Resend) si no hay credenciales de WhatsApp o el envío
// falla. Así el motor funciona HOY por correo y el WhatsApp se enchufa solo
// cuando existan WA_TOKEN + WA_PHONE_ID (+ plantilla aprobada) en Vercel.
//
// Plantilla de Meta esperada (categoría UTILITY, es_MX), nombre en
// WA_TEMPLATE (default "riskon_alerta"), body con 2 variables:
//   "🔔 Alerta Risk-On: {{1}} USD/MXN ahora: {{2}}. Gestiona tus alertas en riskon.lat/alertas"
// Las alertas son business-initiated → Meta EXIGE plantilla aprobada.

const FROM = '"Risk-On Alertas" <view@riskon.lat>';

export function waConfigured() {
  return !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID);
}

async function sendWhatsApp(toE164, text, spot) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WA_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164.replace(/[^\d]/g, ""),
        type: "template",
        template: {
          name: process.env.WA_TEMPLATE || "riskon_alerta",
          language: { code: "es_MX" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text },
                { type: "text", text: spot },
              ],
            },
          ],
        },
      }),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WA ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function sendEmail(to, subject, text) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Envía una alerta a un destinatario. Devuelve {channel, ok, error?}.
// wa = número E.164 (o null) · contact = correo (siempre presente, es la llave).
export async function dispatchAlert({ contact, wa, subject, text, spot }) {
  if (wa && waConfigured()) {
    try {
      await sendWhatsApp(wa, text, spot ?? "—");
      return { channel: "whatsapp", ok: true };
    } catch (e) {
      // fallback a correo: una alerta perdida es peor que el canal equivocado
      try {
        await sendEmail(contact, subject, `${text}\n\n(Enviado por correo: WhatsApp no disponible — ${e.message})`);
        return { channel: "email-fallback", ok: true, error: e.message };
      } catch (e2) {
        return { channel: "none", ok: false, error: `${e.message} // ${e2.message}` };
      }
    }
  }
  try {
    await sendEmail(contact, subject, text);
    return { channel: "email", ok: true };
  } catch (e) {
    return { channel: "none", ok: false, error: e.message };
  }
}
