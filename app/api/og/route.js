// app/api/og/route.js
// OG card de la PORTADA. Antes riskon.lat se compartía como un logo cuadrado
// (twitter:card "summary"), así que cada vez que alguien pegaba el link
// compartía un logotipo en vez del argumento del producto (auditoría
// 2026-08-21).
//
// Lo que va aquí es el marcador público: es lo único del sitio que un
// competidor no puede copiar, porque copiarlo exige haber publicado posturas
// falsables y haberlas calificado. Se lee del libro mayor congelado
// (public/data/postura-ledger.json), que el bot actualiza a diario, así que la
// tarjeta se refresca sola con cada redeploy.
import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const size = { width: 1200, height: 630 };
// force-dynamic: @vercel/og resuelve sus assets por import.meta.url y revienta
// al PRERENDERIZAR cuando la ruta del proyecto tiene espacios ("C:\Users\mauri\Risk On"
// → file:///…/Risk%20On/… y fileURLToPath tira Invalid URL). La OG de
// /archive/[slug] nunca lo sufrió porque ya se sirve on-demand. Aquí, además,
// la tarjeta depende del ledger, que cambia a diario: generarla por petición
// es lo correcto y el CDN la cachea igual.
export const dynamic = "force-dynamic";

function record() {
  try {
    const p = path.join(process.cwd(), "public", "data", "postura-ledger.json");
    const entries = Object.values(JSON.parse(fs.readFileSync(p, "utf8")).entries ?? {});
    const resolved = entries.filter((e) => e.verdict != null);
    if (!resolved.length) return null;
    return { hits: resolved.filter((e) => e.verdict).length, n: resolved.length };
  } catch {
    return null; // sin ledger la tarjeta sale igual, solo sin el número
  }
}

export function GET() {
  const r = record();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0A0A0B",
          backgroundImage:
            "radial-gradient(circle at 82% 22%, rgba(20,162,118,0.16), transparent 55%)",
          padding: "56px 64px",
          fontFamily: "sans-serif",
          color: "#F5F5F2",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 6, fontWeight: 700 }}>
            RISK ON
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#8A8A8E" }}>riskon.lat</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {r ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <div style={{ display: "flex", fontSize: 132, fontWeight: 700, lineHeight: 1, color: "#14A276" }}>
                {r.hits}/{r.n}
              </div>
              <div style={{ display: "flex", fontSize: 30, color: "#8A8A8E" }}>
                posturas acertadas
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>
              El Pre-Market
            </div>
          )}
          <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, maxWidth: 900 }}>
            Cada mañana publicamos una postura sobre el peso con su condición de
            invalidación. A los 5 días hábiles se califica en público.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 24, color: "#8A8A8E" }}>
            Antes de las 7:00 CDMX · lunes a viernes
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#8A8A8E" }}>
            Sin ediciones retroactivas
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
