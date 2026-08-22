// lib/chartHelpers.js
// Shared Chart.js plugins and style tokens for the Robinhood-inspired aesthetic.

export const GREEN = "#00C805";
export const RED   = "#FF5000";

export function semanticColor(isUp) {
  return isUp ? GREEN : RED;
}

// Glow bloom: applies canvas shadow to a specific dataset before it draws
export function makeGlowPlugin(color, datasetIndex = 1, blur = 14) {
  return {
    id: `lineGlow_${datasetIndex}`,
    beforeDatasetDraw(chart, args) {
      if (args.index !== datasetIndex) return;
      chart.ctx.shadowColor = color;
      chart.ctx.shadowBlur  = blur;
    },
    afterDatasetDraw(chart, args) {
      if (args.index !== datasetIndex) return;
      chart.ctx.shadowColor = "transparent";
      chart.ctx.shadowBlur  = 0;
    },
  };
}

// Glow bloom that reads color from each dataset's borderColor (for multi-line charts)
// datasetIndex 0 is always the fill-only dataset and should be skipped
export const multiGlowPlugin = {
  id: "multiGlow",
  beforeDatasetDraw(chart, args) {
    if (args.index === 0) return;
    const ds    = chart.data.datasets[args.index];
    const color = ds?.borderColor;
    if (!color || color === "transparent") return;
    const isLast = args.index === chart.data.datasets.length - 1;
    chart.ctx.shadowColor = color;
    chart.ctx.shadowBlur  = isLast ? 14 : 5;
  },
  afterDatasetDraw(chart, args) {
    if (args.index === 0) return;
    chart.ctx.shadowColor = "transparent";
    chart.ctx.shadowBlur  = 0;
  },
};

// Glowing terminal dot at the last point of a dataset
export function makeTerminalDotPlugin(color, datasetIndex = 1) {
  return {
    id: "terminalDot",
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(datasetIndex);
      const pts  = meta?.data;
      if (!pts?.length) return;
      const tip = pts[pts.length - 1];
      const { ctx } = chart;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur  = 18;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.restore();
    },
  };
}

// Terminal dot that always targets the last dataset (useful for portfolio charts)
export const lastDatasetDotPlugin = {
  id: "terminalDot",
  afterDatasetsDraw(chart) {
    const lastIdx = chart.data.datasets.length - 1;
    const meta    = chart.getDatasetMeta(lastIdx);
    const pts     = meta?.data;
    if (!pts?.length) return;
    const tip   = pts[pts.length - 1];
    const color = chart.data.datasets[lastIdx]?.borderColor ?? GREEN;
    const { ctx } = chart;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();
  },
};

// Dashed vertical crosshair on hover
export const crosshairPlugin = {
  id: "crosshair",
  afterDraw(chart) {
    if (!chart.tooltip?._active?.length) return;
    const { ctx } = chart;
    const x = chart.tooltip._active[0].element.x;
    const { top, bottom } = chart.scales.y;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top); ctx.lineTo(x, bottom);
    ctx.lineWidth   = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.restore();
  },
};

// Vertical gradient fill factory (for backgroundColor callbacks)
export function makeGradientFn(color) {
  return (context) => {
    const area = context.chart.chartArea;
    if (!area) return "transparent";
    const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0,   color + "38");
    g.addColorStop(0.6, color + "0C");
    g.addColorStop(1,   color + "00");
    return g;
  };
}

// Shared scale defaults
export const xScaleDefaults = (maxTicksLimit = 7) => ({
  ticks:  { color: "#8A8A8E", font: { size: 10 }, maxTicksLimit, maxRotation: 0 },
  grid:   { display: false },
  border: { display: false },
});

export const yScaleDefaults = (callback) => ({
  ticks:  { color: "#8A8A8E", font: { size: 10, family: "var(--font-mono)" }, callback, maxTicksLimit: 5 },
  grid:   { color: "rgba(255,255,255,0.025)" },
  border: { display: false },
});

// Shared tooltip defaults
export const tooltipDefaults = {
  backgroundColor:  "rgba(10,10,12,0.92)",
  borderColor:      "rgba(255,255,255,0.08)",
  borderWidth:      1,
  cornerRadius:     10,
  titleColor:       "#6B7280",
  bodyColor:        "#F5F5F2",
  titleFont:        { size: 11 },
  padding:          12,
};

// Animación "draw-on": la línea se dibuja de izquierda a derecha punto por
// punto (patrón oficial de Chart.js para progressive line). Devuelve el objeto
// `animation` para options; pasar `false` si el usuario pide reduced-motion.
export function progressiveLine(pointCount, totalMs = 900) {
  const per = totalMs / Math.max(pointCount, 1);
  const delay = (ctx) => {
    if (ctx.type !== "data" || ctx.mode !== "default" || ctx.dropped) return 0;
    ctx.dropped = true;
    return ctx.index * per;
  };
  return {
    x: { type: "number", easing: "linear", duration: per, from: NaN, delay },
    y: { type: "number", easing: "linear", duration: per, from: "previousY", delay },
  };
}

// Card container style
export function cardStyle(isUp = null) {
  return {
    background:           "rgba(4,4,5,0.80)",
    backdropFilter:       "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border:               isUp === null
      ? "1px solid rgba(255,255,255,0.07)"
      : `1px solid ${isUp ? "rgba(0,200,5,0.15)" : "rgba(255,80,0,0.15)"}`,
    borderRadius:         20,
  };
}

// Section label style
export const sectionLabel = {
  fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase",
  color: "#8A8A8E", fontFamily: "var(--font-mono)",
};
