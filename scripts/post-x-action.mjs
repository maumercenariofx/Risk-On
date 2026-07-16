// scripts/post-x-action.mjs
// Publica el post diario en X (@riskonlat) tras el envío del correo, como paso
// del workflow gen-daily. El texto se compone DETERMINÍSTICAMENTE desde el
// front-matter del view (cero llamadas a Claude, cero costo). Anti-duplicado
// con marcador sent/x-<slug>.json (mismo patrón fail-closed del correo, con
// consecuencia suave: ante "unknown" se salta el post del día, no se arriesga
// el doble). X_DRY_RUN=1 imprime el post sin publicar. Si faltan los secrets
// de X, sale en 0 con aviso (el paso es opcional hasta configurar la cuenta).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import matter from "gray-matter";
import { checkSentMarker, publishFileToGitHub } from "../lib/dailyView.js";
import { riskState } from "../lib/riskScore.js";

const TZ = "America/Mexico_City";
const slug = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const dryRun = process.env.X_DRY_RUN === "1";

const dow = new Date(`${slug}T12:00:00Z`).getUTCDay();
if (dow === 0 || dow === 6) {
  console.log(`[x] ${slug} es fin de semana — nada que publicar.`);
  process.exit(0);
}

const creds = {
  apiKey: process.env.X_API_KEY,
  apiSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
};
if (!dryRun && Object.values(creds).some((v) => !v)) {
  console.log("[x] secrets de X no configurados (X_API_KEY/SECRET, X_ACCESS_TOKEN/SECRET) — salto el post.");
  process.exit(0);
}

const file = path.join(process.cwd(), "content", `${slug}.md`);
if (!fs.existsSync(file)) {
  console.log(`[x] content/${slug}.md no existe (¿gen falló?) — nada que publicar.`);
  process.exit(0);
}
const { data: front } = matter(fs.readFileSync(file, "utf8"));

// Score del view hábil anterior (para la flecha ▲▼) — el checkout trae content/.
function prevScore() {
  const files = fs.readdirSync(path.join(process.cwd(), "content"))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f < `${slug}.md`)
    .sort();
  if (!files.length) return null;
  try {
    const prev = matter(fs.readFileSync(path.join(process.cwd(), "content", files[files.length - 1]), "utf8"));
    return Number(prev.data.score) || null;
  } catch { return null; }
}

// ── Composición (presupuesto 280 chars; el link cuenta 23 vía t.co) ─────────
const LINK_LEN = 23;
function weight(text) {
  // Aproximación del conteo de X: URLs = 23, el resto por code points
  // (emojis/CJK cuentan 2 en X — sobre-estimamos 2 por símbolo no-ASCII).
  return [...text.replace(/https?:\/\/\S+/g, "x".repeat(LINK_LEN))]
    .reduce((n, ch) => n + (ch.codePointAt(0) > 0x2000 ? 2 : 1), 0);
}

function compose() {
  const score = Number(front.score);
  const banda = riskState(score);
  const prev = prevScore();
  const arrow = prev == null || prev === score ? "" : score > prev ? ` ▲${prev}→${score}` : ` ▼${prev}→${score}`;
  const bias = { "pro-peso": "pro-peso", "pro-dolar": "pro-dólar", neutral: "neutral" }[front.postura_bias] ?? front.postura_bias;
  const cond = String(front.postura_condicion ?? "").replace(/\s+/g, " ").trim();
  const lvl = (v) => (v == null ? null : Number(v).toFixed(2));
  const link = `https://riskon.lat/archive/${slug}`;

  const header = `📊 Pre-Market ${score}/100 · ${banda}${arrow}`;
  const niveles = lvl(front.support) && lvl(front.resistance)
    ? `Soporte ${lvl(front.support)} · Resistencia ${lvl(front.resistance)}`
    : null;
  // La condición se muestra TAL CUAL (el redactor a veces la formula como
  // invalidación y a veces como flip — "vuelvo pro-peso si...": no prefijarla).
  const posturaLine = (c) => `🎯 Postura ${bias}${c ? ` · ${c}` : ""}`;
  const footer = `El view completo 👇\n${link}`;

  // Variantes de más completa a más corta hasta caber en 280.
  const variants = [
    [header, "", front.title_es, "", posturaLine(cond), niveles, "", footer],
    [header, "", front.title_es, "", posturaLine(cond), "", footer],
    [header, "", front.title_es, "", posturaLine(cond.length > 70 ? cond.slice(0, 67) + "…" : cond), "", footer],
    [header, "", front.hook_es, "", posturaLine(cond.length > 70 ? cond.slice(0, 67) + "…" : cond), "", footer],
    [header, "", front.hook_es, "", footer],
  ];
  for (const v of variants) {
    const text = v.filter((l) => l != null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (weight(text) <= 280) return text;
  }
  return `${header}\n${link}`;
}

// ── OAuth 1.0a (user context) para POST /2/tweets ────────────────────────────
// Con content-type application/json el body NO entra a la firma — solo los
// parámetros oauth_* y la URL (spec OAuth1; el endpoint no lleva query).
function oauth1Header(method, url) {
  const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const p = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const paramStr = Object.keys(p).sort().map((k) => `${enc(k)}=${enc(p[k])}`).join("&");
  const base = [method.toUpperCase(), enc(url), enc(paramStr)].join("&");
  const key = `${enc(creds.apiSecret)}&${enc(creds.accessSecret)}`;
  p.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(p).sort().map((k) => `${enc(k)}="${enc(p[k])}"`).join(", ");
}

const text = compose();
console.log(`[x] post compuesto (${weight(text)}/280):\n---\n${text}\n---`);

if (dryRun) {
  console.log("[x] X_DRY_RUN=1 — no publico.");
  process.exit(0);
}

// Anti-duplicado (re-runs del workflow). "unknown" = salto conservador:
// perder el post de un día < arriesgar un duplicado en el timeline.
const marker = await checkSentMarker(`x-${slug}`);
if (marker.status === "sent") {
  console.log("[x] sent/x-" + slug + ".json existe — ya se publicó hoy, salgo.");
  process.exit(0);
}
if (marker.status === "unknown") {
  console.log(`[x] marcador inverificable (${marker.error}) — salto el post por precaución.`);
  process.exit(0);
}

const url = "https://api.twitter.com/2/tweets";
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: oauth1Header("POST", url), "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`[x] X respondió ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  process.exit(1);
}
const id = body?.data?.id;
console.log(`[x] publicado: https://x.com/riskonlat/status/${id}`);

const mk = await publishFileToGitHub(
  `sent/x-${slug}.json`,
  JSON.stringify({ slug, tweetId: id, at: new Date().toISOString() }),
  `auto: marcador post X ${slug}`
);
if (!mk.ok) console.error(`[x] OJO: el post salió pero el marcador falló (${mk.error}) — un re-run hoy podría duplicar.`);
