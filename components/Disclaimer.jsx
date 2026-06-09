export default function Disclaimer() {
  return (
    <footer style={{
      marginTop: 64,
      padding: "32px 22px 24px",
      borderTop: "1px solid #1E1E20",
    }}>
      {/* Brand */}
      <div style={{
        fontFamily: "var(--font-serif)",
        fontSize: 22,
        fontWeight: 500,
        color: "#F5F5F2",
        marginBottom: 4,
      }}>
        Risk On
      </div>
      <div style={{
        fontSize: 12,
        color: "#4A4A50",
        letterSpacing: 0.3,
        marginBottom: 20,
      }}>
        FX y mercados explicados para todos
      </div>

      {/* Legal */}
      <p style={{
        fontSize: 11,
        lineHeight: 1.85,
        color: "#3A3A40",
        letterSpacing: 0.2,
        margin: "0 0 20px",
        maxWidth: 560,
      }}>
        Contenido informativo y educativo. Opiniones propias, no constituyen asesoría de
        inversión ni recomendación de operar. Datos de mercado con posible retraso. Operar
        con divisas y derivados implica riesgo.
      </p>

      {/* Copyright */}
      <div style={{
        fontSize: 10,
        color: "#2E2E32",
        letterSpacing: 1.5,
        textTransform: "uppercase",
      }}>
        © 2026 Risk On · Take risks or stay average
      </div>
    </footer>
  );
}
