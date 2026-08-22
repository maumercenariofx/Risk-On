// app/not-found.jsx
// 404 con la marca (antes salía la genérica de Next). Server component — sin
// LangProvider en este contexto, así que va bilingüe inline.
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <div
        className="font-mono"
        style={{ fontSize: 11, letterSpacing: 4, color: "#8A8A8E", textTransform: "uppercase" }}
      >
        Error 404
      </div>
      <h1 className="mt-3 font-serif text-4xl font-medium text-bone">
        Señal perdida
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        Esta página no existe (o dejó de existir). El mercado sigue abierto en la portada.
        <span className="mt-1 block text-xs text-muted/70">
          This page doesn&apos;t exist — the market&apos;s still open on the homepage.
        </span>
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-md border border-bone/50 bg-white/10 px-4 py-2 text-sm font-medium text-bone transition-colors hover:bg-white/15"
        >
          Ir al inicio
        </Link>
        <Link
          href="/archive"
          className="rounded-md border border-edge px-4 py-2 text-sm text-muted transition-colors hover:text-bone"
        >
          Ver el archivo
        </Link>
      </div>
    </div>
  );
}
