"use client";
import { useEffect, useRef, useState } from "react";
import { T } from "./Lang";

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

function loadThree() {
  if (typeof window !== "undefined" && window.THREE) return Promise.resolve(window.THREE);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${THREE_SRC}"]`);
    if (existing) {
      if (window.THREE) return resolve(window.THREE);
      existing.addEventListener("load", () => resolve(window.THREE));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = THREE_SRC; s.async = true;
    s.onload = () => resolve(window.THREE);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const COLS = 90, ROWS = 90;
const N    = COLS * ROWS; // 8100 — same particle count for every form, enables morphing
const MORPH_S = 1.2;
const eio = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

// ── Form generators ────────────────────────────────────────────────────────

// Fibonacci sphere — every particle is a possible future price path under GBM.
function genSphere(n, r) {
  const pos = new Float32Array(n * 3);
  const ga  = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y   = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th  = ga * i;
    pos[i*3]   = Math.cos(th) * rad * r;
    pos[i*3+1] = y * r;
    pos[i*3+2] = Math.sin(th) * rad * r;
  }
  return pos;
}

// Implied volatility surface sigma(K,T): smile across strike, steepens near T->0.
function genVolSurface(n, cols, rows) {
  const pos = new Float32Array(n * 3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const u = col / (cols - 1);
      const v = row / (rows - 1);
      const K = (u - 0.5) * 5;     // strike, centered on ATM
      const T = 0.05 + v * 1.95;   // time to maturity (years)
      let sigma = 0.16 + (0.06 * K * K) / (T + 0.15) - 0.015 * K;
      sigma = Math.max(0.08, Math.min(0.85, sigma));
      pos[i*3]   = K * 0.7;
      pos[i*3+1] = (sigma - 0.32) * 3.2;
      pos[i*3+2] = (T - 1.0) * 1.0;
    }
  }
  return pos;
}

// Hyperbolic saddle — curved portfolio space (Fisher information metric).
function genSaddle(n, cols, rows) {
  const pos = new Float32Array(n * 3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const u = col / (cols - 1);
      const v = row / (rows - 1);
      const x = (u - 0.5) * 3.6;
      const z = (v - 0.5) * 3.6;
      pos[i*3]   = x;
      pos[i*3+1] = (x * x - z * z) * 0.32;
      pos[i*3+2] = z;
    }
  }
  return pos;
}

// Edge list for the COLSxROWS grid — used to draw a wireframe mesh over the
// vol surface / saddle so they read as surfaces, not just a cloud of points.
function genGridEdges(cols, rows) {
  const edges = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (col < cols - 1) edges.push(i, i + 1);
      if (row < rows - 1) edges.push(i, i + cols);
    }
  }
  return new Uint32Array(edges);
}

// Geodesic across the saddle — the path a quant rebalancer would follow.
function genGeodesic(numPts) {
  const pos = new Float32Array(numPts * 3);
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const x = (t - 0.5) * 3.6;
    const z = 1.5 * Math.sin(Math.PI * t);
    pos[i*3]   = x;
    pos[i*3+1] = (x * x - z * z) * 0.32 + 0.03;
    pos[i*3+2] = z;
  }
  return pos;
}

function makeDotTexture(THREE) {
  const size = 48;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0,   "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export const FORMS = [
  {
    id: "SPHERE",
    label_es: "Movimiento Browniano", label_en: "Brownian Motion",
    formula: "dS = μS·dt + σS·dW",
    es: "Cada partícula traza una posible trayectoria futura del precio: tendencia más ruido aleatorio. Es el motor detrás de Black-Scholes y de la simulación Monte Carlo de derivados.",
    en: "Each particle traces a possible future price path: drift plus random noise. It's the engine behind Black-Scholes and Monte Carlo derivatives pricing.",
  },
  {
    id: "VOLSURFACE",
    label_es: "Superficie de Volatilidad", label_en: "Volatility Surface",
    formula: "σ(K, T)",
    es: "La volatilidad implícita no es plana: forma una \"sonrisa\" en el eje del strike (K) — el mercado cobra más por movimientos extremos — y se empina cerca del vencimiento (T) cuando hay eventos próximos.",
    en: "Implied volatility isn't flat: it forms a \"smile\" across strikes (K) — the market prices in fatter tails — and steepens near expiry (T) ahead of upcoming events.",
  },
  {
    id: "SADDLE",
    label_es: "Geometría de Riesgo (Fisher)", label_en: "Risk Geometry (Fisher)",
    formula: "gᵢⱼ = E[∂ᵢlnL · ∂ⱼlnL]",
    es: "Los fondos cuant modelan las correlaciones de un portafolio como una superficie curva (silla hiperbólica). Para rebalancear no trazan una línea recta: siguen la geodésica — la ruta que minimiza la fricción al moverse por ese espacio.",
    en: "Quant funds model portfolio correlations as a curved surface (hyperbolic saddle). To rebalance they don't move in a straight line — they follow the geodesic, the path that minimizes friction across that space.",
  },
];

