"use client";
import { useEffect, useState } from "react";
import { useLang, T } from "./Lang";
import { GREEN, RED, cardStyle } from "../lib/chartHelpers";

// ── bullet topic chips ────────────────────────────────────────────────────────

const CHIPS = [
  { test: /\bFOMC\b|\bFed\b|Federal Reserve/i,              label: "FED",   color: "#0F6E56", bg: "rgba(15,110,86,0.12)" },
  { test: /Banxico|Banco de M[eé]xico|\bTIIE\b/i,           label: "MX",    color: "#3FA77E", bg: "rgba(63,167,126,0.12)" },
  { test: /\bCPI\b|\bPCE\b|inflaci[oó]n|inflation/i,        label: "CPI",   color: "#D85A30", bg: "rgba(216,90,48,0.12)"  },
  { test: /USD\/MXN|\bpeso\b|\bMXN\b/i,                     label: "MXN",   color: "#3FA77E", bg: "rgba(63,167,126,0.12)" },
  { test: /\bVIX\b/i,                                        label: "VIX",   color: "#BA7517", bg: "rgba(186,117,23,0.12)" },
  { test: /\bMOVE\b/i,                                       label: "MOVE",  color: "#BA7517", bg: "rgba(186,117,23,0.12)" },
  { test: /\bDXY\b|d[oó]lar index/i,                        label: "DXY",   color: "#639922", bg: "rgba(99,153,34,0.12)"  },
  { test: /treasury|treasuries|\bbonos\b|yields?|tasas/i,   label: "RATES", color: "#BA7517", bg: "rgba(186,117,23,0.12)" },
  { test: /\bBOJ\b|Bank of Japan|\byen\b/i,                  label: "BOJ",   color: "#639922", bg: "rgba(99,153,34,0.12)"  },
  { test: /\bS&P\b|Nasdaq|equity|equities|\bacciones\b/i,   label: "EQ",    color: "#3FA77E", bg: "rgba(63,167,126,0.12)" },
  { test: /\bWTI\b|\bBrent\b|\bcrudo\b|\boil\b/i,           label: "OIL",   color: "#BA7517", bg: "rgba(186,117,23,0.12)" },
  { test: /NFP|payroll|empleo|employment/i,                  label: "NFP",   color: "#D85A30", bg: "rgba(216,90,48,0.12)"  },
];

function chipFor(text) {
  for (const c of CHIPS) if (c.test.test(text)) return c;
  return null;
}

