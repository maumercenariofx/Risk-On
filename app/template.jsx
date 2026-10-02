// app/template.jsx
// Se re-monta en cada navegación → re-dispara el fade de entrada (solo
// opacity: un transform en el wrapper rompería los position:fixed hijos).
// Respeta reduced-motion. Sin el barrido luminoso (.page-sweep) desde la
// auditoría UI 2026-10-02: navegar pasa decenas de veces por sesión y un
// barrido "porque se ve bien" no tiene propósito.
export default function Template({ children }) {
  return <div className="page-fade">{children}</div>;
}
