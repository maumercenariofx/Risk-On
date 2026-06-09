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
  const pointerRef = useRef({ x: 0, y: 0 }); // NDC -1..1

  useEffect(() => {
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(THREE => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 6.5; // frustum half = tan(22.5°)*6.5 ≈ 2.69 > sphere radius 2.34

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

      const home   = genSphere(N, R);
      const pos    = home.slice(); // mutable positions — modified by black-hole effect
      const colors = new Float32Array(N * 3).fill(1);
      const jPhase = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      const geometry = new THREE.BufferGeometry();
      const posAttr  = new THREE.BufferAttribute(pos, 3);
      geometry.setAttribute("position", posAttr);
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

      // Pre-allocated vectors (avoid GC pressure)
      const invMat   = new THREE.Matrix4();
      const localCam = new THREE.Vector3();
      const viewDir  = new THREE.Vector3();
      const _near    = new THREE.Vector3();
      const _far     = new THREE.Vector3();
      const _rDir    = new THREE.Vector3();
      const _hitL    = new THREE.Vector3();

      let elapsed = 0, animId, lastFrame = 0;

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < 1000 / 60) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        // Slow rotation while pressing so the hole stays "still"
        const rotSpeed = pressedRef.current ? 0.0006 : 0.003;
        group.rotation.y += rotSpeed;
        group.rotation.x += (Math.sin(elapsed * 0.2) * 0.07 - group.rotation.x) * 0.03;

        group.updateMatrixWorld();
        invMat.copy(group.matrixWorld).invert();
        localCam.copy(camera.position).applyMatrix4(invMat);
        viewDir.copy(localCam).normalize();
        const vx = viewDir.x, vy = viewDir.y, vz = viewDir.z;

        // ── Black-hole attraction ──
        let ax = 0, ay = 0, az = 0, doAttract = false;
        if (pressedRef.current) {
          const mx = pointerRef.current.x, my = pointerRef.current.y;

          // Unproject mouse to world-space ray
          _near.set(mx, my, -1).unproject(camera);
          _far.set(mx, my,  1).unproject(camera);
          _rDir.copy(_far).sub(_near).normalize();

          // Ray-sphere intersection (world sphere: center=origin, radius=R*scale=2.34)
          const RS  = R * 1.3;
          const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
          const dx = _rDir.x, dy = _rDir.y, dz = _rDir.z;
          const b   = ox*dx + oy*dy + oz*dz;
          const c   = ox*ox + oy*oy + oz*oz - RS*RS;
          const disc = b*b - c;

          if (disc >= 0) {
            const t = -b - Math.sqrt(disc); // entry (front face)
            _hitL.set(ox + dx*t, oy + dy*t, oz + dz*t).applyMatrix4(invMat);
          } else {
            // Ray missed — project closest ray point onto sphere surface in world space
            const t = -(ox*dx + oy*dy + oz*dz);
            _hitL.set(ox + dx*t, oy + dy*t, oz + dz*t);
            const l = _hitL.length() || 1;
            _hitL.multiplyScalar(RS / l);
            _hitL.applyMatrix4(invMat);
          }
          ax = _hitL.x; ay = _hitL.y; az = _hitL.z;
          doAttract = true;
        }

        // ── Per-particle update ──
        for (let i = 0; i < N; i++) {
          const i3 = i * 3;

          if (doAttract) {
            // Pull toward attraction point — stronger the closer the particle is
            const ddx = ax - pos[i3], ddy = ay - pos[i3+1], ddz = az - pos[i3+2];
            const dist2 = ddx*ddx + ddy*ddy + ddz*ddz;
            const force = Math.min(0.18, 2.2 / (dist2 + 0.25));
            pos[i3]   += ddx * force;
            pos[i3+1] += ddy * force;
            pos[i3+2] += ddz * force;
          } else {
            // Snap back to sphere surface
            pos[i3]   += (home[i3]   - pos[i3])   * 0.06;
            pos[i3+1] += (home[i3+1] - pos[i3+1]) * 0.06;
            pos[i3+2] += (home[i3+2] - pos[i3+2]) * 0.06;
          }

          // Lighting (use current pos for normal approximation)
          const px = pos[i3], py = pos[i3+1], pz = pos[i3+2];
          const len    = Math.sqrt(px*px + py*py + pz*pz) || 1;
          const facing = (px/len)*vx + (py/len)*vy + (pz/len)*vz;
          const shimmer = 0.12 * Math.sin(elapsed * 1.8 + jPhase[i]);
          const b = Math.max(0, 0.22 + (facing * 0.5 + 0.5) * 0.72 + shimmer);
          colors[i3] = colors[i3+1] = colors[i3+2] = b;
        }

        material.opacity = 0.715 + Math.sin(elapsed * PULSE_SPEED) * 0.165;
        posAttr.needsUpdate              = true;
        geometry.attributes.color.needsUpdate = true;
        renderer.render(scene, camera);
      }

      animate();

      // ── Pointer tracking ──
      function updatePointer(clientX, clientY) {
        const rect = container.getBoundingClientRect();
        pointerRef.current = {
          x:  ((clientX - rect.left) / rect.width)  * 2 - 1,
          y: -((clientY - rect.top)  / rect.height) * 2 + 1,
        };
      }

      const onDown  = (e) => { pressedRef.current = true;  updatePointer(e.clientX, e.clientY); };
      const onMove  = (e) => { if (pressedRef.current) updatePointer(e.clientX, e.clientY); };
      const onUp    = ()  => { pressedRef.current = false; };
      const onTDown = (e) => { pressedRef.current = true;  updatePointer(e.touches[0].clientX, e.touches[0].clientY); };
      const onTMove = (e) => { if (pressedRef.current) updatePointer(e.touches[0].clientX, e.touches[0].clientY); };
      const onTUp   = ()  => { pressedRef.current = false; };

      const isTouch = window.matchMedia?.("(pointer: coarse)").matches ?? false;

      container.addEventListener("mousedown",  onDown);
      window.addEventListener("mousemove",     onMove);
      window.addEventListener("mouseup",       onUp);
      // Touch interaction disabled on mobile to avoid scroll conflicts
      if (!isTouch) {
        container.addEventListener("touchstart", onTDown, { passive: true });
        window.addEventListener("touchmove",     onTMove, { passive: true });
        window.addEventListener("touchend",      onTUp);
      }

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
        if (!isTouch) {
          container.removeEventListener("touchstart", onTDown);
          window.removeEventListener("touchmove",     onTMove);
          window.removeEventListener("touchend",      onTUp);
        }
        window.removeEventListener("resize",        onResize);
        geometry.dispose(); tex.dispose(); material.dispose(); renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      };
    }).catch(err => console.error("RiskSphere:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height }} />;
}
