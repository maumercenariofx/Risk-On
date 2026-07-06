"use client";
// components/TrackRecord.jsx
// Track record público del Índice Risk On: histórico del score diario (un punto
// por view publicado) + USD/MXN del mismo período en panel SEPARADO (nunca doble
// eje). Cada punto enlaza a su view en /archive/<slug>.
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import { useCountUp } from "../lib/useCountUp";
import { BANDS, riskBand } from "../lib/riskScore";
import Skeleton from "./Skeleton";
import SourceTag from "./SourceTag";
import {
  crosshairPlugin, makeGlowPlugin, makeTerminalDotPlugin, makeGradientFn,
  semanticColor, tooltipDefaults, xScaleDefaults, yScaleDefaults,
  cardStyle, sectionLabel, progressiveLine,
} from "../lib/chartHelpers";

// Draw-on solo si el sistema no pide reduced-motion.
const lineAnim = (count) =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
    ? false
    : progressiveLine(count);

// Líneas punteadas en los cortes de banda (29/48/72) con etiqueta discreta.
const bandLinesPlugin = {
  id: "bandLines",
  afterDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    ctx.save();
    BANDS.slice(0, 3).forEach((b) => {
      const y = scales.y.getPixelForValue(b.max);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `${b.color}30`;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "9px var(--font-mono, monospace)";
      ctx.fillStyle = `${b.color}80`;
      ctx.fillText(String(b.max), chartArea.left + 4, y - 4);
    });
    ctx.restore();
  },
};

function fmtDate(slug, lang) {
  return new Date(`${slug}T12:00:00Z`).toLocaleDateString(
    lang === "en" ? "en-US" : "es-MX",
    { day: "numeric", month: "short", timeZone: "UTC" }
  );
}

// Número que cuenta de 0 a su valor al entrar al viewport.
function CountNumber({ value, style }) {
  const [display, ref] = useCountUp(value);
  return <span ref={ref} style={style}>{display}</span>;
}

function BandChip({ score }) {
  const b = riskBand(score);
  return (
    <span style={{
      fontSize: 9, letterSpacing: 2, fontFamily: "var(--font-mono)",
      color: b.color, border: `1px solid ${b.color}44`,
      borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
    }}>
      {b.key}
    </span>
  );
}

