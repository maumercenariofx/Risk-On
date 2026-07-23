// lib/alertsDb.js
// Base de datos del tier Pro (alertas): Turso/libSQL. AQUÍ viven contactos y
// niveles por cliente — JAMÁS en el repo (es público; los correos ya se
// purgaron del historial una vez). En local se puede probar con
// TURSO_ALERTS_URL=file:./alerts-local.db sin credenciales.
//
// Tablas:
//   pro    — suscriptores del tier Pro (correo + WhatsApp opcional). El alta es
//            manual por ahora (pilot); Mercado Pago vendrá después.
//   alerts — niveles de TC por cliente, one-shot: al dispararse pasan a
//            'fired' y no se repiten (el cliente re-arma desde /alertas).
//   kv     — estado del motor (última banda del índice, último spot...).
import { createClient } from "@libsql/client";

let db = null;
let ready = false;

export function alertsDb() {
  if (!db) {
    const url = process.env.TURSO_ALERTS_URL;
    if (!url) return null; // sin DB configurada el motor responde "not configured"
    db = createClient({ url, authToken: process.env.TURSO_ALERTS_TOKEN });
  }
  return db;
}

export async function ensureSchema() {
  const c = alertsDb();
  if (!c || ready) return c;
  await c.batch(
    [
      `CREATE TABLE IF NOT EXISTS pro (
        contact TEXT PRIMARY KEY,
        wa TEXT,
        status TEXT NOT NULL DEFAULT 'trial',
        added_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact TEXT NOT NULL,
        level REAL NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('above','below')),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        fired_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`,
    ],
    "write"
  );
  ready = true;
  return c;
}

export async function kvGet(k) {
  const c = await ensureSchema();
  if (!c) return null;
  const r = await c.execute({ sql: "SELECT v FROM kv WHERE k = ?", args: [k] });
  return r.rows[0]?.v ?? null;
}

export async function kvSet(k, v) {
  const c = await ensureSchema();
  if (!c) return;
  await c.execute({
    sql: "INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    args: [k, String(v)],
  });
}
