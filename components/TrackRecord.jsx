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
      fontSize: 11, letterSpacing: 2, fontFamily: "var(--font-mono)",
      color: b.color, border: `1px solid ${b.color}44`,
      borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
    }}>
      {b.key}
    </span>
  );
}

// ── Score + USD/MXN en un mismo lienzo temporal (petición del usuario 2026-07-13)
// Dos paneles APILADOS con el MISMO eje x (un punto por view publicado) y
// crosshair/tooltip SINCRONIZADOS: mueves el cursor y lees el score y el
// USD/MXN del mismo día a la vez. Apilados a propósito, jamás doble eje —
// dos escalas en un mismo plano es el engaño clásico de los charts.
function SyncedScoreFx({ points, range }) {
  const scoreRef  = useRef(null);
  const fxRef     = useRef(null);
  const chartsRef = useRef({});
  const [fx, setFx]     = useState(null); // cierres USD/MXN alineados a points
  const [asOf, setAsOf] = useState(null); // momento real de la carga (veracidad)
  const { lang } = useLang();

  useEffect(() => {
    fetch(`/api/history?range=${range}&symbol=USDMXN`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.prices?.length || !d?.dates?.length) return;
        // Alineación por fecha (carry-forward): para cada view, el último
        // cierre con fecha ≤ slug — cubre feriados y huecos del feed.
        let j = 0, lastPx = null;
        const aligned = points.map((p) => {
          while (j < d.dates.length && d.dates[j] <= p.slug) { lastPx = d.prices[j]; j++; }
          return lastPx;
        });
        setFx(aligned);
        setAsOf(new Date().toISOString());
      })
      .catch(() => {});
  }, [points, range]);

  useEffect(() => {
    if (!points?.length) return;
    let cancelled = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled || !scoreRef.current) return;
      chartsRef.current.unlink?.();
      chartsRef.current.score?.destroy();
      chartsRef.current.fx?.destroy();

      const labels     = points.map((p) => fmtDate(p.slug, lang));
      const scoreColor = riskBand(points[points.length - 1].score).color;
      const goView = (_e, els) => {
        const i = els?.[0]?.index;
        if (i != null) window.location.href = `/archive/${points[i].slug}`;
      };
      const hoverCursor = (e, els) => { e.native.target.style.cursor = els?.length ? "pointer" : "default"; };
      const hasFx = Array.isArray(fx) && fx.some((v) => v != null);

      chartsRef.current.score = new Chart(scoreRef.current, {
        type: "line",
        plugins: [crosshairPlugin, bandLinesPlugin, makeGlowPlugin(scoreColor, 0, 12), makeTerminalDotPlugin(scoreColor, 0)],
        data: {
          labels,
          datasets: [{
            data:                      points.map((p) => p.score),
            borderColor:               scoreColor,
            borderWidth:               2,
            backgroundColor:           makeGradientFn(scoreColor),
            fill:                      true,
            tension:                   0.3,
            pointRadius:               0,
            pointHitRadius:            12,
            pointHoverRadius:          4,
            pointHoverBackgroundColor: scoreColor,
            pointHoverBorderColor:     "#000",
            pointHoverBorderWidth:     2,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          animation:           lineAnim(points.length),
          interaction:         { intersect: false, mode: "index" },
          onClick:             goView,
          onHover:             hoverCursor,
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
            // El eje de fechas vive SOLO en el panel de abajo cuando existe;
            // duplicarlo en ambos paneles gasta alto y no aporta.
            x: hasFx ? { ...xScaleDefaults(8), ticks: { display: false } } : xScaleDefaults(Math.min(points.length, 8)),
            y: { ...yScaleDefaults((v) => v), min: 0, max: 100, position: "right" },
          },
        },
      });

      if (hasFx && fxRef.current) {
        const first = fx.find((v) => v != null);
        const chg   = fx[fx.length - 1] - first;
        const fxColor = semanticColor(chg < 0); // baja USD/MXN = peso fuerte = verde
        chartsRef.current.fx = new Chart(fxRef.current, {
          type: "line",
          plugins: [crosshairPlugin, makeGlowPlugin(fxColor, 0, 10), makeTerminalDotPlugin(fxColor, 0)],
          data: {
            labels,
            datasets: [{
              data:                      fx,
              borderColor:               fxColor,
              borderWidth:               2,
              backgroundColor:           makeGradientFn(fxColor),
              fill:                      true,
              tension:                   0.3,
              pointRadius:               0,
              pointHitRadius:            12,
              pointHoverRadius:          4,
              pointHoverBackgroundColor: fxColor,
              pointHoverBorderColor:     "#000",
              pointHoverBorderWidth:     2,
            }],
          },
          options: {
            responsive:          true,
            maintainAspectRatio: false,
            animation:           lineAnim(points.length),
            interaction:         { intersect: false, mode: "index" },
            onClick:             goView,
            onHover:             hoverCursor,
            plugins: {
              legend:  { display: false },
              tooltip: {
                ...tooltipDefaults,
                callbacks: {
                  title: (items) => items[0].label,
                  label: (c) => ` ${c.parsed.y?.toFixed(4)}`,
                },
              },
            },
            scales: {
              x: xScaleDefaults(8),
              y: { ...yScaleDefaults((v) => v.toFixed(2)), position: "right" },
            },
          },
        });

        // Crosshair sincronizado: el hover en un panel activa el tooltip del
        // otro en el MISMO índice (mismo día). Bidireccional.
        const link = (src, dst) => {
          const move = (e) => {
            const els = src.getElementsAtEventForMode(e, "index", { intersect: false }, false);
            const i = els?.[0]?.index;
            if (i == null || !dst.chartArea) return;
            dst.setActiveElements([{ datasetIndex: 0, index: i }]);
            dst.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], {
              x: dst.scales.x.getPixelForValue(i),
              y: (dst.chartArea.top + dst.chartArea.bottom) / 2,
            });
            dst.update("none");
          };
          const leave = () => {
            dst.setActiveElements([]);
            dst.tooltip.setActiveElements([], { x: 0, y: 0 });
            dst.update("none");
          };
          src.canvas.addEventListener("mousemove", move);
          src.canvas.addEventListener("mouseleave", leave);
          return () => {
            src.canvas.removeEventListener("mousemove", move);
            src.canvas.removeEventListener("mouseleave", leave);
          };
        };
        const un1 = link(chartsRef.current.score, chartsRef.current.fx);
        const un2 = link(chartsRef.current.fx, chartsRef.current.score);
        chartsRef.current.unlink = () => { un1(); un2(); };
      }
    })();
    return () => {
      cancelled = true;
      chartsRef.current.unlink?.();
      chartsRef.current.score?.destroy();
      chartsRef.current.fx?.destroy();
      chartsRef.current = {};
    };
  }, [points, fx, lang]);

  return (
    <>
      <div style={{ position: "relative", height: 190 }}>
        <canvas ref={scoreRef} />
      </div>
      <div style={{ ...sectionLabel, margin: "14px 0 8px" }}>
        <T es="USD/MXN · mismos días" en="USD/MXN · same days" />
      </div>
      {fx ? (
        <>
          <div style={{ position: "relative", height: 130 }}>
            <canvas ref={fxRef} />
          </div>
          <SourceTag source="Yahoo Finance" asOf={asOf} style={{ marginTop: 8 }} />
        </>
      ) : (
        <Skeleton height={130} />
      )}
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
        <SyncedScoreFx points={points} range={range} />
        <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "10px 0 0 0" }}>
          <T
            es="Índice y USD/MXN sobre los mismos días, alineados: mueve el cursor y lee ambos valores de la misma fecha (el crosshair está sincronizado). Haz clic en cualquier punto para leer el view de ese día. Paneles apilados a propósito — dos escalas en un mismo plano engañan al ojo. Ojo con la lectura: score alto suele coincidir con USD/MXN a la baja (peso fuerte)."
            en="Index and USD/MXN over the same days, aligned: move the cursor and read both values for the same date (the crosshair is synced). Click any point to read that day's view. Stacked panels on purpose — two scales on one plane mislead the eye. Reading tip: a high score usually coincides with USD/MXN falling (strong peso)."
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
