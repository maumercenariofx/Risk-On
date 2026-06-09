"use client";
import { useEffect, useRef } from "react";

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

function scoreToRGB(score) {
  const stops = [
    [0.639, 0.176, 0.176], // 0   red
    [0.729, 0.459, 0.090], // 50  amber
    [0.059, 0.541, 0.373], // 100 green
  ];
  const t  = Math.max(0, Math.min(100, score)) / 100;
  const lo = t < 0.5 ? 0 : 1;
  const f  = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return stops[lo].map((c, i) => c + (stops[lo + 1][i] - c) * f);
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

export default function RiskSphere({ score = 50 }) {
  const mountRef = useRef(null);
  const scoreRef = useRef(score);

  // Keep ref in sync without re-running Three.js effect
  useEffect(() => { scoreRef.current = score; }, [score]);

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
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, sz, sz);
      const tex = new THREE.CanvasTexture(cvs);

      // Geometry
      const home      = genSphere(N, R);
      const positions = home.slice();
      const colors    = new Float32Array(N * 3).fill(1);
      const jPhase    = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.055, map: tex,
        transparent: true, opacity: 0.7,
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
        lastFrame = ts;
        elapsed  += dt;

        group.rotation.y += 0.003;
        group.rotation.x  = Math.sin(elapsed * 0.2) * 0.07;

        const sc        = scoreRef.current;
        const [cr, cg, cb] = scoreToRGB(sc);

        group.updateMatrixWorld();
        invMat.copy(group.matrixWorld).invert();
        localCam.copy(camera.position).applyMatrix4(invMat);
        viewDir.copy(localCam).normalize();
        const vx = viewDir.x, vy = viewDir.y, vz = viewDir.z;

        for (let i = 0; i < N; i++) {
          const i3 = i * 3;
          const hx = home[i3], hy = home[i3+1], hz = home[i3+2];
          const len     = Math.sqrt(hx*hx + hy*hy + hz*hz) || 1;
          const facing  = (hx/len)*vx + (hy/len)*vy + (hz/len)*vz;
          const shimmer = 0.15 * Math.sin(elapsed * 1.8 + jPhase[i]);
          const b       = Math.max(0, 0.14 + (facing * 0.5 + 0.5) * 0.82 + shimmer);
          colors[i3]   = cr * b;
          colors[i3+1] = cg * b;
          colors[i3+2] = cb * b;
        }

        // Pulse: agitated (fast) when risk-off, calm (slow) when risk-on
        const pulseSpeed    = 0.74 + (1 - sc / 100) * 1.2;
        material.opacity    = 0.44 + Math.sin(elapsed * pulseSpeed) * 0.38;

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
        geometry.dispose();
        tex.dispose();
        material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      };
    }).catch(err => console.error("RiskSphere:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  return (
    <div ref={mountRef} style={{ width: "100%", height: 210, position: "relative" }} />
  );
}
