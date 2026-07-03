"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import { SIGNALS, computeRiskScore, riskBand } from "../lib/riskScore";
import { RISK_COUNTRIES } from "../lib/quantForms";
import RiskSphere from "./RiskSphere";
import MarketsClient from "./MarketsClient";
import DailyRead from "./DailyRead";

// Frescura del dato, frase completa según idioma (antes mezclaba "Data ahora ago").
function dataFreshness(isoStr, lang) {
  if (!isoStr) return "";
  const mins = Math.round((Date.now() - new Date(isoStr)) / 60000);
  if (lang === "en") {
    if (mins < 1) return "Data just now";
    if (mins < 60) return `Data ${mins} min ago`;
    return `Data ${Math.round(mins / 60)}h ago`;
  }
  if (mins < 1) return "Datos ahora mismo";
  if (mins < 60) return `Datos hace ${mins} min`;
  return `Datos hace ${Math.round(mins / 60)}h`;
}

function newsAge(pubDate, lang) {
  const t = new Date(pubDate).getTime();
  if (isNaN(t)) return "";
  const hrs = Math.round((Date.now() - t) / 3600000);
  if (hrs < 1) return lang === "en" ? "now" : "ahora";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function accent(score) {
  return riskBand(score).color;
}

// Color por tensión de país (0 = calma/verde → 100 = estrés/rojo).
function tensionColor(s) {
  if (s >= 66) return "#D85A30";
  if (s >= 45) return "#C99A2E";
  return "#3FA77E";
}

export default function RiskGauge({ post, ticker = null }) {
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
  const [isSub, setIsSub]             = useState(false); // ya suscrito → sin CTA en el badge
  const [cScores, setCScores]         = useState(null); // riesgo por país en vivo
  const sphereRef     = useRef(null);
  const heroRef       = useRef(null);
  const sphereWrapRef = useRef(null); // capa scroll-linked del globo
  const overlayRef    = useRef(null); // textos del hero (parallax de salida)

  // Salida cinematográfica: al scrollear, el globo se encoge/desvanece y los
  // textos suben más rápido — "dejar atrás el planeta". Solo transform/opacity
  // (GPU) + rAF-throttle; nada si el sistema pide reduced-motion.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = heroRef.current?.offsetHeight || window.innerHeight;
        const p = Math.min(Math.max(window.scrollY / (h * 0.9), 0), 1);
        if (sphereWrapRef.current) {
          sphereWrapRef.current.style.transform = `scale(${1 - p * 0.15}) translateY(${p * 60}px)`;
          sphereWrapRef.current.style.opacity = String(1 - p * 0.85);
        }
        if (overlayRef.current) {
          overlayRef.current.style.transform = `translateY(${p * 70}px)`;
          overlayRef.current.style.opacity = String(Math.max(1 - p * 1.15, 0));
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

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
    fetch("/api/country-risk").then((r) => r.json()).then((d) => setCScores(d.scores || null)).catch(() => {});
    try { setIsSub(localStorage.getItem("riskon-sub") === "1"); } catch {}
  }, []);

  // Aplica el riesgo por país en vivo al globo (reintenta hasta que monte el 3D).
  useEffect(() => {
    if (!cScores) return;
    let tries = 0, id;
    const apply = () => {
      if (sphereRef.current?.setCountryScores) sphereRef.current.setCountryScores(cScores);
      else if (tries++ < 25) id = setTimeout(apply, 300);
    };
    apply();
    return () => clearTimeout(id);
  }, [cScores]);

  // Lista de países ordenada por tensión en vivo (con fallback al valor curado).
  const countriesByRisk = useMemo(() => {
    return RISK_COUNTRIES
      .map((c) => ({ ...c, live: cScores?.[c.id] ?? c.score }))
      .sort((a, b) => b.live - a.live);
  }, [cScores]);

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

      {/* ── Hero — pantalla COMPLETA: full-bleed, bajo el nav transparente ── */}
      <div ref={heroRef} className="full-bleed hero-full" style={{ position: "relative", marginBottom: 28 }}>

        {/* Sphere — capa externa controlada por el scroll (shrink/fade al salir);
            la interna (.hero-canvas) trae la animación de entrada. Separadas
            porque una animación con fill pisaría el transform inline del scroll. */}
        <div ref={sphereWrapRef} style={{ position: "absolute", inset: 0, willChange: "transform, opacity" }}>
          <div className="hero-canvas" style={{ position: "absolute", inset: 0 }}>
            <RiskSphere ref={sphereRef} height="100%" />
          </div>
        </div>

        {/* Overlays alineados al contenedor central; pointer-events solo en
            los chips para no taparle la interacción al globo. OJO: los hijos
            absolutos ignoran el padding del wrapper → usan left/right: 20. */}
        <div ref={overlayRef} className="relative mx-auto h-full max-w-5xl" style={{ pointerEvents: "none", willChange: "transform, opacity" }}>

        {/* Top-left: title (bajo el nav transparente → top 104) */}
        <div style={{
          position: "absolute",
          top: 104,
          left: 20,
          lineHeight: 0.9,
          textTransform: "uppercase",
          fontFamily: "var(--font-sans)",
          fontWeight: 800,
          fontSize: "clamp(30px, 6.5vw, 84px)",
          letterSpacing: "-0.03em",
          pointerEvents: "none",
        }}>
          <div className="hero-line"><span style={{ color: "#F5F5F2" }}>WHAT'S</span></div>
          <div className="hero-line"><span style={{ color: "#F5F5F2" }}>TODAY'S</span></div>
          <div className="hero-line"><span style={{ color: "#2E2E34" }}>RISK?</span></div>
          <div className="hero-late" style={{
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
          <div className="hero-late" style={{
            position: "absolute",
            bottom: 28,
            right: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4A4A50", pointerEvents: "none" }}>
                <T es="Países en alerta" en="Countries on alert" />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", pointerEvents: "auto" }}>
                {countriesByRisk.map((c) => {
                  const col = tensionColor(c.live);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        sphereRef.current?.focusCountry(c.lat, c.lon);
                        setNewsCountry((cur) => (cur === c.id ? null : c.id));
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                        padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                        background: newsCountry === c.id ? `${col}38` : `${col}1A`,
                        border: `1px solid ${col}66`,
                        color: col, transition: "all .2s",
                      }}
                    >
                      {lang === "es" ? c.name_es : c.name_en}
                      <span style={{ opacity: 0.8 }}>{c.live}</span>
                    </button>
                  );
                })}
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
          <div className="hero-late" style={{
            position: "absolute",
            bottom: 28,
            left: 20,
            fontSize: 9,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#2E2E32",
            pointerEvents: "none",
          }}>
            {dataFreshness(data.asOf, lang)}
          </div>
        )}
        </div>

        {/* Hint de scroll: el hero llena la pantalla, esto invita a bajar */}
        <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <span className="scroll-hint" style={{ color: "#3A3A40", fontSize: 13, lineHeight: 1 }}>▼</span>
        </div>
      </div>

      {/* Ticker: vive justo debajo del hero (llega como prop desde la página) */}
      {ticker}

      {/* ── Termómetro 0–100: lectura instantánea de la temperatura del mercado ── */}
      {result && (
        <div style={{ margin: "0 0 22px" }}>
          <div style={{
            position: "relative", height: 8, borderRadius: 5,
            background: "linear-gradient(90deg,#5B7FB9 0%,#D9A227 34%,#2FB89A 60%,#19C39B 100%)",
          }}>
            <div style={{
              position: "absolute", top: -3, left: `${score}%`, transform: "translateX(-50%)",
              width: 3, height: 14, background: "#F5F5F2", borderRadius: 2,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
            }} />
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 6,
            fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1, color: "#5A5A62",
          }}>
            <span><T es="0 · Pánico" en="0 · Panic" /></span>
            <span style={{ color: accentColor, fontWeight: 600 }}>
              {score} · <T es={label.es} en={label.en} />
            </span>
            <span><T es="Euforia · 100" en="Euphoria · 100" /></span>
          </div>
        </div>
      )}

      {/* ── Sticky score badge (aparece al scrollear fuera del hero) ──
          Ahora es CTA: click → form de suscripción. Si ya se suscribió
          (localStorage riskon-sub) el renglón "Suscríbete" no se muestra. */}
      {heroGone && result && (
        <a
          href="#subscribe"
          onClick={(e) => {
            e.preventDefault();
            const go = () => document.getElementById("subscribe")?.scrollIntoView({ behavior: "smooth", block: "start" });
            go(); setTimeout(go, 300);
          }}
          className="badge-cta"
          style={{
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
            flexDirection: "column",
            gap: 8,
            boxShadow: `0 4px 32px rgba(0,0,0,0.7), 0 0 0 1px ${accentColor}18`,
            textDecoration: "none",
            cursor: "pointer",
            animation: "fadeInUp .25s ease both",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          {!isSub && (
            <div style={{
              borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 7,
              fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
              fontFamily: "var(--font-mono)", color: "#F5F5F2", textAlign: "center",
            }}>
              <T es="Suscríbete →" en="Subscribe →" />
            </div>
          )}
        </a>
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
                      {newsAge(n.pubDate, lang)}
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
              <p style={{ fontSize: 12, color: "#8A8A8E", lineHeight: 1.75, marginBottom: 12 }}>
                <T
                  es="El índice Risk On resume en un número (0–100) el apetito global por riesgo con énfasis en México. Combina 9 señales de mercado ponderadas; es el MISMO número, determinístico, que ves en cada nota diaria y en el correo — sin cajas negras ni IA inventando el valor."
                  en="The Risk On index summarizes global risk appetite — with a Mexico focus — in a single number (0–100). It combines 9 weighted market signals; it's the SAME deterministic number you see in every daily note and email — no black boxes, no AI making up the value."
                />
              </p>
              <p style={{ fontSize: 12, color: "#8A8A8E", lineHeight: 1.75, marginBottom: 16 }}>
                <T
                  es="Cada señal se normaliza a 0–100 con un z-score robusto contra su desviación rodante (~60 días): el rango se ensancha en pánico y se encoge en calma, y un mapeo logístico evita que los extremos se 'topen' en 0 o 100 — así sigue siendo sensible en días de euforia o miedo. Las señales lentas (carry, curva) usan rangos de referencia fijos. La metodología se valida con backtests de 5 años y las bandas están calibradas sobre la distribución histórica."
                  en="Each signal is normalized to 0–100 with a robust z-score against its rolling deviation (~60 days): the range widens in panic and narrows in calm, and a logistic mapping keeps extremes from pinning at 0 or 100 — so it stays sensitive on days of fear or euphoria. Slow signals (carry, curve) use fixed reference ranges. The methodology is validated with 5-year backtests and the bands are calibrated to the historical distribution."
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
