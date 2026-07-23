// app/api/alerts/route.js
// Gestión de alertas del tier Pro, sin contraseñas: cada cliente gestiona con
// un LINK FIRMADO (HMAC del correo con CRON_SECRET) que recibe por email.
// Acciones:
//   POST {action:"link", email}                → manda el link de gestión (solo Pro)
//   GET  ?u=<email>&t=<token>                  → lista alertas + perfil
//   POST {action:"add", u, t, level, direction}
//   POST {action:"remove"|"rearm", u, t, id}
//   POST {action:"wa", u, t, wa}               → número WhatsApp (E.164)
//   POST {action:"admin-add", contact, wa}     → alta Pro (Bearer CRON_SECRET)
export const dynamic = "force-dynamic";

import { createHmac } from "node:crypto";
import { ensureSchema } from "../../../lib/alertsDb.js";

const SITE = "https://riskon.lat";
const MAX_ACTIVE = 10;

const sign = (email) =>
  createHmac("sha256", process.env.CRON_SECRET || "")
    .update(email.toLowerCase().trim())
    .digest("hex")
    .slice(0, 32);

const cleanEmail = (e) => String(e || "").toLowerCase().trim().slice(0, 120);
const validToken = (u, t) => !!u && !!t && sign(u) === t;

async function isPro(db, email) {
  const r = await db.execute({
    sql: "SELECT contact, wa, status FROM pro WHERE contact = ? AND status != 'off'",
    args: [email],
  });
  return r.rows[0] ?? null;
}

async function sendLink(email) {
  const link = `${SITE}/alertas?u=${encodeURIComponent(email)}&t=${sign(email)}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: '"Risk-On Alertas" <view@riskon.lat>',
      to: [email],
      subject: "Tu acceso a las alertas Pro de Risk-On",
      text:
        `Gestiona tus alertas de USD/MXN y cambios de tendencia aquí:\n\n${link}\n\n` +
        `Guarda este link: es tu acceso personal (no lo compartas).\n\n— Risk-On · riskon.lat`,
    }),
  });
}

export async function GET(request) {
  const db = await ensureSchema();
  if (!db) return Response.json({ error: "not configured" }, { status: 503 });
  const url = new URL(request.url);
  const u = cleanEmail(url.searchParams.get("u"));
  const t = url.searchParams.get("t");
  if (!validToken(u, t)) return Response.json({ error: "invalid token" }, { status: 401 });
  const pro = await isPro(db, u);
  if (!pro) return Response.json({ error: "not pro" }, { status: 403 });
  const alerts = await db.execute({
    sql: "SELECT id, level, direction, status, created_at, fired_at FROM alerts WHERE contact = ? ORDER BY status = 'active' DESC, level",
    args: [u],
  });
  return Response.json({ ok: true, wa: pro.wa, status: pro.status, alerts: alerts.rows });
}

export async function POST(request) {
  const db = await ensureSchema();
  if (!db) return Response.json({ error: "not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  // ── Alta Pro (admin, protegida) ────────────────────────────────────────────
  if (action === "admin-add") {
    if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const contact = cleanEmail(body.contact);
    if (!contact.includes("@")) return Response.json({ error: "bad contact" }, { status: 400 });
    await db.execute({
      sql: `INSERT INTO pro (contact, wa, status) VALUES (?, ?, 'trial')
            ON CONFLICT(contact) DO UPDATE SET wa = COALESCE(excluded.wa, pro.wa), status = 'trial'`,
      args: [contact, body.wa || null],
    });
    await sendLink(contact).catch(() => {});
    return Response.json({ ok: true, added: contact, link_sent: true });
  }

  // ── Solicitar link de gestión ──────────────────────────────────────────────
  if (action === "link") {
    const email = cleanEmail(body.email);
    if (!email.includes("@")) return Response.json({ error: "bad email" }, { status: 400 });
    const pro = await isPro(db, email);
    // Respuesta idéntica seas Pro o no (no filtrar la lista de clientes)
    if (pro) await sendLink(email).catch(() => {});
    return Response.json({ ok: true, message: "Si tu correo es Pro, el link va en camino." });
  }

  // ── Acciones autenticadas por token ────────────────────────────────────────
  const u = cleanEmail(body.u);
  if (!validToken(u, body.t)) return Response.json({ error: "invalid token" }, { status: 401 });
  const pro = await isPro(db, u);
  if (!pro) return Response.json({ error: "not pro" }, { status: 403 });

  if (action === "add") {
    const level = Number(body.level);
    const direction = body.direction === "below" ? "below" : "above";
    if (!isFinite(level) || level < 10 || level > 30) {
      return Response.json({ error: "nivel fuera de rango (10–30)" }, { status: 400 });
    }
    const n = await db.execute({
      sql: "SELECT COUNT(*) AS c FROM alerts WHERE contact = ? AND status = 'active'",
      args: [u],
    });
    if (Number(n.rows[0].c) >= MAX_ACTIVE) {
      return Response.json({ error: `máximo ${MAX_ACTIVE} alertas activas` }, { status: 400 });
    }
    await db.execute({
      sql: "INSERT INTO alerts (contact, level, direction) VALUES (?, ?, ?)",
      args: [u, Math.round(level * 10000) / 10000, direction],
    });
    return Response.json({ ok: true });
  }

  if (action === "remove" || action === "rearm") {
    const id = Number(body.id);
    const status = action === "remove" ? "off" : "active";
    await db.execute({
      sql: "UPDATE alerts SET status = ?, fired_at = NULL WHERE id = ? AND contact = ?",
      args: [status, id, u], // AND contact: nadie toca alertas ajenas
    });
    return Response.json({ ok: true });
  }

  if (action === "wa") {
    const wa = String(body.wa || "").replace(/[^\d+]/g, "").slice(0, 16);
    if (wa && !/^\+?\d{10,15}$/.test(wa)) {
      return Response.json({ error: "número inválido (formato +5215512345678)" }, { status: 400 });
    }
    await db.execute({
      sql: "UPDATE pro SET wa = ? WHERE contact = ?",
      args: [wa || null, u],
    });
    return Response.json({ ok: true, wa: wa || null });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
