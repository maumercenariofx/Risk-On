"use client";
import { useLang, T } from "./Lang";

export default function DailyWatch({ post }) {
  const { lang } = useLang();
  if (!post) return null;

  const bullets = lang === "en" ? post.watch_en : post.watch_es;
  const hasBullets = Array.isArray(bullets) && bullets.length > 0;
  const hasLevels = post.support || post.resistance;

  if (!hasBullets && !hasLevels) return null;

  return (
    <section className="reveal" style={{ animationDelay: "0.3s" }}>

      {hasBullets && (
        <div style={{ marginBottom: hasLevels ? 16 : 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
            &mdash; <T es="Qué vigilar hoy" en="What to watch today" />
          </div>
          <div style={{ background: "#0B0B0C", border: "1px solid #1E1E20", borderRadius: 12, padding: "14px 18px" }}>
            {bullets.map((b, i) => (
              <div key={i} style={{
                display: "flex", gap: 10,
                marginBottom: i < bullets.length - 1 ? 9 : 0,
              }}>
                <span style={{ color: "#3A3A3E", fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0, marginTop: 2 }}>—</span>
                <span style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasLevels && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 10 }}>
            &mdash; <T es="Niveles técnicos USD/MXN" en="USD/MXN technical levels" />
          </div>
          <div style={{ background: "#0B0B0C", border: "1px solid #1E1E20", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ display: "flex", gap: 28, marginBottom: 12, flexWrap: "wrap" }}>
              {post.support && (
                <div>
                  <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4A4A50", marginBottom: 5 }}>
                    <T es="Soporte" en="Support" />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, color: "#0F8A5F" }}>
                    {post.support}
                  </div>
                </div>
              )}
              {post.resistance && (
                <div>
                  <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4A4A50", marginBottom: 5 }}>
                    <T es="Resistencia" en="Resistance" />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, color: "#A32D2D" }}>
                    {post.resistance}
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
