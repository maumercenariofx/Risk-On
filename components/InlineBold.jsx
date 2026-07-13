"use client";
// Renderiza texto con negritas markdown (**x**) como <strong> real.
// Para summary/watch del view, que no pasan por remark (solo el body lo hace).
export default function InlineBold({ text }) {
  const parts = String(text ?? "").split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p))}</>;
}
