// components/Skeleton.jsx
// Bloque shimmer para charts en carga (estilos en globals.css). Server-safe.
export default function Skeleton({ height = 160, style }) {
  return <div className="skeleton" aria-hidden style={{ height, ...style }} />;
}
