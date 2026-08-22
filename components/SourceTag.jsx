"use client";
// components/SourceTag.jsx
// Sello de veracidad: fuente del dato + qué tan fresco es ("Yahoo · hace 40s").
// Se re-renderiza cada 30s para que la edad no mienta. Si no hay asOf, muestra
// solo la fuente.
import { useEffect, useState } from "react";
import { useLang } from "./Lang";

function age(iso, lang) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const en = lang === "en";
  if (s < 60) return en ? `${Math.round(s)}s ago` : `hace ${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60) return en ? `${Math.round(m)}m ago` : `hace ${Math.round(m)}m`;
  const h = m / 60;
  if (h < 36) return en ? `${Math.round(h)}h ago` : `hace ${Math.round(h)}h`;
  const d = h / 24;
  return en ? `${Math.round(d)}d ago` : `hace ${Math.round(d)}d`;
}

export default function SourceTag({ source, asOf, style }) {
  const { lang } = useLang();
  const [, tick] = useState(0);

  useEffect(() => {
    if (!asOf) return;
    const iv = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(iv);
  }, [asOf]);

  return (
    <div
      style={{
        fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.2,
        textTransform: "uppercase", color: "#8A8A8E", ...style,
      }}
    >
      {source}
      {asOf ? ` · ${age(asOf, lang)}` : ""}
    </div>
  );
}
