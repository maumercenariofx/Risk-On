// app/archive/[slug]/opengraph-image.jsx
// OG card dinámica por view: score del día + banda + titular, estética dark terminal.
// Next la inyecta automáticamente como og:image de /archive/<slug>.
import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { riskBand } from "../../../lib/riskScore";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Risk On — pre-market view";

function readMeta(slug) {
  const file = path.join(process.cwd(), "content", `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return matter(fs.readFileSync(file, "utf8")).data;
}

export default function OgImage({ params }) {
  const meta = readMeta(params.slug) ?? {};
  const score = Number(meta.score ?? 50);
  const band = riskBand(score);
  const title = String(meta.title_es ?? "El Pre-Market de hoy");
  const dateFmt = new Date(`${params.slug}T12:00:00Z`).toLocaleDateString("es-MX", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0B0F16",
          backgroundImage:
            "radial-gradient(circle at 85% 20%, rgba(25,195,155,0.14), transparent 55%)",
          padding: "56px 64px",
          fontFamily: "sans-serif",
          color: "#E8EDF4",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 6, fontWeight: 700 }}>
            RISK ON
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#8B96A5" }}>{dateFmt}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                fontSize: 148,
                fontWeight: 700,
                lineHeight: 1,
                color: band.color,
              }}
            >
              {score}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                padding: "8px 22px",
                borderRadius: 999,
                border: `2px solid ${band.color}`,
                color: band.color,
                fontSize: 26,
                letterSpacing: 3,
              }}
            >
              {band.key}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              fontSize: title.length > 70 ? 40 : 48,
              lineHeight: 1.25,
              fontWeight: 600,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 24, color: "#8B96A5" }}>
            Índice Risk On · inteligencia macro pre-market
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#19C39B", fontWeight: 600 }}>
            riskon.lat
          </div>
        </div>
      </div>
    ),
    size
  );
}
