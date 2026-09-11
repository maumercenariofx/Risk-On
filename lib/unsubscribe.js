// lib/unsubscribe.js
// Firma de los enlaces de baja: HMAC-SHA256 del correo con CRON_SECRET, 32 hex.
// UNA sola fuente para quien firma (send-daily, send-recap) y quien verifica
// (app/api/unsubscribe). Con una copia en cada lado, un cambio en una rompería
// en silencio las bajas de la otra: es la lección de rollingLevels, que tuvo
// dos verdades para el mismo número hasta el 2026-08-21.
import { createHmac } from "node:crypto";

export function unsubSig(email) {
  return createHmac("sha256", process.env.CRON_SECRET || "")
    .update(String(email).trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

// Enlace de baja de un destinatario. Sin CRON_SECRET, o si la firma fallara,
// sale sin firma: el correo de las 7am jamás se cae por esto, y la ruta acepta
// los dos tipos de enlace (2026-09-11).
export function unsubUrl(site, email) {
  const base = `${site}/api/unsubscribe?email=${encodeURIComponent(email)}`;
  try {
    return process.env.CRON_SECRET ? `${base}&sig=${unsubSig(email)}` : base;
  } catch {
    return base;
  }
}
