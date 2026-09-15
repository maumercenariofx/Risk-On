// components/ChartUnavailable.jsx
// Estado "sin datos" para gráficas cuya fuente falló. Mismo texto que el de
// MarketsClient: preferimos un hueco explicado a un número no verificado, y a un
// Skeleton que gira para siempre (YieldCurveChart y CorrelationScatter, 2026-09-15).
import { T } from "./Lang";

export default function ChartUnavailable({ height = 160 }) {
  return (
    <div
      role="status"
      style={{
        height, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 8, padding: "0 24px", textAlign: "center",
      }}
    >
      <span style={{
        color: "#8A8A8E", fontSize: 11, letterSpacing: 2.5,
        textTransform: "uppercase", fontFamily: "var(--font-mono)",
      }}>
        <T es="sin datos" en="no data" />
      </span>
      <span style={{ color: "#8A8A8E", fontSize: 12, lineHeight: 1.6, maxWidth: 320 }}>
        <T
          es="La fuente no respondió. Preferimos no mostrar nada antes que mostrar un número que no verificamos."
          en="The source didn't respond. We'd rather show nothing than a number we haven't verified."
        />
      </span>
    </div>
  );
}
