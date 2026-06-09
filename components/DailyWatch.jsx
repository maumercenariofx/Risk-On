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
          &mdash; <T es="Que lo mueve hoy" en="What's moving it today" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
          {FX_PAIRS.map(({ key, chgKey, label, decimals }) => {
            const price = market?.[key];
            const chg   = market?.[chgKey];
            return (
              <div
                key={key}
                style={{
                  background: "rgba(11,11,12,0.85)",
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
            style={{ background: "rgba(11,11,12,0.85)", border: "1px solid #1E1E20", borderRadius: 12, padding: "14px 18px" }}
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

      {/* ── Niveles técnicos USD/MXN ── */}
      {hasLevels && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
            &mdash; <T es="Niveles técnicos USD/MXN" en="USD/MXN technical levels" />
            {market?.mxnS1 && (
              <span style={{ marginLeft: 8, color: "#2E2E32", fontSize: 9 }}>
                · <T es="rolling 10d" en="rolling 10d" />
              </span>
            )}
          </div>
          <div
            className="card-glass"
            style={{ background: "rgba(11,11,12,0.85)", border: "1px solid #1E1E20", borderRadius: 12, padding: "14px 18px" }}
          >
            <div style={{ display: "flex", gap: 28, marginBottom: 12, flexWrap: "wrap" }}>
              {support && (
                <div>
                  <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4A4A50", marginBottom: 5 }}>
                    <T es="Soporte" en="Support" />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, color: "#0F8A5F" }}>
                    {typeof support === "number" ? support.toFixed(4) : support}
                  </div>
                </div>
              )}
              {resistance && (
                <div>
                  <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4A4A50", marginBottom: 5 }}>
                    <T es="Resistencia" en="Resistance" />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, color: "#A32D2D" }}>
                    {typeof resistance === "number" ? resistance.toFixed(4) : resistance}
                  </div>
                </div>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#4A4A50", lineHeight: 1.7 }}>
              <T
                es="Soporte: precio donde la demanda suele frenar las caídas. Resistencia: nivel donde la oferta suele contener las subidas. Son referencias técnicas, no garantías."
                en="Support: price level where demand tends to halt declines. Resistance: level where supply tends to cap advances. These are technical guides, not guarantees."
              />
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
