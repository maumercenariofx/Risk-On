"use client";
import { useEffect, useState } from "react";
import { useLang, T } from "./Lang";

const FX_PAIRS = [
  { key: "usdmxn", chgKey: "usdmxnChg", label: "USD/MXN", decimals: 4 },
  { key: "eurmxn", chgKey: "eurmxnChg", label: "EUR/MXN", decimals: 4 },
  { key: "eurusd", chgKey: "eurusdChg", label: "EUR/USD", decimals: 4 },
];

function ChgBadge({ pct }) {
  if (pct == null) return <span style={{ color: "#4A4A50", fontSize: 11 }}>—</span>;
  const up    = pct >= 0;
  const color = up ? "#0F8A5F" : "#A32D2D";
  const arrow = up ? "▲" : "▼";
  return (
    <span style={{ color, fontSize: 11, fontFamily: "var(--font-mono)" }}>
      {arrow} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

export default function DailyWatch({ post }) {
  const { lang } = useLang();
  const [market, setMarket] = useState(null);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then(setMarket)
      .catch(() => {});
  }, []);

  if (!post) return null;

  const bullets   = lang === "en" ? post.watch_en : post.watch_es;
  const hasBullets = Array.isArray(bullets) && bullets.length > 0;

  // Soportes/resistencias: live si ya cargó la API, fallback al markdown
  const support    = market?.mxnS1 ?? post.support ?? null;
  const resistance = market?.mxnR1 ?? post.resistance ?? null;
  const hasLevels  = support || resistance;

  if (!hasBullets && !hasLevels && !market) return null;

  return (
    <section className="reveal" style={{ animationDelay: "0.3s" }}>

      {/* ── FX hoy: USD/MXN · EUR/MXN · EUR/USD ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
          &mdash; <T es="Tipo de cambio" en="Exchange rates" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
          {FX_PAIRS.map(({ key, chgKey, label, decimals }) => {
            const price = market?.[key];
            const chg   = market?.[chgKey];
            return (
              <div
                key={key}
                style={{
                  background: "rgba(10,10,12,0.55)",
                  backdropFilter: "blur(20px) saturate(1.05) brightness(0.6)",
                  WebkitBackdropFilter: "blur(20px) saturate(1.05) brightness(0.6)",
                  border: "1px solid #1E1E20",
                  borderRadius: 10,
                  padding: "12px 13px",
                }}
              >
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 5 }}>
                  {label}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, lineHeight: 1, color: "#F5F5F2", marginBottom: 6 }}>
                  {price != null ? price.toFixed(decimals) : "—"}
                </div>
                <ChgBadge pct={chg} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Qué vigilar hoy (bullets editoriales) ── */}
      {hasBullets && (
        <div style={{ marginBottom: hasLevels ? 16 : 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
            &mdash; <T es="Qué vigilar hoy" en="What to watch today" />
          </div>
          <div
            className="card-glass"
            style={{ background: "rgba(10,10,12,0.55)", border: "1px solid #1E1E20", borderRadius: 12, padding: "14px 18px" }}
          >
            {bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < bullets.length - 1 ? 9 : 0 }}>
                <span style={{ color: "#3A3A3E", fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0, marginTop: 2 }}>—</span>
                <span style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rango técnico USD/MXN: barra visual de posición ── */}
      {hasLevels && market?.usdmxn && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
            &mdash; <T es="Rango técnico USD/MXN · 10d" en="USD/MXN range · 10d" />
          </div>
          <div
            className="card-glass"
            style={{ background: "rgba(10,10,12,0.55)", border: "1px solid #1E1E20", borderRadius: 12, padding: "16px 18px" }}
          >
            {(() => {
              const lo  = typeof support    === "number" ? support    : parseFloat(support);
              const hi  = typeof resistance === "number" ? resistance : parseFloat(resistance);
              const cur = market.usdmxn;
              const pct = Math.min(100, Math.max(0, ((cur - lo) / (hi - lo)) * 100));
              const isNearHigh = pct > 70;
              const isNearLow  = pct < 30;
              const dotColor   = isNearHigh ? "#A32D2D" : isNearLow ? "#0F8A5F" : "#E8E6E0";
              return (
                <>
                  {/* Range bar */}
                  <div style={{ position: "relative", height: 3, background: "#1E1E20", borderRadius: 2, margin: "8px 0 16px" }}>
                    <div style={{
                      position: "absolute", left: `${pct}%`, top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: 9, height: 9, borderRadius: "50%",
                      background: dotColor, boxShadow: `0 0 8px ${dotColor}55`,
                      transition: "left .6s ease-out",
                    }} />
                  </div>
                  {/* Labels */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 8, color: "#4A4A50", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>
                        <T es="Soporte" en="Support" />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "#0F8A5F" }}>
                        {lo.toFixed(4)}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: "#4A4A50", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>
                        <T es="Actual" en="Current" />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 19, fontWeight: 500, color: dotColor }}>
                        {cur.toFixed(4)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 8, color: "#4A4A50", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>
                        <T es="Resistencia" en="Resistance" />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "#A32D2D" }}>
                        {hi.toFixed(4)}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
}
