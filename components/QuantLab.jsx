"use client";
import { useEffect, useRef, useState } from "react";
import { T } from "./Lang";
import {
  eio, genSphere, genGlobe, genThomas, genChainEdges,
  makeDotTexture, FORMS,
} from "../lib/quantForms";

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

const N = 48600; // same particle count for every form, enables morphing
const MORPH_S = 1.2;

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

      const globe = genGlobe(N, 1.8);
      const HOMES = [
        genSphere(N, 1.8),
        globe.pos,
        genThomas(N),
      ];
      const globeKind = globe.kind;

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

      // Wireframe — draws the attractor's trajectory as a continuous curve
      // through phase space. Only shown (and meaningful) for the attractors.
      const posAttr  = geometry.attributes.position;
      const wireGeom = new THREE.BufferGeometry();
      wireGeom.setAttribute("position", posAttr);
      wireGeom.setIndex(new THREE.BufferAttribute(genChainEdges(N), 1));
      const wireMat  = new THREE.LineBasicMaterial({ color: 0xF5F5F2, transparent: true, opacity: 0 });
      const wireMesh = new THREE.LineSegments(wireGeom, wireMat);
      group.add(wireMesh);

      let globeColorT = 0;
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

          if (globeColorT > 0.001) {
            const k = globeKind[i];
            let tr, tg, tb;
            if (k === 2) {
              tr = tg = tb = 0.75 + b * 0.5; // border — bright white
            } else if (k === 1) {
              tr = 0.28 + b * 0.45; tg = tb = 0.18 + b * 0.3; // land — red-gray
            } else {
              tr = tg = tb = 0.5 + b * 0.6; // ocean — white
            }
            colors[i3]   = b + (tr - b) * globeColorT;
            colors[i3+1] = b + (tg - b) * globeColorT;
            colors[i3+2] = b + (tb - b) * globeColorT;
          } else {
            colors[i3] = colors[i3+1] = colors[i3+2] = b;
          }
        }

        // Wireframe: traces the attractor's path, only shown for the Thomas form
        const wireTarget = currentIdx === 2 ? 0.4 : 0;
        wireMat.opacity += (wireTarget - wireMat.opacity) * 0.07;

        // Land/ocean/border tinting, only shown for the GLOBE form
        const globeTarget = currentIdx === 1 ? 1 : 0;
        globeColorT += (globeTarget - globeColorT) * 0.07;

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
        geometry.dispose(); wireGeom.dispose();
        material.map?.dispose(); material.dispose(); wireMat.dispose();
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
