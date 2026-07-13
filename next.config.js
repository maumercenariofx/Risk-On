/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Headers de seguridad (auditoría 2026-07-13: solo existía HSTS de Vercel).
  // OJO: Permissions-Policy NO bloquea gyroscope/accelerometer — el globo del
  // hero los usa en móvil (DeviceOrientation). CSP se omitió a propósito:
  // Next inyecta scripts inline (runtime, JSON-LD, html.io) y una CSP con
  // 'unsafe-inline' no aporta; una estricta con nonces es proyecto aparte.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
