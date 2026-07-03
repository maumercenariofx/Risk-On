// app/template.jsx
// Se re-monta en cada navegación → la clase .page-fade re-dispara el fade de
// entrada entre páginas (definido en globals.css, respeta reduced-motion).
export default function Template({ children }) {
  return <div className="page-fade">{children}</div>;
}
