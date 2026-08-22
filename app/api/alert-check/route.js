// app/api/alert-check/route.js
// Motor de alertas del tier Pro. Lo dispara un cron externo (cronjob.org)
// cada 10 min en horario de mercado. Dos gatillos:
//   1. CAMBIO DE TENDENCIA: el índice Risk On cruza de banda (vs la última
//      banda guardada en kv) → alerta a TODOS los Pro activos.
//   2. NIVELES POR CLIENTE: el USD/MXN spot cruza un nivel configurado en
//      /alertas → alerta SOLO a ese cliente y la alerta pasa a 'fired'
//      (one-shot: se re-arma manualmente, estándar de la industria).
// Envío vía dispatchAlert (WhatsApp Meta si hay credenciales; correo si no).
// Estado en Turso — el motor es stateless entre invocaciones.
export const dynamic = "force-dynamic";

import { computeRiskScore, riskBand } from "../../../lib/riskScore.js";
import { ensureSchema, kvGet, kvSet } from "../../../lib/alertsDb.js";
import { dispatchAlert, waConfigured } from "../../../lib/alertSend.js";

// FX opera 24/5: cierra viernes 22:00 UTC y reabre domingo 22:00 UTC.
function fxClosed(now = new Date()) {
  const d = now.getUTCDay();
  const h = now.getUTCHours();
  if (d === 6) return true;
  if (d === 5 && h >= 22) return true;
  if (d === 0 && h < 22) return true;
  return false;
}

const SITE = "https://riskon.lat";

export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await ensureSchema();
  if (!db) return Response.json({ error: "alerts db not configured" }, { status: 503 });

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1"; // pruebas en fin de semana
  if (fxClosed() && !force) {
    return Response.json({ skipped: "fx closed" });
  }

  // ── Datos vivos: mismo score que la landing y el correo ────────────────────
  // `curve` faltaba: sin ese sub-score, computeRiskScore hace `continue` sobre la
  // señal y wsum baja de 100 a 93, así que el score de las alertas iba
  // renormalizado sobre 8 señales de 9 — sistemáticamente distinto del publicado,
  // y podía disparar un cruce de banda que la web no mostraba (2026-08-21).
  // RiskGauge.jsx:199 ya llamaba con {market, rates, curve}; aquí faltaba.
  const [market, rates, curve] = await Promise.all([
    fetch(`${SITE}/api/market?live=1`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${SITE}/api/rates`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch(`${SITE}/api/curve`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);
  const spot = market?.usdmxnSpot ?? market?.usdmxn;
  if (spot == null) return Response.json({ error: "no spot" }, { status: 502 });

  const scoreInfo = computeRiskScore({ market, rates, curve });
  const score = scoreInfo?.score ?? null;
  const banda = score != null ? riskBand(score).key : null;
  const spotStr = Number(spot).toFixed(4);
  const sent = [];

  // ── 1. Cruce de banda del índice ───────────────────────────────────────────
  if (banda) {
    const prevBanda = await kvGet("banda");
    if (prevBanda && prevBanda !== banda) {
      const pros = await db.execute("SELECT contact, wa FROM pro WHERE status != 'off'");
      const text =
        `El índice Risk On cruzó de ${prevBanda} a ${banda} (score ${score}). ` +
        `USD/MXN ${spotStr}. Detalle: ${SITE}/indice`;
      for (const p of pros.rows) {
        const r = await dispatchAlert({
          contact: p.contact,
          wa: p.wa,
          subject: `⚡ Risk-On: cambio de tendencia → ${banda}`,
          text,
          spot: spotStr,
        });
        sent.push({ type: "banda", to: p.contact, ...r });
      }
    }
    if (prevBanda !== banda) await kvSet("banda", banda);
  }

  // ── 2. Niveles por cliente (one-shot) ──────────────────────────────────────
  const act = await db.execute(
    `SELECT a.id, a.contact, a.level, a.direction, p.wa
       FROM alerts a LEFT JOIN pro p ON p.contact = a.contact
      WHERE a.status = 'active'`
  );
  for (const a of act.rows) {
    const hit =
      (a.direction === "above" && spot >= a.level) ||
      (a.direction === "below" && spot <= a.level);
    if (!hit) continue;
    const dir = a.direction === "above" ? "alcanzó/superó" : "cayó a/perforó";
    const text =
      `USD/MXN ${dir} tu nivel de ${Number(a.level).toFixed(4)} — cotiza ${spotStr}. ` +
      `Re-arma o ajusta tus alertas: ${SITE}/alertas`;
    const r = await dispatchAlert({
      contact: a.contact,
      wa: a.wa,
      subject: `🎯 USD/MXN tocó tu nivel ${Number(a.level).toFixed(4)}`,
      text,
      spot: spotStr,
    });
    sent.push({ type: "nivel", to: a.contact, level: a.level, ...r });
    // Solo pasa a 'fired' si el envío SALIÓ por algún canal — si ambos
    // fallaron (transitorio), sigue 'active' y el próximo ciclo reintenta.
    if (r.ok) {
      await db.execute({
        sql: "UPDATE alerts SET status = 'fired', fired_at = datetime('now') WHERE id = ?",
        args: [a.id],
      });
    }
  }

  await kvSet("last_check", new Date().toISOString());
  return Response.json({
    ok: true,
    spot: spotStr,
    score,
    banda,
    whatsapp: waConfigured() ? "configured" : "fallback-email",
    checked: act.rows.length,
    sent,
  });
}
