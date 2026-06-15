"use client";
// components/SubscribeForm.jsx
import { useState } from "react";
import { useLang, T } from "./Lang";

export default function SubscribeForm() {
  const { lang } = useLang();
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

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
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={lang === "en" ? "you@email.com" : "tu@correo.com"}
            className="min-w-0 flex-1 rounded-md border border-edge bg-transparent px-3 py-2 text-sm text-bone outline-none placeholder:text-muted focus:border-bone/50"
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