export default function QuantLab() {
  const mountRef = useRef(null);
  const selectFnRef = useRef(null);
  const [formIdx, setFormIdx] = useState(0);

  useEffect(() => {
    let destroyed = false;
    let cleanup = () => {};

    loadThree().then((THREE) => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.set(0, 0.6, 6);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const HOMES = [
        genSphere(N, 1.8),
        genVolSurface(N, COLS, ROWS),
        genSaddle(N, COLS, ROWS),
      ];

      const positions = HOMES[0].slice();
      const colors    = new Float32Array(N * 3).fill(1);
      const jPhase    = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      const prevHome = HOMES[0].slice();
      const effHome  = HOMES[0].slice();
      let currHome   = HOMES[0];
      let currentIdx = 0;
      let morphT     = 1;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.05, map: makeDotTexture(THREE),
        transparent: true, opacity: 0.7,
        vertexColors: true, sizeAttenuation: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });

      const group = new THREE.Group();
      group.add(new THREE.Points(geometry, material));
      group.scale.set(1.15, 1.15, 1.15);
      scene.add(group);

      // Wireframe mesh over the grid — only meaningful (and shown) for the
      // vol surface / saddle, where adjacent indices are spatial neighbors.
      // Shares the same position attribute, so it morphs along with the points.
      const posAttr  = geometry.attributes.position;
      const wireGeom = new THREE.BufferGeometry();
      wireGeom.setAttribute("position", posAttr);
      wireGeom.setIndex(new THREE.BufferAttribute(genGridEdges(COLS, ROWS), 1));
      const wireMat  = new THREE.LineBasicMaterial({ color: 0xF5F5F2, transparent: true, opacity: 0 });
      const wireMesh = new THREE.LineSegments(wireGeom, wireMat);
      group.add(wireMesh);

      // Geodesic line — only relevant (and visible) for the SADDLE form
      const geoPos  = genGeodesic(160);
      const geoGeom = new THREE.BufferGeometry();
      geoGeom.setAttribute("position", new THREE.BufferAttribute(geoPos, 3));
      const geoMat  = new THREE.LineBasicMaterial({ color: 0xBA7517, transparent: true, opacity: 0 });
      const geoLine = new THREE.Line(geoGeom, geoMat);
      group.add(geoLine);

      let elapsed = 0, animId, lastFrame = 0;

      selectFnRef.current = (idx) => {
        if (idx === currentIdx && morphT >= 1) return;
        prevHome.set(effHome);
        currHome   = HOMES[idx];
        currentIdx = idx;
        morphT     = 0;
        setFormIdx(idx);
      };

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < 1000 / 60) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        group.rotation.y += 0.0016;
        group.rotation.x  = Math.sin(elapsed * 0.18) * 0.12;

        if (morphT < 1) morphT = Math.min(1, morphT + dt / MORPH_S);
        const mt = eio(morphT);
        for (let i = 0; i < N * 3; i++) {
          effHome[i] = prevHome[i] + (currHome[i] - prevHome[i]) * mt;
        }

        for (let i = 0; i < N; i++) {
          const i3 = i * 3;
          const hx = effHome[i3], hy = effHome[i3+1], hz = effHome[i3+2];
          positions[i3]   = hx;
          positions[i3+1] = hy;
          positions[i3+2] = hz;

          const len = Math.sqrt(hx*hx + hy*hy + hz*hz) || 1;
          const facing  = (hx/len)*0 + (hy/len)*0.4 + (hz/len)*0.6;
          const shimmer = 0.12 * Math.sin(elapsed * 1.6 + jPhase[i]);
          const b = Math.max(0, 0.25 + (facing * 0.5 + 0.5) * 0.7 + shimmer);
          colors[i3] = colors[i3+1] = colors[i3+2] = b;
        }

        // Wireframe: shown for the vol surface / saddle grids, hidden for the sphere
        const wireTarget = currentIdx !== 0 ? 0.4 : 0;
        wireMat.opacity += (wireTarget - wireMat.opacity) * 0.07;

        // Geodesic line: only fades in once the saddle has mostly morphed in
        const geoTarget = (currentIdx === 2 && morphT > 0.5) ? 0.95 : 0;
        geoMat.opacity += (geoTarget - geoMat.opacity) * 0.07;

        material.opacity = 0.55 + Math.sin(elapsed * (2 * Math.PI / 4)) * 0.1;
        posAttr.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        renderer.render(scene, camera);
      }
      animate();

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", onResize);
        geometry.dispose(); wireGeom.dispose(); geoGeom.dispose();
        material.map?.dispose(); material.dispose(); wireMat.dispose(); geoMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
        selectFnRef.current = null;
      };
    }).catch((err) => console.error("QuantLab:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  const form = FORMS[formIdx];

  return (
    <div className="reveal">
      <div
        className="tron-glow"
        style={{ position: "relative", height: 280, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div ref={mountRef} style={{ position: "absolute", inset: 0, background: "#000" }} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {FORMS.map((f, i) => (
          <button
            key={f.id}
            onClick={() => selectFnRef.current?.(i)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
              padding: "7px 11px", borderRadius: 7, cursor: "pointer",
              background: i === formIdx ? "rgba(245,245,242,0.08)" : "rgba(11,11,12,0.92)",
              border: `1px solid ${i === formIdx ? "#3A3A3E" : "#1E1E20"}`,
              color: i === formIdx ? "#F5F5F2" : "#8A8A8E",
              transition: "all .2s",
            }}
          >
            <T es={f.label_es} en={f.label_en} />
          </button>
        ))}
      </div>

      <div
        className="card-glass"
        style={{ marginTop: 10, background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12, padding: "14px 16px" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50" }}>
            <T es={form.label_es} en={form.label_en} />
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 13, color: "#F5F5F2",
            background: "rgba(255,255,255,0.04)", border: "1px solid #1E1E20",
            borderRadius: 6, padding: "3px 9px",
          }}>
            {form.formula}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#8A8A8E", lineHeight: 1.7 }}>
          <T es={form.es} en={form.en} />
        </p>
      </div>
    </div>
  );
}
