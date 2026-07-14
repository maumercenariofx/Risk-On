// lib/subscribers.js
// Lista de destinatarios y personalización del saludo — extraído de
// app/api/send-daily/route.js (2026-07-14) para que el recap semanal
// (/api/send-recap) reuse EXACTAMENTE la misma lógica. Única fuente de verdad.

// Piso de seguridad de destinatarios (por si el Sheet falla). Vive en la env
// var SUBSCRIBERS_FALLBACK (correos separados por coma) — NUNCA hardcodear
// correos aquí: el repo es PÚBLICO y quedarían expuestos en GitHub.
const SUBSCRIBERS = (process.env.SUBSCRIBERS_FALLBACK ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const clean = (e) => String(e).trim().toLowerCase();

// Limpia un campo de nombre/trato que viene del formulario (anti-XSS en el HTML
// del correo + recorte de longitud). Devuelve "" si no hay nada útil.
export const cleanName = (s) =>
  String(s ?? "").replace(/[<>&"'`]/g, "").trim().slice(0, 60);

// Cómo nombrar al suscriptor en el saludo. Con trato (Sr./Sra.) usa el apellido
// (o el nombre si no dio apellidos) → "Sr. González"; si solo dio nombre, usa el
// nombre de pila → "Mauricio". Sin datos, "" → saludo genérico.
export function saludoNombre(sub) {
  const trato     = cleanName(sub?.trato);
  const nombre    = cleanName(sub?.nombre);
  const apellidos = cleanName(sub?.apellidos);
  if (trato && apellidos) return `${trato} ${apellidos}`;
  if (trato && nombre)    return `${trato} ${nombre}`;
  return nombre;
}

// Inserta el nombre dentro del saludo base: "¡Buenos días!" → "¡Buenos días, Mauricio!".
// .replace con string reemplaza solo la PRIMERA "!", así respeta sufijos (feriados, etc.).
export function personalizeGreeting(greeting, sub) {
  const name = saludoNombre(sub);
  if (!name || !greeting) return greeting;
  return greeting.includes("!") ? greeting.replace("!", `, ${name}!`) : `${greeting} ${name}`;
}

// Diagnóstico: golpea SHEETS_LIST_URL y reporta exactamente qué responde,
// para distinguir entre doGet ausente, token equivocado, o parseo OK.
export async function probeSheet() {
  const url = process.env.SHEETS_LIST_URL;
  if (!url) return { configured: false };
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    const text = await res.text();
    let parsed = null, activeCount = null, unsubCount = null, parseError = null;
    try {
      parsed = JSON.parse(text);
      const active = Array.isArray(parsed) ? parsed : (parsed?.active ?? []);
      const unsub  = Array.isArray(parsed) ? []     : (parsed?.unsub  ?? []);
      activeCount = Array.isArray(active) ? active.length : null;
      unsubCount  = Array.isArray(unsub)  ? unsub.length  : null;
    } catch (e) {
      parseError = String(e?.message ?? e);
    }
    return {
      configured: true,
      httpStatus: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      bodySnippet: text.slice(0, 400),
      activeCount,
      unsubCount,
      parseError,
    };
  } catch (e) {
    return { configured: true, fetchError: String(e?.message ?? e) };
  }
}

// Lista final de destinatarios = (piso de respaldo ∪ activos del Sheet) − bajas del Sheet.
// Devuelve [{ email, nombre, apellidos, trato, lang }]. El Sheet puede mandar `active`
// como arreglo de correos (compat) o de objetos con los campos opcionales del formulario.
export async function getSubscribers() {
  const map = new Map(); // email → { email, nombre, apellidos, trato }
  SUBSCRIBERS.map(clean).forEach((e) => map.set(e, { email: e }));
  const url = process.env.SHEETS_LIST_URL;
  if (url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const active = Array.isArray(data) ? data : (data?.active ?? []);
        const unsub  = Array.isArray(data) ? []   : (data?.unsub  ?? []);
        active.forEach((item) => {
          const email = clean(typeof item === "string" ? item : item?.email);
          if (!email) return;
          map.set(email, {
            email,
            nombre:    typeof item === "object" ? cleanName(item?.nombre)    : "",
            apellidos: typeof item === "object" ? cleanName(item?.apellidos) : "",
            trato:     typeof item === "object" ? cleanName(item?.trato)     : "",
            // Idioma del correo. Solo "en" cambia algo; cualquier otra cosa
            // (columna vacía, filas viejas) cae a español.
            lang:      typeof item === "object" && item?.lang === "en" ? "en" : "es",
          });
        });
        unsub.map((e) => clean(typeof e === "string" ? e : e?.email)).filter(Boolean).forEach((e) => map.delete(e));
      }
    } catch {}
  }
  return [...map.values()];
}
