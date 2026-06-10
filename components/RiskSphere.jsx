"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  eio, genSphere, genGlobe, genThomas, genChainEdges, makeDotTexture,
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

const N = 12000; // same particle count for every form, enables morphing
const R = 1.8;
const MORPH_S     = 1.2;
const PULSE_SPEED = (2 * Math.PI) / 3;
const IR          = 0.7;    // half the previous size
const REPEL_F     = 0.52;
const ATTRACT_F   = 0.546;  // 30% stronger than before
const IDLE_MS     = 600;
const LERP_D      = 0.065;

const RiskSphere = forwardRef(function RiskSphere({ height = 274 }, ref) {
  const mountRef    = useRef(null);
  const pointerRef  = useRef({ x: 0, y: 0 });
  const selectRef   = useRef(null);

  useImperativeHandle(ref, () => ({
    select: (idx) => selectRef.current?.(idx),
  }), []);

  useEffect(() => {
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(THREE => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 6.5;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const tex = makeDotTexture(THREE);

      const HOMES = [
        genSphere(N, R),
        genGlobe(N, R),
        genThomas(N),
      ];

      const prevHome = HOMES[0].slice();
      const effHome  = HOMES[0].slice();
      let currHome   = HOMES[0];
      let currentIdx = 0;
      let morphT     = 1;

      const pos     = effHome.slice();   // displaced positions
      const disp    = new Float32Array(N * 3);
      const colors  = new Float32Array(N * 3).fill(1);
      const jPhase  = new Float32Array(N);
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

      // Wireframe — draws the attractor's trajectory as a continuous curve
      // through phase space. Only shown (and meaningful) for the attractors.
      const wireGeom = new THREE.BufferGeometry();
      wireGeom.setAttribute("position", posAttr);
      wireGeom.setIndex(new THREE.BufferAttribute(genChainEdges(N), 1));
      const wireMat  = new THREE.LineBasicMaterial({ color: 0xF5F5F2, transparent: true, opacity: 0 });
      const wireMesh = new THREE.LineSegments(wireGeom, wireMat);
      group.add(wireMesh);

      selectRef.current = (idx) => {
        if (idx === currentIdx && morphT >= 1) return;
        prevHome.set(effHome);
        currHome   = HOMES[idx];
        currentIdx = idx;
        morphT     = 0;
      };

      // Mouse state
      const mouse = { x: 0, y: 0, active: false, lastMove: 0, mode: "repel", attractStart: 0 };

      // Pre-allocated vectors
      const invMat    = new THREE.Matrix4();
      const localCam  = new THREE.Vector3();
      const viewDir   = new THREE.Vector3();
      const raycaster = new THREE.Raycaster();
      const ndc       = new THREE.Vector2();
      const localO    = new THREE.Vector3();
      const localD    = new THREE.Vector3();
      const infPt     = new THREE.Vector3();

      let elapsed = 0, animId, lastFrame = 0;

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < 1000 / 60) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        group.rotation.y += 0.003;
        group.rotation.x += (Math.sin(elapsed * 0.2) * 0.07 - group.rotation.x) * 0.03;

        group.updateMatrixWorld();
        invMat.copy(group.matrixWorld).invert();
        localCam.copy(camera.position).applyMatrix4(invMat);
        viewDir.copy(localCam).normalize();

        // Idle → attract transition
        const now = Date.now();
        if (mouse.active && now - mouse.lastMove >= IDLE_MS && mouse.mode === "repel") {
          mouse.mode = "attract";
          mouse.attractStart = now;
        }

        // Ray → sphere intersection in local space (for influence center)
        let hasInf = false, ix = 0, iy = 0, iz = 0;
        if (mouse.active) {
          ndc.set(mouse.x, mouse.y);
          raycaster.setFromCamera(ndc, camera);
          localO.copy(raycaster.ray.origin).applyMatrix4(invMat);
          localD.copy(raycaster.ray.direction).transformDirection(invMat).normalize();
          const b    = 2 * localO.dot(localD);
          const c    = localO.lengthSq() - R * R;
          const disc = b * b - 4 * c;
          if (disc >= 0) {
            const sq = Math.sqrt(disc);
            const t  = (-b - sq) / 2 > 0 ? (-b - sq) / 2 : (-b + sq) / 2;
            if (t > 0) {
              infPt.copy(localD).multiplyScalar(t).add(localO);
              hasInf = true; ix = infPt.x; iy = infPt.y; iz = infPt.z;
            }
          }
        }

        const vx = viewDir.x, vy = viewDir.y, vz = viewDir.z;
        const attractAccum = mouse.mode === "attract" && mouse.attractStart > 0
          ? Math.min(3, (now - mouse.attractStart) / 400) : 0;
        const LD = mouse.mode === "attract" ? 0.08 : LERP_D;

        // Morph effHome toward currHome
        if (morphT < 1) morphT = Math.min(1, morphT + dt / MORPH_S);
        const mt = eio(morphT);
        for (let i = 0; i < N * 3; i++) {
          effHome[i] = prevHome[i] + (currHome[i] - prevHome[i]) * mt;
        }

        for (let i = 0; i < N; i++) {
          const i3 = i * 3;
          const hx = effHome[i3], hy = effHome[i3+1], hz = effHome[i3+2];

          let tdx = 0, tdy = 0, tdz = 0;
          if (hasInf) {
            const dx = hx - ix, dy = hy - iy, dz = hz - iz;
            const d2 = dx*dx + dy*dy + dz*dz;
            if (d2 < IR * IR) {
              const dist = Math.sqrt(d2);
              const t = 1 - dist / IR;
              const s = t * t * (3 - 2 * t); // smoothstep

              if (mouse.mode === "repel") {
                // Wave ripple pushing particles outward
                const len = Math.max(0.01, dist);
                const j   = Math.sin(elapsed * 4 + jPhase[i]) * 0.1 * s;
                tdx = (dx/len) * s * REPEL_F + j;
                tdy = (dy/len) * s * REPEL_F;
                tdz = (dz/len) * s * REPEL_F;
              } else {
                // Vortex: pull inward + circular orbit (the "black hole" swirl)
                const af      = s * ATTRACT_F * Math.min(attractAccum, 2) * 0.22;
                const swirl   = s * 0.38;
                const orbitT  = elapsed * 2.5 + jPhase[i];
                tdx = -dx * af + swirl * Math.cos(orbitT);
                tdy = -dy * af * 0.28;
                tdz = -dz * af + swirl * Math.sin(orbitT);
              }
            }
          }

          disp[i3]   += (tdx - disp[i3])   * LD;
          disp[i3+1] += (tdy - disp[i3+1]) * LD;
          disp[i3+2] += (tdz - disp[i3+2]) * LD;

          pos[i3]   = hx + disp[i3];
          pos[i3+1] = hy + disp[i3+1];
          pos[i3+2] = hz + disp[i3+2];

          // Lighting using home position for stable normals
          const len    = Math.sqrt(hx*hx + hy*hy + hz*hz) || 1;
          const facing = (hx/len)*vx + (hy/len)*vy + (hz/len)*vz;
          const shimmer = 0.12 * Math.sin(elapsed * 1.8 + jPhase[i]);
          const b = Math.max(0, 0.22 + (facing * 0.5 + 0.5) * 0.72 + shimmer);
          colors[i3] = colors[i3+1] = colors[i3+2] = b;
        }

        // Wireframe: traces the attractor's path, only shown for the Thomas form
        const wireTarget = currentIdx === 2 ? 0.35 : 0;
        wireMat.opacity += (wireTarget - wireMat.opacity) * 0.07;

        material.opacity = 0.715 + Math.sin(elapsed * PULSE_SPEED) * 0.165;
        posAttr.needsUpdate                   = true;
        geometry.attributes.color.needsUpdate = true;
        renderer.render(scene, camera);
      }

      animate();

      // ── Mouse tracking ──
      const onMove = (e) => {
        const rect = container.getBoundingClientRect();
        mouse.x        = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y        = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        mouse.lastMove = Date.now();
        if (mouse.mode === "attract") { mouse.mode = "repel"; mouse.attractStart = 0; }
        mouse.active   = true;
        pointerRef.current = { x: mouse.x, y: mouse.y };
      };
      const onLeave = () => { mouse.active = false; mouse.mode = "repel"; mouse.attractStart = 0; };

      container.addEventListener("mousemove",  onMove);
      container.addEventListener("mouseleave", onLeave);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(animId);
        container.removeEventListener("mousemove",  onMove);
        container.removeEventListener("mouseleave", onLeave);
        window.removeEventListener("resize",        onResize);
        geometry.dispose(); wireGeom.dispose();
        tex.dispose(); material.dispose(); wireMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
        selectRef.current = null;
      };
    }).catch(err => console.error("RiskSphere:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height }} />;
});

export default RiskSphere;
