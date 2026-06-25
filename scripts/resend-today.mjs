// Resend today's pre-market email using the already-published content.
// Run with: vercel env run -- node scripts/resend-today.mjs
import https from "https";

const secret = process.env.CRON_SECRET;
if (!secret) { console.error("CRON_SECRET not set"); process.exit(1); }

const url = "https://riskon.lat/api/send-daily?resend=1";
console.log("Calling:", url);

const req = https.request(url, {
  method: "GET",
  headers: { Authorization: `Bearer ${secret}` },
}, (res) => {
  let body = "";
  res.on("data", (c) => body += c);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    try { console.log(JSON.stringify(JSON.parse(body), null, 2)); }
    catch { console.log(body); }
  });
});
req.on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
req.end();
