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
const PULSE_SPEED = (2 * Math.PI) / 3;

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

export default function RiskSphere({ height = 274 }) {
  const mountRef   = useRef(null);
  const pressedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 }); // normalised -1..1

  useEffect(() => {
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(THREE => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      const scene  = new THREE.Scene();
      // z=6.5 → frustum half-height at z=0 = tan(22.5°)*6.5 ≈ 2.69 > sphere radius 2.34 → no clipping
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 6.5;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      // Soft dot texture
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

      const home    = genSphere(N, R);
      const colors  = new Float32Array(N * 3).fill(1);
      const jPhase  = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(home.slice(), 3));
      geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.055, map: tex, transparent: true, opacity: 0.75,
        vertexColors: true, sizeAttenuation: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });

      const group = new THREE.Group();
      group.add(new THREE.Points(geometry, material));
      group.scale.set(1.3, 1.3, 1.3);
      scene.add(group);

      const invMat   = new THREE.Matrix4();
      const localCam = new THREE.Vector3();
      const viewDir  = new THREE.Vector3();
      let elapsed = 0, animId, lastFrame = 0;

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < 1000 / 60) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        if (pressedRef.current) {
          // Pointer controls tilt while pressed
          const tx = pointerRef.current.y * 1.2;
          const ty = pointerRef.current.x * Math.PI;
          group.rotation.x += (tx - group.rotation.x) * 0.07;
          group.rotation.y += (ty - group.rotation.y) * 0.07;
        } else {
          // Auto-rotate; x gently decays back to centre
          group.rotation.y += 0.003;
          group.rotation.x += (Math.sin(elapsed * 0.2) * 0.07 - group.rotation.x) * 0.03;
        }

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
          const shimmer = 0.12 * Math.sin(elapsed * 1.8 + jPhase[i]);
          const b = Math.max(0, 0.22 + (facing * 0.5 + 0.5) * 0.72 + shimmer);
          colors[i3] = colors[i3+1] = colors[i3+2] = b;
        }

        material.opacity = 0.715 + Math.sin(elapsed * PULSE_SPEED) * 0.165;
        geometry.attributes.color.needsUpdate = true;
        renderer.render(scene, camera);
      }

      animate();

      // ── Pointer helpers ──
      function updatePointer(clientX, clientY) {
        const rect = container.getBoundingClientRect();
        pointerRef.current = {
          x: ((clientX - rect.left) / rect.width)  * 2 - 1,
          y: -((clientY - rect.top)  / rect.height) * 2 + 1,
        };
      }

      const onDown  = (e) => { pressedRef.current = true;  updatePointer(e.clientX, e.clientY); };
      const onMove  = (e) => { if (pressedRef.current) updatePointer(e.clientX, e.clientY); };
      const onUp    = ()  => { pressedRef.current = false; };
      const onTDown = (e) => { pressedRef.current = true;  updatePointer(e.touches[0].clientX, e.touches[0].clientY); };
      const onTMove = (e) => { if (pressedRef.current) updatePointer(e.touches[0].clientX, e.touches[0].clientY); };
      const onTUp   = ()  => { pressedRef.current = false; };

      container.addEventListener("mousedown",  onDown);
      window.addEventListener("mousemove",     onMove);
      window.addEventListener("mouseup",       onUp);
      container.addEventListener("touchstart", onTDown, { passive: true });
      window.addEventListener("touchmove",     onTMove, { passive: true });
      window.addEventListener("touchend",      onTUp);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(animId);
        container.removeEventListener("mousedown",  onDown);
        window.removeEventListener("mousemove",     onMove);
        window.removeEventListener("mouseup",       onUp);
        container.removeEventListener("touchstart", onTDown);
        window.removeEventListener("touchmove",     onTMove);
        window.removeEventListener("touchend",      onTUp);
        window.removeEventListener("resize",        onResize);
        geometry.dispose(); tex.dispose(); material.dispose(); renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      };
    }).catch(err => console.error("RiskSphere:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height, cursor: "grab" }}
      onMouseDown={() => { if (mountRef.current) mountRef.current.style.cursor = "grabbing"; }}
      onMouseUp={()   => { if (mountRef.current) mountRef.current.style.cursor = "grab"; }}
    />
  );
}
