// app/template.jsx
// Se re-monta en cada navegación → re-dispara el fade de entrada + el barrido
// luminoso (.page-sweep, elemento fixed propio — no transforma al wrapper,
// que rompería los position:fixed hijos). Respeta reduced-motion.
export default function Template({ children }) {
  return (
    <div className="page-fade">
      <div className="page-sweep" aria-hidden />
      {children}
    </div>
  );
}
