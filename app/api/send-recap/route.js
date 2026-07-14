// app/api/send-recap/route.js
// Envía el RECAP SEMANAL (viernes por la tarde) a la lista completa. El content
// lo genera GitHub Actions (content/recaps/<viernes>.md); aquí solo se lee, se
// arma el correo y se envía — cabe holgado en los 60s de Vercel. Guarda
// anti-doble-envío FAIL-CLOSED con marcador sent/recap-<slug>.json (misma
// mecánica del diario). Pruebas: ?only=correo (no marca), ?slug=YYYY-MM-DD.
import { Resend } from "resend";
import { remark } from "remark";
import html from "remark-html";
import { checkSentMarker, publishFileToGitHub, REPO } from "../../../lib/dailyView";
import { stripBold, boldToHtml } from "../../../lib/mdInline";
import { alertAdmin } from "../../../lib/alertAdmin";
import { clean, getSubscribers } from "../../../lib/subscribers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://riskon.lat";
const UNSUB = "__UNSUB_URL__";
const C = {
  bg: "#FAF8F3", card: "#FFFFFF", border: "#E8E3D9", masthead: "#14141A",
  text: "#1A1A1A", muted: "#6B6B6B", faint: "#9A9488", bone: "#F5F1E8",
};

// Lee el recap: fs (mismo deploy) → contents API con token → raw (último).
async function readRecap(slug) {
  try {
    const fs = await import("node:fs");
    const p = `${process.cwd()}/content/recaps/${slug}.md`;
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  } catch {}
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/contents/content/recaps/${slug}.md?ref=main`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "User-Agent": "riskon-daily-cron" },
          cache: "no-store",
        }
      );
      if (res.ok) return await res.text();
    } catch {}
  }
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/content/recaps/${slug}.md`, { cache: "no-store" });
    if (res.ok) return await res.text();
  } catch {}
  return null;
}

async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const only = url.searchParams.get("only");
  const slug = url.searchParams.get("slug")
    ?? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  const markerSlug = `recap-${slug}`;

  // Guarda fail-closed (idéntica al diario): solo un 404 explícito autoriza.
  if (!only) {
    const marker = await checkSentMarker(markerSlug);
    if (marker.status === "sent") {
      return Response.json({ ok: true, skipped: "recap already sent", slug, marker });
    }
    if (marker.status === "unknown") {
      await alertAdmin(`guarda del recap no verificable (${slug})`, { slug, marker });
      return Response.json({ ok: false, skipped: "marker unverifiable", slug, marker }, { status: 503 });
    }
  }

  const raw = await readRecap(slug);
  if (!raw) {
    if (!only) await alertAdmin(`recap ${slug} no encontrado al enviar`, { slug });
    return Response.json({ ok: false, error: `content/recaps/${slug}.md no existe` }, { status: 503 });
  }
  const matter = (await import("gray-matter")).default;
  const { data: front, content: bodyEs } = matter(raw);

  // Destinatarios (misma lógica del diario, con ?only= para pruebas).
  let recipients = await getSubscribers();
  if (only) {
    const wanted = only.split(",").map((s) => clean(s)).filter(Boolean);
    recipients = wanted.map((e) => recipients.find((s) => s.email === e) ?? { email: e });
  }
  if (!recipients.length) return Response.json({ ok: false, error: "sin destinatarios" }, { status: 500 });

  const anyEn = recipients.some((s) => s.lang === "en");
  const toHtml = async (md) => (await remark().use(html).process(md)).toString();

  const buildEmail = async (lang) => {
    const en = lang === "en";
    const pick = (esV, enV) => (en && String(enV ?? "").trim() ? enV : esV);
    const title = stripBold(pick(front.title_es, front.title_en));
    const body = pick(bodyEs, front.body_en);
    const bodyHtml = (await toHtml(body))
      .replace(/<h3>/g, `<h3 style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:${C.text};margin:26px 0 10px">`)
      .replace(/<p>/g, `<p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.7;color:#3a3a3a;margin:0 0 14px">`)
      .replace(/<li>/g, `<li style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.65;color:#3a3a3a;margin-bottom:8px">`);
    const dateLongL = new Date(`${slug}T12:00:00Z`).toLocaleDateString(en ? "en-US" : "es-MX", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
    const L = en
      ? { tag: "WEEKLY RECAP", cta: "See the public scoreboard →", unsub: "Unsubscribe" }
      : { tag: "RECAP SEMANAL", cta: "Ver el marcador público →", unsub: "Darse de baja" };

    const htmlDoc = `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${title}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="background:${C.masthead};border-radius:8px 8px 0 0;padding:22px 32px">
        <div style="font-family:Georgia,serif;font-size:24px;color:${C.bone};font-weight:700">Risk On</div>
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:3px;color:#8A8A8E;margin-top:4px">${L.tag} · ${dateLongL.toUpperCase()}</div>
      </td></tr>
      <tr><td style="background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 8px 8px;padding:32px">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25;color:${C.text};font-weight:700;margin-bottom:20px">${title}</div>
        ${bodyHtml}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td style="background:${C.masthead};border-radius:4px">
          <a href="${SITE}/indice" style="display:inline-block;padding:11px 22px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:${C.bone};text-decoration:none">${L.cta}</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:18px 8px;text-align:center">
        <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:${C.faint}">riskon.lat · <a href="${UNSUB}" style="color:${C.faint}">${L.unsub}</a></span>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    const text = [
      `RISK ON · ${L.tag} · ${dateLongL}`, "", title, "",
      stripBold(body).replace(/^###\s*/gm, "— "), "",
      `${L.cta.replace(" →", "")}: ${SITE}/indice`, "", `${L.unsub}: ${UNSUB}`,
    ].join("\n");

    const hook = stripBold(pick(front.hook_es, front.hook_en) ?? title).slice(0, 60);
    return { html: htmlDoc, text, subject: `Recap semanal · ${hook}` };
  };

  const vEs = await buildEmail("es");
  const vEn = anyEn ? await buildEmail("en") : null;
  const from = '"Mauricio | Risk-On" <view@riskon.lat>';
  const payloads = recipients.map((sub) => {
    const v = sub.lang === "en" && vEn ? vEn : vEs;
    const unsubUrl = `${SITE}/api/unsubscribe?email=${encodeURIComponent(sub.email)}`;
    return {
      from, to: sub.email, subject: v.subject,
      html: v.html.split(UNSUB).join(unsubUrl),
      text: v.text.split(UNSUB).join(unsubUrl),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>, <mailto:view@riskon.lat?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  const resendClient = new Resend(process.env.RESEND_API_KEY);
  let sent;
  try {
    const { data, error } = await resendClient.batch.send(payloads);
    sent = { ok: !error, count: data?.data?.length ?? (error ? 0 : recipients.length), error: error?.message };
  } catch (e) {
    sent = { ok: false, error: String(e?.message ?? e) };
  }

  if (sent.ok && !only) {
    const marker = JSON.stringify({ slug: markerSlug, sentAt: new Date().toISOString(), count: recipients.length }) + "\n";
    const mk = await publishFileToGitHub(`sent/${markerSlug}.json`, marker, `auto: sent marker ${markerSlug}`);
    sent.marker = mk.ok ? "ok" : mk.error;
  }
  if (!only && !sent.ok) await alertAdmin(`envío del RECAP falló (${slug})`, { slug, sent });

  return Response.json({ ok: sent.ok, slug, recipients: recipients.length, sent });
}

export { handler as GET, handler as POST };
