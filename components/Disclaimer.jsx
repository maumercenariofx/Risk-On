export default function Disclaimer() {
  return (
    <footer style={{
      marginTop: 64,
      padding: "20px 22px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid #2A2A2E",
      borderRadius: 10,
    }}>
      <p style={{
        fontSize: 11,
        lineHeight: 1.9,
        color: "#8A8A94",
        letterSpacing: 0.2,
        margin: 0,
      }}>
        <strong style={{
          color: "#B0B0BA",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontSize: 9,
          display: "block",
          marginBottom: 8,
        }}>
          Aviso Legal
        </strong>
        La información, análisis y opiniones publicados en este sitio tienen fines exclusivamente
        informativos y educativos. Los contenidos son de autoría de{" "}
        <strong style={{ color: "#C0C0C8" }}>Mauricio Mercenario</strong> y no constituyen
        asesoría financiera, recomendación de inversión, oferta de valores ni consejo legal de
        ningún tipo. Los mercados financieros conllevan riesgos inherentes; los resultados
        pasados no garantizan rendimientos futuros. Risk On, Mauricio Mercenario y sus
        colaboradores no asumen responsabilidad alguna por pérdidas, daños o decisiones
        financieras tomadas con base en el contenido aquí publicado. Se recomienda consultar
        a un asesor financiero certificado antes de tomar cualquier decisión de inversión.
      </p>
    </footer>
  );
}
