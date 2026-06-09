export default function Disclaimer() {
  return (
    <footer style={{
      marginTop: 64,
      paddingTop: 24,
      borderTop: "1px solid #1A1A1C",
    }}>
      <p style={{
        fontSize: 10,
        lineHeight: 1.9,
        color: "#666670",
        letterSpacing: 0.3,
      }}>
        <strong style={{ color: "#888892", letterSpacing: 1, textTransform: "uppercase", fontSize: 9 }}>
          Aviso Legal &mdash;
        </strong>{" "}
        La información, análisis y opiniones publicados en este sitio tienen fines exclusivamente informativos
        y educativos. Los contenidos son de autoría de Mauricio Mercenario y no constituyen asesoría financiera,
        recomendación de inversión, oferta de valores ni consejo legal de ningún tipo. Los mercados financieros
        conllevan riesgos inherentes; los resultados pasados no garantizan rendimientos futuros.
        Risk On, Mauricio Mercenario y sus colaboradores no asumen responsabilidad alguna por pérdidas,
        daños o decisiones financieras tomadas con base en el contenido aquí publicado.
        Se recomienda consultar a un asesor financiero certificado antes de tomar cualquier decisión de inversión.
      </p>
    </footer>
  );
}
