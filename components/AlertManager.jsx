"use client";
// components/AlertManager.jsx
// Gestor de alertas Pro (/alertas). Dos modos:
//  - Sin token en la URL: pitch + form para pedir el link firmado por correo.
//  - Con ?u=&t= válidos: panel — niveles de TC (add/re-arm/borrar), número de
//    WhatsApp y estado de las alertas de tendencia (siempre activas en Pro).
// Los deep-links se leen de location.search al montar (patrón del sitio).
import { useEffect, useState, useCallback } from "react";
import { useLang, T } from "./Lang";

const MONO = { fontFamily: "var(--font-mono)" };

export default function AlertManager() {
  const { lang } = useLang();
  const [creds, setCreds] = useState(null); // {u, t}
  const [data, setData] = useState(null); // {wa, status, alerts}
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [linkMsg, setLinkMsg] = useState(null);
  const [level, setLevel] = useState("");
  const [direction, setDirection] = useState("above");
  const [wa, setWa] = useState("");

  const load = useCallback(async (u, t) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/alerts?u=${encodeURIComponent(u)}&t=${t}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      setData(j);
      setWa(j.wa || "");
    } catch (e) {
      setErr(String(e.message || e));
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const u = q.get("u");
    const t = q.get("t");
    if (u && t) {
      setCreds({ u, t });
      load(u, t);
    }
  }, [load]);

  const post = async (body) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, u: creds.u, t: creds.t }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      await load(creds.u, creds.t);
    } catch (e) {
      setErr(String(e.message || e));
      setBusy(false);
    }
  };

  const requestLink = async (e) => {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", email }),
    }).catch(() => {});
    setBusy(false);
    setLinkMsg(true);
  };

  const label = (es, en) => (lang === "en" ? en : es);

  // ── Modo pitch + solicitud de link ──────────────────────────────────────────
  if (!creds) {
    return (
      <div className="card-glass rounded-xl border border-edge p-6">
        <div style={{ ...MONO, fontSize: 9.5, letterSpacing: 2, color: "#8A8A8E", textTransform: "uppercase", marginBottom: 10 }}>
          <T es="Acceso Pro" en="Pro access" />
        </div>
        <p className="mb-4 text-sm text-muted">
          <T
            es="Si ya eres Pro, escribe tu correo y te mandamos tu link personal de gestión. ¿Aún no? El tier Pro está en acceso anticipado — pide el tuyo respondiendo a cualquier Pre-Market."
            en="Already Pro? Enter your email and we'll send your personal management link. Not yet? The Pro tier is in early access — request yours by replying to any Pre-Market."
          />
        </p>
        {linkMsg ? (
          <p className="text-sm" style={{ color: "#19C39B" }}>
            <T es="Si tu correo es Pro, el link va en camino — revisa tu bandeja." en="If your email is Pro, the link is on its way — check your inbox." />
          </p>
        ) : (
          <form onSubmit={requestLink} className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={label("tu@correo.com", "you@email.com")}
              className="min-w-[220px] flex-1 rounded-md border border-line bg-black px-3 py-2 text-sm text-bone outline-none focus:border-bone/40"
            />
            <button
              disabled={busy}
              className="rounded-md border border-bone/50 bg-white/10 px-4 py-2 text-sm font-medium text-bone transition-colors hover:bg-white/15"
            >
              <T es="Mandar mi link" en="Send my link" />
            </button>
          </form>
        )}
      </div>
    );
  }

  // ── Panel de gestión ────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="card-glass rounded-xl border border-edge p-6 text-sm text-muted">
        {err ? (
          <span style={{ color: "#CE5555" }}>
            <T es="Link inválido o acceso vencido — pide uno nuevo abajo." en="Invalid link or expired access — request a new one below." /> ({err})
          </span>
        ) : (
          <T es="Cargando tus alertas…" en="Loading your alerts…" />
        )}
      </div>
    );
  }

  const active = data.alerts.filter((a) => a.status === "active");
  const fired = data.alerts.filter((a) => a.status === "fired");

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CE555566", color: "#CE5555" }}>
          {err}
        </div>
      )}

      {/* Tendencia: siempre activa en Pro */}
      <div className="card-glass rounded-xl border border-edge p-5">
        <div style={{ ...MONO, fontSize: 9.5, letterSpacing: 2, color: "#8A8A8E", textTransform: "uppercase", marginBottom: 8 }}>
          <T es="Cambios de tendencia" en="Trend changes" />
        </div>
        <p className="text-sm text-muted">
          <span style={{ color: "#19C39B" }}>●</span>{" "}
          <T
            es="Activas: te avisamos cada vez que el índice Risk On cruza de banda (p.ej. CONSTRUCTIVE → DEFENSIVE)."
            en="Active: we alert you whenever the Risk On index crosses a band (e.g. CONSTRUCTIVE → DEFENSIVE)."
          />
        </p>
      </div>

      {/* Niveles de TC */}
      <div className="card-glass rounded-xl border border-edge p-5">
        <div style={{ ...MONO, fontSize: 9.5, letterSpacing: 2, color: "#8A8A8E", textTransform: "uppercase", marginBottom: 10 }}>
          <T es="Tus niveles de USD/MXN" en="Your USD/MXN levels" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (level) post({ action: "add", level, direction }).then(() => setLevel(""));
          }}
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          <input
            type="number"
            step="0.0001"
            min="10"
            max="30"
            required
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="17.6500"
            className="w-32 rounded-md border border-line bg-black px-3 py-2 text-sm text-bone outline-none focus:border-bone/40"
            style={MONO}
          />
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="rounded-md border border-edge bg-black px-2 py-2 text-sm text-bone outline-none"
          >
            <option value="above">{label("Si sube a ese nivel", "If it rises to it")}</option>
            <option value="below">{label("Si baja a ese nivel", "If it falls to it")}</option>
          </select>
          <button
            disabled={busy}
            className="rounded-md border border-bone/50 bg-white/10 px-4 py-2 text-sm font-medium text-bone transition-colors hover:bg-white/15"
          >
            <T es="Agregar" en="Add" />
          </button>
        </form>

        {active.length === 0 && fired.length === 0 && (
          <p className="text-sm text-muted">
            <T es="Sin niveles configurados — agrega el primero arriba." en="No levels yet — add your first one above." />
          </p>
        )}

        {[...active, ...fired].map((a) => (
          <div
            key={a.id}
            className="row-hover flex items-center justify-between gap-3 border-b border-edge/60 py-2.5 last:border-none"
          >
            <span style={{ ...MONO, fontSize: 13, color: a.status === "active" ? "#F5F5F2" : "#5A5A62" }}>
              {Number(a.level).toFixed(4)}{" "}
              <span style={{ fontSize: 10.5, color: "#8A8A8E" }}>
                {a.direction === "above" ? "▲ " + label("al alza", "upside") : "▼ " + label("a la baja", "downside")}
                {a.status === "fired" && ` · ${label("DISPARADA", "FIRED")} ${String(a.fired_at || "").slice(0, 16)}`}
              </span>
            </span>
            <span className="flex gap-2">
              {a.status === "fired" && (
                <button
                  onClick={() => post({ action: "rearm", id: a.id })}
                  className="rounded-md border border-edge px-2.5 py-1 text-xs text-muted transition-colors hover:text-bone"
                >
                  <T es="Re-armar" en="Re-arm" />
                </button>
              )}
              <button
                onClick={() => post({ action: "remove", id: a.id })}
                aria-label={label("Quitar nivel", "Remove level")}
                className="rounded-md border border-edge px-2.5 py-1 text-xs text-muted transition-colors hover:text-bone"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>

      {/* WhatsApp */}
      <div className="card-glass rounded-xl border border-edge p-5">
        <div style={{ ...MONO, fontSize: 9.5, letterSpacing: 2, color: "#8A8A8E", textTransform: "uppercase", marginBottom: 8 }}>
          WhatsApp
        </div>
        <p className="mb-3 text-sm text-muted">
          <T
            es="Con número guardado, las alertas llegan por WhatsApp; sin número (o si WhatsApp falla), por correo."
            en="With a saved number, alerts arrive via WhatsApp; without one (or if WhatsApp fails), via email."
          />
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            post({ action: "wa", wa });
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="tel"
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder="+5215512345678"
            className="w-52 rounded-md border border-line bg-black px-3 py-2 text-sm text-bone outline-none focus:border-bone/40"
            style={MONO}
          />
          <button
            disabled={busy}
            className="rounded-md border border-edge px-4 py-2 text-sm text-muted transition-colors hover:text-bone"
          >
            <T es="Guardar" en="Save" />
          </button>
        </form>
      </div>
    </div>
  );
}