function highlightNumbers(text) {
  return text.replace(
    /([+-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?(?:\s*(?:pb|bps|pp|pips?))?)/g,
    '<span style="font-family:var(--font-mono);color:#D5D5D0;font-size:12.5px;letter-spacing:0.01em">$1</span>'
  );
}

// ── FX pairs config ───────────────────────────────────────────────────────────

const FX_PAIRS = [
  { key: "usdmxn", chgKey: "usdmxnChg", label: "USD/MXN", decimals: 4 },
  { key: "eurmxn", chgKey: "eurmxnChg", label: "EUR/MXN", decimals: 4 },
  { key: "eurusd", chgKey: "eurusdChg", label: "EUR/USD", decimals: 4 },
];

// ── sub-components ────────────────────────────────────────────────────────────

function FXCard({ label, price, chg, decimals }) {
  const isUp     = chg == null ? null : chg >= 0;
  const sigColor = isUp === null ? "#F5F5F2" : isUp ? GREEN : RED;

  return (
    <div style={{
      ...cardStyle(isUp),
      padding: "14px 16px",
      transition: "border-color .4s",
    }}>
      <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4B5563", marginBottom: 6, fontFamily: "var(--font-mono)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 22, lineHeight: 1, color: "#F5F5F2", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", marginBottom: 5 }}>
        {price != null ? price.toFixed(decimals) : "—"}
      </div>
      {chg != null && (
        <div style={{ fontSize: 12, fontWeight: 500, color: sigColor, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 3 }}>
          <span>{isUp ? "▲" : "▼"}</span>
          <span>{isUp ? "+" : ""}{chg.toFixed(2)}%</span>
        </div>
      )}
      {chg == null && (
        <div style={{ fontSize: 12, color: "#374151" }}>—</div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function DailyWatch({ post }) {
  const { lang } = useLang();
  const [market, setMarket] = useState(null);

  useEffect(() => {
    fetch("/api/market").then((r) => r.json()).then(setMarket).catch(() => {});
  }, []);

  if (!post) return null;

  const bullets    = lang === "en" ? post.watch_en : post.watch_es;
  const hasBullets = Array.isArray(bullets) && bullets.length > 0;

  const usingApiRange = !!market?.mxnR1;
  const support       = market?.mxnS1  ?? post.support    ?? null;
  const resistance    = market?.mxnR1  ?? post.resistance ?? null;
  const hasLevels     = support || resistance;

  if (!hasBullets && !hasLevels && !market) return null;

  return (
    <section className="reveal" style={{ animationDelay: "0.3s" }}>

      {/* FX cards */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
          &mdash; <T es="Tipo de cambio" en="Exchange rates" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: 10 }}>
          {FX_PAIRS.map(({ key, chgKey, label, decimals }) => (
            <FXCard
              key={key}
              label={label}
              price={market?.[key] ?? null}
              chg={market?.[chgKey] ?? null}
              decimals={decimals}
            />
          ))}
        </div>
      </div>

      {/* Bullets */}
      {hasBullets && (
        <div style={{ marginBottom: hasLevels ? 16 : 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
            &mdash; <T es="Qué vigilar hoy" en="What to watch today" />
          </div>
          <div style={{ ...cardStyle(), padding: "14px 18px" }}>
            {bullets.map((b, i) => {
              const chip = chipFor(b);
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: i < bullets.length - 1 ? 10 : 0 }}>
                  {chip ? (
                    <span style={{
                      fontSize: 7.5, letterSpacing: 1.5, fontFamily: "var(--font-mono)",
                      color: chip.color, background: chip.bg,
                      border: `1px solid ${chip.color}40`,
                      borderRadius: 4, padding: "2px 5px",
                      flexShrink: 0, marginTop: 3, lineHeight: 1,
                    }}>
                      {chip.label}
                    </span>
                  ) : (
                    <span style={{ color: "#3A3A3E", fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0, marginTop: 3 }}>—</span>
                  )}
                  <span
                    style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65 }}
                    dangerouslySetInnerHTML={{ __html: highlightNumbers(b) }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Range widget */}
      {hasLevels && market?.usdmxn && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
            &mdash; <T es="Rango técnico USD/MXN · 10d" en="USD/MXN range · 10d" />
          </div>
          <div style={{ ...cardStyle(), padding: "16px 18px" }}>
            {(() => {
              const lo  = typeof support    === "number" ? support    : parseFloat(support);
              const hi  = typeof resistance === "number" ? resistance : parseFloat(resistance);
              const cur = market.usdmxn;
              const pct = Math.min(100, Math.max(0, ((cur - lo) / (hi - lo)) * 100));
              const isNearHigh = pct > 70;
              const isNearLow  = pct < 30;
              const dotColor   = isNearHigh ? RED : isNearLow ? GREEN : "#E8E6E0";
              return (
                <>
                  <div style={{ position: "relative", height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, margin: "8px 0 16px" }}>
                    {/* Gradient track */}
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: 2,
                      background: `linear-gradient(to right, ${GREEN}40, rgba(255,255,255,0.04) 50%, ${RED}40)`,
                    }} />
                    <div style={{
                      position: "absolute", left: `${pct}%`, top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: 10, height: 10, borderRadius: "50%",
                      background: dotColor,
                      boxShadow: `0 0 10px ${dotColor}88`,
                      transition: "left .6s ease-out",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 8, color: "#4B5563", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
                        {usingApiRange ? <T es="Mín 10d" en="10d Low" /> : <T es="Soporte" en="Support" />}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: GREEN, fontVariantNumeric: "tabular-nums" }}>
                        {lo.toFixed(4)}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: "#4B5563", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
                        <T es="Actual" en="Current" />
                      </div>
                      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 20, color: dotColor, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                        {cur.toFixed(4)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 8, color: "#4B5563", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
                        {usingApiRange ? <T es="Máx 10d" en="10d High" /> : <T es="Resistencia" en="Resistance" />}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: RED, fontVariantNumeric: "tabular-nums" }}>
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
