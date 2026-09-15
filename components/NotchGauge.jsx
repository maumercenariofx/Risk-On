// components/NotchGauge.jsx
// Medidor de muescas 0-100: `arc` (SVG, 270°) o `linear` (flex, se adapta al
// ancho sin deformar las muescas). Cada muesca toma su color de `colorAt(valor)`
// y las apagadas quedan tenues del mismo color, así que en el hero se leen los
// cortes de banda que el gradiente continuo escondía (2026-09-15).
//
// Geometría de muesca y encendido escalonado adaptados de bklit-ui
// (packages/ui/src/charts/gauge.tsx, notch-gauge-shared.ts).
// MIT License, Copyright (c) 2026 uixmat — https://github.com/bklit/bklit-ui
// Sin Motion: la animación vive en .notch de globals.css y respeta reduced-motion.

const OFF_OPACITY = 0.2;
const OFF_ALPHA_HEX = "33"; // 0.2 en hex; los colores de banda son #RRGGBB

function notchPath(p, r) {
  const { x1, y1, x2, y2, x3, y3, x4, y4 } = p;
  const lerp = (a, b, t) => a + (b - a) * t;
  const d = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const e = [d(x1, y1, x2, y2), d(x2, y2, x3, y3), d(x3, y3, x4, y4), d(x4, y4, x1, y1)];
  const cr = Math.min(r, ...e.map((v) => v * 0.49));
  const [t1, t2, t3, t4] = e.map((v) => Math.min(cr / v, 0.49));
  const pt = (ax, ay, bx, by, t) => `${lerp(ax, bx, t).toFixed(2)} ${lerp(ay, by, t).toFixed(2)}`;
  return `M ${pt(x1, y1, x4, y4, t4)} Q ${x1.toFixed(2)} ${y1.toFixed(2)} ${pt(x1, y1, x2, y2, t1)}`
    + ` L ${pt(x2, y2, x1, y1, t1)} Q ${x2.toFixed(2)} ${y2.toFixed(2)} ${pt(x2, y2, x3, y3, t2)}`
    + ` L ${pt(x3, y3, x2, y2, t2)} Q ${x3.toFixed(2)} ${y3.toFixed(2)} ${pt(x3, y3, x4, y4, t3)}`
    + ` L ${pt(x4, y4, x3, y3, t3)} Q ${x4.toFixed(2)} ${y4.toFixed(2)} ${pt(x4, y4, x1, y1, t4)} Z`;
}

function ArcGauge({ value, notches, colorAt, size, children }) {
  const c = size / 2;
  const outer = size * 0.46;
  const inner = size * 0.35;
  const start = 135, sweep = 270, gapShare = 0.25;
  const slot = (sweep * (1 - gapShare)) / notches;
  const gap = (sweep * gapShare) / (notches - 1);
  const active = Math.round((value / 100) * notches);
  // El arco abre por abajo: se recorta la altura al punto más bajo de sus puntas.
  const height = Math.ceil(c + Math.sin((start * Math.PI) / 180) * outer + 2);

  const paths = Array.from({ length: notches }, (_, i) => {
    const rad = ((start + i * (slot + gap) + slot / 2) * Math.PI) / 180;
    const half = ((slot * 0.8) * Math.PI) / 360;
    const pts = {
      x1: c + Math.cos(rad - half) * outer, y1: c + Math.sin(rad - half) * outer,
      x2: c + Math.cos(rad + half) * outer, y2: c + Math.sin(rad + half) * outer,
      x3: c + Math.cos(rad + half) * inner, y3: c + Math.sin(rad + half) * inner,
      x4: c + Math.cos(rad - half) * inner, y4: c + Math.sin(rad - half) * inner,
    };
    return { d: notchPath(pts, 1.5), color: colorAt(((i + 0.5) / notches) * 100) };
  });

  return (
    <div style={{ position: "relative", width: size, height, flexShrink: 0 }}>
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`} aria-hidden style={{ display: "block" }}>
        {paths.map((p, i) => (
          <path key={`off-${i}`} className="notch" d={p.d} fill={p.color} fillOpacity={OFF_OPACITY} style={{ "--i": i }} />
        ))}
        {paths.slice(0, active).map((p, i) => (
          <path key={`on-${i}`} className="notch notch-on" d={p.d} fill={p.color} style={{ "--i": i }} />
        ))}
      </svg>
      {children && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, height: size,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function LinearGauge({ value, notches, colorAt }) {
  const active = Math.round((value / 100) * notches);
  return (
    <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 2, height: 16 }}>
      {Array.from({ length: notches }, (_, i) => {
        const on = i < active;
        const tip = on && i === active - 1;
        const color = colorAt(((i + 0.5) / notches) * 100);
        return (
          <div key={i} style={{ flex: 1, height: tip ? 16 : 10, position: "relative" }}>
            {/* Tenue por alfa en el color, no por `opacity`: la animación
                notchIn termina en opacity 1 y pisaría el valor inline. */}
            <div className="notch" style={{
              "--i": i, position: "absolute", inset: 0, borderRadius: 2,
              background: `${color}${OFF_ALPHA_HEX}`,
            }} />
            {on && (
              <div className="notch notch-on" style={{
                "--i": i, position: "absolute", inset: 0, borderRadius: 2, background: color,
                boxShadow: tip ? `0 0 10px ${color}` : "none",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NotchGauge({
  value, variant = "linear", notches = variant === "arc" ? 40 : 50,
  colorAt, size = 132, label, children,
}) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
      {variant === "arc"
        ? <ArcGauge value={v} notches={notches} colorAt={colorAt} size={size}>{children}</ArcGauge>
        : <LinearGauge value={v} notches={notches} colorAt={colorAt} />}
    </div>
  );
}
