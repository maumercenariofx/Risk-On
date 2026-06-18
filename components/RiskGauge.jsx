"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import { SIGNALS, computeRiskScore, riskBand } from "../lib/riskScore";
import { RISK_COUNTRIES } from "../lib/quantForms";
import RiskSphere from "./RiskSphere";
import MarketsClient from "./MarketsClient";
import DailyRead from "./DailyRead";

function minutesAgo(isoStr) {
  if (!isoStr) return null;
  const mins = Math.round((Date.now() - new Date(isoStr)) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)}h`;
}

function hoursAgo(pubDate) {
  const t = new Date(pubDate).getTime();
  if (isNaN(t)) return null;
  const hrs = Math.round((Date.now() - t) / 3600000);
  if (hrs < 1) return "now";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function accent(score) {
  return riskBand(score).color;
}

export default function RiskGauge({ post }) {
  const { lang } = useLang();
  const [data, setData]         = useState(null); // /api/market
  const [rates, setRates]       = useState(null); // /api/rates
  const [curve, setCurve]       = useState(null); // /api/curve
  const [display, setDisplay]   = useState(0);
  const [sel, setSel]           = useState("vix");
  const [methOpen, setMethOpen] = useState(false);
  const [newsCountry, setNewsCountry] = useState(null);
  const [news, setNews]               = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [heroGone, setHeroGone]       = useState(false);
  const sphereRef = useRef(null);
  const heroRef   = useRef(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!newsCountry) return;
    setNewsLoading(true);
    fetch(`/api/news?country=${newsCountry}&lang=${lang}`)
      .then((r) => r.json())
      .then((d) => setNews(d.items || []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, [newsCountry, lang]);

  useEffect(() => {
    fetch("/api/market").then((r) => r.json()).then(setData)
      .catch(() => setData({ vix: 13.4, move: 98, dxy: 104.3, mxnVol: 9.1, us10y: 4.3 }));
    fetch("/api/rates").then((r) => r.json()).then(setRates).catch(() => setRates(null));
    fetch("/api/curve").then((r) => r.json()).then(setCurve).catch(() => setCurve(null));
  }, []);

  // Mismo modelo que el view diario (lib/riskScore.js) → portada y nota coinciden.
  const result = useMemo(
    () => (data ? computeRiskScore({ market: data, rates, curve }) : null),
    [data, rates, curve]
  );
  const score = result?.score ?? 0;
  const label = riskBand(score);
  const d = useMemo(() => ({ market: data, rates, curve }), [data, rates, curve]);

  useEffect(() => {
    if (!result) return;
    let n = 0;
    const iv = setInterval(() => {
      n += 2;
      if (n >= score) { n = score; clearInterval(iv); }
      setDisplay(n);
    }, 22);
    return () => clearInterval(iv);
  }, [result, score]);

  const accentColor = accent(score);
  const selSig = SIGNALS.find((s) => s.key === sel) ?? SIGNALS[0];

  return (
    <section className="reveal" style={{ animationDelay: "0.05s" }}>

      {/* ── Hero ── */}
      <div ref={heroRef} style={{ position: "relative", height: 520, marginBottom: 28 }}>

        {/* Sphere — full hero, so intro particles can scatter to the edges */}
        <div style={{ position: "absolute", inset: 0 }}>
          <RiskSphere ref={sphereRef} height="100%" />
        </div>

        {/* Top-left: title */}
        <div style={{
          position: "absolute",
          top: 28,
          left: 0,
          lineHeight: 0.9,
          textTransform: "uppercase",
          fontFamily: "var(--font-sans)",
          fontWeight: 800,
          fontSize: "clamp(30px, 6.5vw, 80px)",
          letterSpacing: "-0.03em",
          pointerEvents: "none",
        }}>
          <div style={{ color: "#F5F5F2" }}>WHAT'S</div>
          <div style={{ color: "#F5F5F2" }}>TODAY'S</div>
          <div style={{ color: "#2E2E34" }}>RISK?</div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(8px, 0.85vw, 11px)",
            fontWeight: 400,
            letterSpacing: 2,
            color: "#3A3A40",
            marginTop: 14,
            lineHeight: 1,
          }}>
            <T es="Inteligencia macro diaria · MXN" en="Daily macro intelligence · MXN" />
          </div>
        </div>


        {/* Bottom-right: alert countries + score + label — score-blink starts after counter settles */}
        {result && (
          <div style={{
            position: "absolute",
            bottom: 28,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4A4A50", pointerEvents: "none" }}>
                <T es="Países en alerta" en="Countries on alert" />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {RISK_COUNTRIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      sphereRef.current?.focusCountry(c.lat, c.lon);
                      setNewsCountry((cur) => (cur === c.id ? null : c.id));
                    }}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                      padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                      background: newsCountry === c.id ? "rgba(163,45,45,0.28)" : "rgba(163,45,45,0.12)",
                      border: "1px solid rgba(163,45,45,0.4)",
                      color: "#C77B7B", transition: "all .2s",
                    }}
                  >
                    {lang === "es" ? c.name_es : c.name_en}
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              textAlign: "right",
              lineHeight: 0.9,
              textTransform: "uppercase",
              fontFamily: "var(--font-sans)",
              fontWeight: 800,
              fontSize: "clamp(30px, 6.5vw, 80px)",
              letterSpacing: "-0.03em",
              pointerEvents: "none",
            }}>
              <div className="score-blink" style={{ color: accentColor }}>{display}.</div>
              <div style={{ color: "#2E2E34" }}>
                <T es={label.es} en={label.en} />
              </div>
              <div style={{
                fontSize: 9, letterSpacing: 2.5, fontWeight: 400,
                color: "#2A2A30", marginTop: 6, lineHeight: 1,
              }}>
                ▲ <T es="ÍNDICE EN VIVO" en="LIVE INDEX" />
              </div>
            </div>
          </div>
        )}

        {/* Bottom-left: timestamp */}
        {data?.asOf && (
          <div style={{
            position: "absolute",
            bottom: 28,
            left: 0,
            fontSize: 9,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#2E2E32",
            pointerEvents: "none",
          }}>
            <T es={`Datos hace ${minutesAgo(data.asOf)}`} en={`Data ${minutesAgo(data.asOf)} ago`} />
          </div>
        )}
      </div>

      {/* ── Sticky score badge (appears when hero scrolls out of view) ── */}
      {heroGone && result && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 200,
          background: "rgba(9,9,11,0.96)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: `1px solid ${accentColor}44`,
          borderRadius: 14,
          padding: "11px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: `0 4px 32px rgba(0,0,0,0.7), 0 0 0 1px ${accentColor}18`,
          pointerEvents: "none",
          animation: "fadeInUp .25s ease both",
        }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 30, lineHeight: 1, color: accentColor, letterSpacing: "-0.02em" }}>
            {display}
          </div>
          <div style={{ lineHeight: 1.5 }}>
            <div style={{ fontSize: 7.5, letterSpacing: 2.5, color: "#3A3A40", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              RISK ON
            </div>
            <div style={{ fontSize: 8.5, letterSpacing: 2, color: accentColor, textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              {lang === "en" ? label.en : label.es}
            </div>
          </div>
        </div>
      )}

      {/* ── Country news panel ── */}
      {newsCountry && (() => {
        const c = RISK_COUNTRIES.find((rc) => rc.id === newsCountry);
        return (
          <div
            className="card-glass"
            style={{
              background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12,
              padding: "14px 16px", marginBottom: 28,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50" }}>
                <T es={`Noticias · ${c?.name_es ?? ""} · últimas 48h`} en={`News · ${c?.name_en ?? ""} · last 48h`} />
              </div>
              <button
                onClick={() => setNewsCountry(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#4A4A50", fontSize: 12, padding: 0 }}
                aria-label="close"
              >
                ✕
              </button>
            </div>

            {newsLoading && (
              <p style={{ fontSize: 12, color: "#8A8A8E" }}>
                <T es="Cargando…" en="Loading…" />
              </p>
            )}

            {!newsLoading && news.length === 0 && (
              <p style={{ fontSize: 12, color: "#8A8A8E" }}>
                <T es="Sin noticias relevantes en las últimas 48 horas." en="No relevant news in the last 48 hours." />
              </p>
            )}

            {!newsLoading && news.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {news.map((n, i) => (
                  <a
                    key={i}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "baseline", gap: 8,
                      fontSize: 13, lineHeight: 1.5, color: "#D5D5D2",
                      textDecoration: "none", borderBottom: i < news.length - 1 ? "1px solid #1A1A1C" : "none",
                      paddingBottom: 8,
                    }}
                  >
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, color: "#5A5A62",
                      flexShrink: 0, minWidth: 28,
                    }}>
                      {hoursAgo(n.pubDate) ?? ""}
                    </span>
                    <span style={{ flex: 1 }}>
                      {n.title}
                      {n.source && <span style={{ color: "#5A5A62" }}> — {n.source}</span>}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Component cards (9 señales, mismo modelo que la nota) ── */}
      {result && data && (
        <>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", margin: "0 0 10px" }}>
            &mdash; <T es="Componentes del índice" en="Index components" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            {SIGNALS.map((s) => {
              const compScore = result.components[s.key];
              if (compScore == null) return null;
              const ca = accent(compScore);
              return (
                <button
                  key={s.key}
                  onClick={() => setSel(s.key)}
                  style={{
                    background: "rgba(11,11,12,0.92)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                    textAlign: "left", cursor: "pointer",
                    padding: "12px 13px", borderRadius: 10,
                    border: `1px solid ${sel === s.key ? "#3A3A3E" : "#1E1E20"}`,
                    color: "#F5F5F2", transition: "border-color .2s",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#4A4A50", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>
                    {s.label}
                    {s.sub && (
                      <span style={{ opacity: 0.65 }}>
                        {" "}·{" "}<T es={s.sub.es} en={s.sub.en} />
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, lineHeight: 1, color: "#F5F5F2", marginBottom: 8 }}>
                    {s.value(d)}
                  </div>
                  <div style={{ height: 1.5, background: "#1E1E20", borderRadius: 1, marginBottom: 5 }}>
                    <div style={{ height: "100%", borderRadius: 1, width: `${compScore}%`, background: ca, transition: "width 1.2s ease-out" }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: ca, letterSpacing: 0.5 }}>
                    {compScore}/100
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{
            marginTop: 10, background: "rgba(11,11,12,0.92)",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            border: "1px solid #1E1E20", borderRadius: 10, padding: "12px 14px",
            fontSize: 13, lineHeight: 1.7, color: "#8A8A8E",
          }}>
            <T es={selSig.detail.es} en={selSig.detail.en} />
          </div>

          <button
            onClick={() => setMethOpen((o) => !o)}
            style={{
              marginTop: 12, background: "none", border: "none", cursor: "pointer",
              fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
              color: methOpen ? "#8A8A8E" : "#4A4A50",
              display: "flex", alignItems: "center", gap: 6,
              transition: "color .2s", padding: 0,
            }}
          >
            <span style={{ fontSize: 8 }}>{methOpen ? "▲" : "▼"}</span>
            <T es="¿Cómo se calcula este índice?" en="How is this index calculated?" />
          </button>

          {methOpen && (
            <div style={{
              marginTop: 10, background: "rgba(11,11,12,0.92)",
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              border: "1px solid #1E1E20", borderRadius: 10, padding: "18px 18px",
            }}>
              <p style={{ fontSize: 12, color: "#8A8A8E", lineHeight: 1.75, marginBottom: 16 }}>
                <T
                  es="El índice Risk On resume en un número (0–100) el apetito global por riesgo con énfasis en México. Combina 9 señales de mercado, cada una normalizada a 0–100 según rangos típicos, y las pondera. Es el MISMO número que ves en cada nota diaria — sin cajas negras."
                  en="The Risk On index summarizes global risk appetite — with a Mexico focus — in a single number (0–100). It combines 9 market signals, each normalized to 0–100 over typical ranges, then weighted. It's the SAME number you see in every daily note — no black boxes."
                />
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {SIGNALS.map((s) => (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6A6A70", width: 76, flexShrink: 0 }}>{s.label}</div>
                    <div style={{ flex: 1, height: 3, background: "#1E1E20", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${s.w * 4}%`, background: "#3A3A44", borderRadius: 2 }} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8A8A8E", width: 30, textAlign: "right", flexShrink: 0 }}>{s.w}%</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#5A5A62", width: 78, textAlign: "right", flexShrink: 0 }}>{s.range}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Pre-market ── */}
      {post && (
        <div style={{ marginTop: 28 }}>
          <DailyRead post={post} />
        </div>
      )}

      {/* ── Markets embed ── */}
      <div style={{ marginTop: 28, padding: "8px 0" }}>
        <MarketsClient embed />
      </div>

    </section>
  );
}
