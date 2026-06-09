"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

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

const N = 12000;
const R = 1.8;

function quickRiskScore(d) {
  if (!d) return 50;
  const cl  = (x) => Math.max(0, Math.min(100, x));
  const fg  = (v, calm, panic) => cl(100 - (v - calm) / (panic - calm) * 100);
  const dol = (v, weak, str)   => cl(100 - (v - weak)  / (str - weak)  * 100);
  return Math.round(
    fg(d.vix    ?? 20,  12,   35)  * 0.35 +
    dol(d.dxy   ?? 104, 99,  108)  * 0.22 +
    fg(d.move   ?? 100, 70,  140)  * 0.18 +
    fg(d.us10y  ?? 4.3, 3.5, 5.0) * 0.15 +
    fg(d.mxnVol ?? 9,   7,   16)   * 0.10
  );
}

function scoreToRGB(score) {
  const stops = [
    [0.639, 0.176, 0.176],
    [0.729, 0.459, 0.090],
    [0.059, 0.541, 0.373],
  ];
  const t  = Math.max(0, Math.min(100, score)) / 100;
  const lo = t < 0.5 ? 0 : 1;
  const f  = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return stops[lo].map((c, i) => c + (stops[lo + 1][i] - c) * f);
}

function accentHex(score) {
  if (score >= 58) return "#3FA77E";
  if (score < 42)  return "#A32D2D";
  return "#8A8A8E";
}

function riskLabel(score) {
  if (score >= 75) return { es: "Risk-on fuerte",       en: "Strong risk-on" };
  if (score >= 58) return { es: "Risk-on moderado",     en: "Moderate risk-on" };
  if (score >= 42) return { es: "Neutral",              en: "Neutral" };
  if (score >= 25) return { es: "Neutral, con cautela", en: "Leaning cautious" };
  return               { es: "Risk-off / miedo",     en: "Risk-off / fear" };
}

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

export default function RiskSphere() {
  const { lang } = useLang();
  const mountRef  = useRef(null);
  const scoreRef  = useRef(50);
  const [display, setDisplay] = useState(0);
  const [score,   setScore]   = useState(50);

  // Fetch market data + animate counter
  useEffect(() => {
    fetch("/api/market")
      .then(r => r.json())
      .then(d => {
        const s = quickRiskScore(d);
        setScore(s);
        scoreRef.current = s;
        let n = 0;
        const iv = setInterval(() => {
          n += 2;
          if (n >= s) { n = s; clearInterval(iv); }
          setDisplay(n);
          scoreRef.current = n;
        }, 22);
        return () => clearInterval(iv);
      })
      .catch(() => {});
  }, []);

  // Three.js sphere
  useEffect(() => {
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(THREE => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 5;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      // Dot texture
      const sz  = 48;
      const cvs = document.createElement("canvas");
      cvs.width = cvs.height = sz;
      const ctx = cvs.getContext("2d");
      const g   = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
      g.addColorStop(0,   "rgba(255,255,255,1)");
      g.addColorStop(0.4, "rgba(255,255,255,0.6)");
      g.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz);
      const tex = new THREE.CanvasTexture(cvs);

      const home      = genSphere(N, R);
      const positions = home.slice();
      const colors    = new Float32Array(N * 3).fill(1);
      const jPhase    = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.055, map: tex, transparent: true, opacity: 0.7,
        vertexColors: true, sizeAttenuation: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });

      const group = new THREE.Group();
      group.add(new THREE.Points(geometry, material));
      scene.add(group);

      const invMat  = new THREE.Matrix4();
      const localCam = new THREE.Vector3();
      const viewDir  = new THREE.Vector3();
      let elapsed = 0, animId, lastFrame = 0;

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < 1000 / 60) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        group.rotation.y += 0.003;
        group.rotation.x  = Math.sin(elapsed * 0.2) * 0.07;

        const sc = scoreRef.current;
        const [cr, cg, cb] = scoreToRGB(sc);

        group.updateMatrixWorld();
        invMat.copy(group.matrixWorld).invert();
        localCam.copy(camera.position).applyMatrix4(invMat);
        viewDir.copy(localCam).normalize();
        const vx = viewDir.x, vy = viewDir.y, vz = viewDir.z;

        for (let i = 0; i < N; i++) {
          const i3 = i * 3;
          const hx = home[i3], hy = home[i3+1], hz = home[i3+2];
          const len    = Math.sqrt(hx*hx + hy*hy + hz*hz) || 1;
          const facing = (hx/len)*vx + (hy/len)*vy + (hz/len)*vz;
          const shimmer = 0.15 * Math.sin(elapsed * 1.8 + jPhase[i]);
          const b = Math.max(0, 0.14 + (facing * 0.5 + 0.5) * 0.82 + shimmer);
          colors[i3]   = cr * b;
          colors[i3+1] = cg * b;
          colors[i3+2] = cb * b;
        }

        const pulseSpeed = 0.74 + (1 - sc / 100) * 1.2;
        material.opacity = 0.44 + Math.sin(elapsed * pulseSpeed) * 0.38;
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
        geometry.dispose(); tex.dispose(); material.dispose(); renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      };
    }).catch(err => console.error("RiskSphere:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  const label  = riskLabel(score);
  const color  = accentHex(score);

  return (
    <div className="tron-glow reveal" style={{
      position: "relative",
      background: "rgba(11,11,12,0.92)",
      border: "1px solid #1E1E20",
      borderRadius: 16,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px 16px 18px",
      animationDelay: "0.08s",
    }}>
      {/* Eyebrow */}
      <div style={{ fontSize: 10, letterSpacing: 3, color: "#4A4A50", textTransform: "uppercase", marginBottom: 4 }}>
        &mdash; <T es="Sentimiento" en="Sentiment" />
      </div>

      {/* Canvas */}
      <div ref={mountRef} style={{ width: "100%", flex: 1, minHeight: 200 }} />

      {/* Score overlay */}
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 48, fontWeight: 500,
          lineHeight: 1, color: "#F5F5F2",
        }}>
          {display}
          <span style={{ fontSize: 13, color: "#2E2E32", marginLeft: 3 }}>/100</span>
        </div>
        <div style={{
          marginTop: 7, fontSize: 10, textTransform: "uppercase",
          letterSpacing: 2, color,
        }}>
          <T es={label.es} en={label.en} />
        </div>
      </div>
    </div>
  );
}
