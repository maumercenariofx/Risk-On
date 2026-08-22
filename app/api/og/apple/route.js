// app/api/og/apple/route.js
// apple-touch-icon: lo que iOS usa al "agregar a pantalla de inicio". No existía,
// así que Safari recortaba un screenshot de la página o caía al favicon
// escalado (auditoría 2026-08-21). Se genera del mismo dibujo que app/icon.svg,
// con la misma paleta real de la marca.
//
// iOS NO respeta el radio del icono (le aplica el suyo) y no soporta
// transparencia bien, así que el fondo va sólido y a sangre.
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
// force-dynamic: @vercel/og resuelve sus assets por import.meta.url y revienta
// al PRERENDERIZAR cuando la ruta del proyecto tiene espacios ("C:\Users\mauri\Risk On"
// → file:///…/Risk%20On/… y fileURLToPath tira Invalid URL). La OG de
// /archive/[slug] nunca lo sufrió porque ya se sirve on-demand. Aquí, además,
// la tarjeta depende del ledger, que cambia a diario: generarla por petición
// es lo correcto y el CDN la cachea igual.
export const dynamic = "force-dynamic";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0A0B",
        }}
      >
        <svg width="128" height="128" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="20" fill="none" stroke="#F5F5F2" strokeWidth="2.5" />
          <path d="M12 32 H52" stroke="#F5F5F2" strokeWidth="1.5" opacity="0.55" />
          <path d="M32 12 V52" stroke="#F5F5F2" strokeWidth="1.5" opacity="0.55" />
          <ellipse cx="32" cy="32" rx="20" ry="8" fill="none" stroke="#F5F5F2" strokeWidth="1.5" opacity="0.55" />
          <ellipse cx="32" cy="32" rx="8" ry="20" fill="none" stroke="#F5F5F2" strokeWidth="1.5" opacity="0.55" />
          <circle cx="46" cy="20" r="4" fill="#14A276" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
