// lib/alertAdmin.js
// Alerta operativa por correo a Mauricio cuando el pipeline diario falla
// (generación, publicación o envío). Best-effort: jamás tumba al handler que
// la llama.
import { Resend } from "resend";

const ADMIN = "mauriciomn2002@gmail.com";

export async function alertAdmin(subject, detail) {
  try {
    if (!process.env.RESEND_API_KEY) return false;
    const body =
      typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: '"Risk On · sistema" <view@riskon.lat>',
      to: ADMIN,
      subject: `⚠️ riskon.lat · ${subject}`,
      text: `${body}\n\n— alerta automática del pipeline diario de riskon.lat`,
    });
    return !error;
  } catch {
    return false;
  }
}