// ── Panel 1: histórico del score ─────────────────────────────────────────────
function ScoreHistoryChart({ points }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const { lang } = useLang();

  useEffect(() => {
    if (!points?.length) return;
    let cancelled = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();

      const color = riskBand(points[points.length - 1].score).color;
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        plugins: [crosshairPlugin, bandLinesPlugin, makeGlowPlugin(color, 0, 12), makeTerminalDotPlugin(color, 0)],
        data: {
          labels: points.map((p) => fmtDate(p.slug, lang)),
          datasets: [{
            data:                      points.map((p) => p.score),
            borderColor:               color,
            borderWidth:               2,
            backgroundColor:           makeGradientFn(color),
            fill:                      true,
            tension:                   0.3,
            pointRadius:               0,
            pointHitRadius:            12,
            pointHoverRadius:          4,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor:     "#000",
            pointHoverBorderWidth:     2,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          animation:           lineAnim(points.length),
          interaction:         { intersect: false, mode: "index" },
          onClick: (_e, els) => {
            const i = els?.[0]?.index;
            if (i != null) window.location.href = `/archive/${points[i].slug}`;
          },
          onHover: (e, els) => { e.native.target.style.cursor = els?.length ? "pointer" : "default"; },
          plugins: {
            legend:  { display: false },
            tooltip: {
              ...tooltipDefaults,
              callbacks: {
                title: (items) => items[0].label,
                label: (c) => {
                  const p = points[c.dataIndex];
                  return ` ${p.score} · ${riskBand(p.score).key}`;
                },
                footer: (items) => {
                  const p = points[items[0].dataIndex];
                  const t = (lang === "en" ? p.title_en : p.title_es) ?? "";
                  return t.length > 64 ? t.slice(0, 61) + "…" : t;
                },
              },
              footerColor: "#9CA3AF",
              footerFont:  { size: 10, weight: "normal" },
            },
          },
          scales: {
            x: xScaleDefaults(Math.min(points.length, 8)),
            y: { ...yScaleDefaults((v) => v), min: 0, max: 100, position: "right" },
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); };
  }, [points, lang]);

  return (
    <div style={{ position: "relative", height: 220 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── Panel 2: USD/MXN del mismo período (panel separado, jamás doble eje) ─────
function UsdMxnChart({ range }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [data, setData] = useState(null);
  const [asOf, setAsOf] = useState(null); // momento real de la carga (veracidad)

  useEffect(() => {
    fetch(`/api/history?range=${range}&symbol=USDMXN`)
      .then((r) => r.json())
      .then((d) => { setData(d); setAsOf(new Date().toISOString()); })
      .catch(() => {});
  }, [range]);

  useEffect(() => {
    if (!data?.prices?.length) return;
    let cancelled = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();

      const chg   = data.prices[data.prices.length - 1] - data.prices[0];
      const color = semanticColor(chg < 0); // baja USD/MXN = peso fuerte = verde
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        plugins: [crosshairPlugin, makeGlowPlugin(color, 0, 10), makeTerminalDotPlugin(color, 0)],
        data: {
          labels: data.labels,
          datasets: [{
            data:                      data.prices,
            borderColor:               color,
            borderWidth:               2,
            backgroundColor:           makeGradientFn(color),
            fill:                      true,
            tension:                   0.3,
            pointRadius:               0,
            pointHoverRadius:          4,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor:     "#000",
            pointHoverBorderWidth:     2,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          animation:           lineAnim(data.prices.length),
          interaction:         { intersect: false, mode: "index" },
          plugins: {
            legend:  { display: false },
            tooltip: {
              ...tooltipDefaults,
              callbacks: {
                title: (items) => items[0].label,
                label: (c)     => ` ${c.parsed.y.toFixed(4)}`,
              },
            },
          },
          scales: {
            x: xScaleDefaults(8),
            y: { ...yScaleDefaults((v) => v.toFixed(2)), position: "right" },
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); };
  }, [data]);

  if (!data?.prices?.length) return <Skeleton height={160} />;
  return (
    <>
      <div style={{ position: "relative", height: 160 }}>
        <canvas ref={canvasRef} />
      </div>
      <SourceTag source="Yahoo Finance" asOf={asOf} style={{ marginTop: 8 }} />
    </>
  );
}

export default function TrackRecord({ points }) {
  const { lang } = useLang();
  if (!points?.length) return null;

  const last  = points[points.length - 1];
  const avg   = Math.round(points.reduce((s, p) => s + p.score, 0) / points.length);
  const min   = Math.min(...points.map((p) => p.score));
  const max   = Math.max(...points.map((p) => p.score));
  const days  = (Date.now() - new Date(`${points[0].slug}T12:00:00Z`)) / 86400e3;
  const range = days <= 28 ? "30" : days <= 85 ? "90" : "365";
  const bandLast = riskBand(last.score);

  const stat = (label, value, color) => {
    const numStyle = {
      fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24,
      lineHeight: 1, color: color ?? "#F5F5F2", fontVariantNumeric: "tabular-nums",
      ...(color ? { textShadow: `0 0 20px ${color}55` } : {}),
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={sectionLabel}>{label}</span>
        {typeof value === "number"
          ? <CountNumber value={value} style={numStyle} />
          : <span style={numStyle}>{value}</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Stats + score histórico */}
      <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={sectionLabel}><T es="Score actual" en="Current score" /></span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CountNumber
                value={last.score}
                style={{
                  fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 30, lineHeight: 1,
                  color: bandLast.color, fontVariantNumeric: "tabular-nums",
                  textShadow: `0 0 20px ${bandLast.color}55`,
                }}
              />
              <BandChip score={last.score} />
            </span>
          </div>
          {stat(lang === "en" ? "Views published" : "Views publicados", points.length)}
          {stat(lang === "en" ? "Average" : "Promedio", avg)}
          {stat(lang === "en" ? "Range" : "Rango", `${min}–${max}`)}
        </div>

        <div style={{ ...sectionLabel, marginBottom: 10 }}>
          <T es="Índice Risk On · un punto por view publicado" en="Risk On Index · one point per published view" />
        </div>
        <ScoreHistoryChart points={points} />
        <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "10px 0 0 0" }}>
          <T
            es="Cada punto es el score publicado esa mañana a las 7:00 (hora CDMX), antes de la apertura. Haz clic en un punto para leer el view de ese día. El histórico crece un punto por día hábil."
            en="Each point is the score published that morning at 7:00 AM (Mexico City), before the open. Click any point to read that day's view. The history grows one point per trading day."
          />
        </p>
      </div>

      {/* USD/MXN del mismo período */}
      <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
        <div style={{ ...sectionLabel, marginBottom: 10 }}>
          {lang === "en" ? `USD/MXN · last ${range} days` : `USD/MXN · últimos ${range} días`}
        </div>
        <UsdMxnChart range={range} />
        <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "10px 0 0 0" }}>
          <T
            es="El peso en el mismo período, para contrastar el score contra el mercado. Van en paneles separados a propósito: comparar dos escalas en un mismo eje engaña al ojo."
            en="The peso over the same period, to contrast the score against the market. Shown as separate panels on purpose: overlaying two scales on one axis misleads the eye."
          />
        </p>
      </div>

      {/* Tabla: últimos views */}
      <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
        <div style={{ ...sectionLabel, marginBottom: 12 }}>
          <T es="Últimos views" en="Latest views" />
        </div>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {[...points].reverse().slice(0, 10).map((p) => (
              <tr key={p.slug} className="row-hover" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "10px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                  {fmtDate(p.slug, lang)}
                </td>
                <td style={{ padding: "10px 12px", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 14, color: riskBand(p.score).color, fontVariantNumeric: "tabular-nums", textAlign: "right", width: 40 }}>
                  {p.score}
                </td>
                {/* En móvil el chip se oculta: el color del score ya dice la banda */}
                <td className="hidden sm:table-cell" style={{ padding: "10px 12px 10px 0", width: 120 }}>
                  <BandChip score={p.score} />
                </td>
                <td style={{ padding: "10px 0", fontSize: 13, lineHeight: 1.5 }}>
                  <a href={`/archive/${p.slug}`} className="text-muted transition-colors hover:text-bone">
                    {(lang === "en" ? p.title_en : p.title_es) ?? p.slug}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
