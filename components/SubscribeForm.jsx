"use client";
// components/SubscribeForm.jsx
import { useState } from "react";
import { useLang, T } from "./Lang";

const FIELD_CLS =
  "min-w-0 flex-1 rounded-md border border-edge bg-transparent px-3 py-2 text-sm text-bone outline-none placeholder:text-muted focus:border-bone/50";

export default function SubscribeForm() {
  const { lang } = useLang();
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [showMore,  setShowMore]  = useState(false);
  const [nombre,    setNombre]    = useState("");
  const [apellidos, setApellidos] = useState("");
  const [trato,     setTrato]     = useState(""); // "" | "Sr." | "Sra."

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nombre, apellidos, trato, lang }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  const tratoOptions = [
    { v: "",     es: "Sin trato", en: "None" },
    { v: "Sr.",  es: "Sr.",       en: "Mr." },
    { v: "Sra.", es: "Sra.",      en: "Ms." },
  ];

  return (
    <div
      className="card-glass mt-4 rounded-xl border border-edge p-4"
      style={{ background: "rgba(11,11,12,0.92)" }}
    >
      <p className="mb-2 text-sm font-medium text-bone">
        <T es="Recibe Pre-market cada mañana" en="Get Pre-market every morning" />
      </p>
      <p className="mb-3 text-xs text-muted">
        <T es="Un correo corto antes de la apertura, sin spam."
           en="One short email before the open, no spam." />
      </p>

      {status === "done" ? (
        <p className="text-sm text-bone">
          <T es="Listo — revisa tu correo." en="Done — check your inbox." />
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={lang === "en" ? "you@email.com" : "tu@correo.com"}
              className={FIELD_CLS}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-md border border-bone/50 bg-white/10 px-4 py-2 text-sm font-medium text-bone transition-colors hover:bg-white/15 disabled:opacity-50"
            >
              {status === "loading" ? (
                <T es="Enviando…" en="Sending…" />
              ) : (
                <T es="Suscribirme" en="Subscribe" />
              )}
            </button>
          </div>

          {/* Personalización opcional: si la llenan, el correo los saluda por su nombre. */}
          {!showMore ? (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="text-xs text-muted underline-offset-2 hover:text-bone hover:underline"
            >
              <T es="¿Quieres que te salude por tu nombre? (opcional)"
                 en="Want me to greet you by name? (optional)" />
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted">
                <T es="Opcional. Si lo dejas, el correo te saludará así: «¡Buenos días, Mauricio!»."
                   en="Optional. If you fill it in, the email will greet you like: “Good morning, Mauricio!”." />
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={trato}
                  onChange={(e) => setTrato(e.target.value)}
                  className="rounded-md border border-edge bg-transparent px-3 py-2 text-sm text-bone outline-none focus:border-bone/50"
                  style={{ flex: "0 0 auto" }}
                >
                  {tratoOptions.map((o) => (
                    <option key={o.v} value={o.v} style={{ color: "#111" }}>
                      {lang === "en" ? o.en : o.es}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={lang === "en" ? "First name" : "Nombre"}
                  className={FIELD_CLS}
                />
              </div>
              <input
                type="text"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                placeholder={lang === "en" ? "Last name(s)" : "Apellidos"}
                className="w-full rounded-md border border-edge bg-transparent px-3 py-2 text-sm text-bone outline-none placeholder:text-muted focus:border-bone/50"
              />
            </div>
          )}
        </form>
      )}

      {status === "error" && (
        <p className="mt-2 text-xs" style={{ color: "#A32D2D" }}>
          <T es="Algo salió mal. Intenta de nuevo." en="Something went wrong. Try again." />
        </p>
      )}
    </div>
  );
}
