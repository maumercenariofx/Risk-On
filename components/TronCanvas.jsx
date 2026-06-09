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

// ─── Constants ───────────────────────────────────────────────────────────────
const N          = 30375;
const SR         = 2.4;    // sphere radius
const IR         = 1.2;    // mouse influence radius
const REPEL_F    = 0.55;   // max repel displacement
const ATTRACT_F  = 0.45;   // max attract displacement factor
const IDLE_MS    = 600;    // ms before repel → attract
const MORPH_S    = 1.5;    // morph duration in seconds
const LERP_D     = 0.065;  // displacement lerp factor
// FORMS preserved in code: DNA, ATOM, SPHERE — only VORONOI active
const VORONOI_SEEDS = 80;
const VORONOI_K     = 7;

// ─── Utilities ───────────────────────────────────────────────────────────────
const eio = t => t < 0.5 ? 2*t*t : 1 - 2*(1-t)*(1-t);

// Inline risk scorer (mirrors lib/riskIndex.js weights, no import needed)
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

// 3-stop gradient 0=red → 50=amber → 100=green, returns [r,g,b] each 0-1
function scoreToRGB(score) {
  const stops = [
    [0.639, 0.176, 0.176], // 0   — #A32D2D red
    [0.729, 0.459, 0.090], // 50  — #BA7517 amber
    [0.059, 0.541, 0.373], // 100 — #0F8A5F green
  ];
  const t  = Math.max(0, Math.min(100, score)) / 100;
  const lo = t < 0.5 ? 0 : 1;
  const f  = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return stops[lo].map((c, i) => c + (stops[lo + 1][i] - c) * f);
}

function makeDotTexture(THREE) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,   "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ─── Form generators ─────────────────────────────────────────────────────────

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

function genDNA(n) {
  const pos      = new Float32Array(n * 3);
  const HELIX_R  = 1.55; // radius from center axis to each strand
  const HELIX_H  = 4.6;  // total vertical height
  const TURNS    = 3.5;  // complete rotations
  const RUNGS    = Math.round(TURNS * 10); // ~35 base-pair rungs

  const strandN  = Math.floor(n * 0.44);          // per strand
  const rungTot  = n - 2 * strandN;               // remaining for cross-links
  const perRung  = Math.max(2, Math.floor(rungTot / RUNGS));

  let pi = 0;

  // Strand A
  for (let i = 0; i < strandN; i++) {
    const t = i / (strandN - 1);
    const a = t * TURNS * Math.PI * 2;
    pos[pi*3]   = Math.cos(a) * HELIX_R;
    pos[pi*3+1] = (t - 0.5) * HELIX_H;
    pos[pi*3+2] = Math.sin(a) * HELIX_R;
    pi++;
  }

  // Strand B — offset by π (180°)
  for (let i = 0; i < strandN; i++) {
    const t = i / (strandN - 1);
    const a = t * TURNS * Math.PI * 2 + Math.PI;
    pos[pi*3]   = Math.cos(a) * HELIX_R;
    pos[pi*3+1] = (t - 0.5) * HELIX_H;
    pos[pi*3+2] = Math.sin(a) * HELIX_R;
    pi++;
  }

  // Rungs (base pairs connecting the two strands)
  for (let r = 0; r < RUNGS && pi < n; r++) {
    const t  = r / (RUNGS - 1);
    const a  = t * TURNS * Math.PI * 2;
    const y  = (t - 0.5) * HELIX_H;
    const ax = Math.cos(a)          * HELIX_R;
    const az = Math.sin(a)          * HELIX_R;
    const bx = Math.cos(a + Math.PI) * HELIX_R;
    const bz = Math.sin(a + Math.PI) * HELIX_R;
    for (let k = 0; k < perRung && pi < n; k++) {
      const s     = perRung > 1 ? k / (perRung - 1) : 0.5;
      pos[pi*3]   = ax + (bx - ax) * s;
      pos[pi*3+1] = y;
      pos[pi*3+2] = az + (bz - az) * s;
      pi++;
    }
  }

  // Fill any overflow back onto strand A
  while (pi < n) {
    const t = Math.random();
    const a = t * TURNS * Math.PI * 2;
    pos[pi*3]   = Math.cos(a) * HELIX_R;
    pos[pi*3+1] = (t - 0.5) * HELIX_H;
    pos[pi*3+2] = Math.sin(a) * HELIX_R;
    pi++;
  }

  return pos;
}

function genVoronoi(n) {
  const SEEDS = VORONOI_SEEDS, K = VORONOI_K;
  const seeds = [];
  while (seeds.length < SEEDS) {
    const x = (Math.random() - 0.5) * SR * 2.2;
    const y = (Math.random() - 0.5) * SR * 2.2;
    const z = (Math.random() - 0.5) * SR * 2.2;
    if (x*x + y*y + z*z < SR * SR * 1.15) seeds.push([x, y, z]);
  }

  // k-NN edges (deduplicated)
  const edgeSet = new Set(), edges = [];
  for (let i = 0; i < SEEDS; i++) {
    const dists = seeds
      .map((s, j) => {
        if (i === j) return { j, d: Infinity };
        const dx = seeds[i][0]-s[0], dy = seeds[i][1]-s[1], dz = seeds[i][2]-s[2];
        return { j, d: Math.sqrt(dx*dx + dy*dy + dz*dz) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, K);
    for (const { j } of dists) {
      const key = Math.min(i,j) + "_" + Math.max(i,j);
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([i, j]); }
    }
  }

  // Distribute particles along edges weighted by length
  const lens    = edges.map(([a, b]) => {
    const dx = seeds[a][0]-seeds[b][0], dy = seeds[a][1]-seeds[b][1], dz = seeds[a][2]-seeds[b][2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  });
  const totalLen = lens.reduce((a, b) => a + b, 0);

  const pos = new Float32Array(n * 3);
  let pi = 0;
  for (let e = 0; e < edges.length; e++) {
    const cnt = Math.round((lens[e] / totalLen) * n);
    const [a, b] = edges[e];
    for (let k = 0; k < cnt && pi < n; k++) {
      const t = cnt > 1 ? k / (cnt - 1) : 0.5;
      pos[pi*3]   = seeds[a][0] + (seeds[b][0] - seeds[a][0]) * t;
      pos[pi*3+1] = seeds[a][1] + (seeds[b][1] - seeds[a][1]) * t;
      pos[pi*3+2] = seeds[a][2] + (seeds[b][2] - seeds[a][2]) * t;
      pi++;
    }
  }
  while (pi < n) {
    const e = Math.floor(Math.random() * edges.length);
    const [a, b] = edges[e]; const t = Math.random();
    pos[pi*3]   = seeds[a][0] + (seeds[b][0] - seeds[a][0]) * t;
    pos[pi*3+1] = seeds[a][1] + (seeds[b][1] - seeds[a][1]) * t;
    pos[pi*3+2] = seeds[a][2] + (seeds[b][2] - seeds[a][2]) * t;
    pi++;
  }
  return pos;
}

// Ring position math: lx,ly in ring plane → tilt by rx (X-axis) then rz (Z-axis)
function ringPos(a, b, rx, rz, phi, buf, i) {
  const lx = a * Math.cos(phi);
  const ly = b * Math.sin(phi);
  const cy = ly * Math.cos(rx), cz = ly * Math.sin(rx);
  buf[i*3]   = lx * Math.cos(rz) - cy * Math.sin(rz);
  buf[i*3+1] = lx * Math.sin(rz) + cy * Math.cos(rz);
  buf[i*3+2] = cz;
}

const ATOM_RINGS = [
  { a: 2.2, b: 2.2, rx: 0,              rz: 0           },
  { a: 2.0, b: 2.0, rx: Math.PI / 3,   rz: 0           },
  { a: 2.1, b: 2.1, rx: -Math.PI / 4,  rz: Math.PI / 4 },
  { a: 1.8, b: 1.8, rx: Math.PI / 2,   rz: Math.PI / 6 },
];

function genAtom(n) {
  const nucleusN = Math.round(n * 0.06);
  const ringN    = n - nucleusN;
  const perRing  = Math.round(ringN / ATOM_RINGS.length);
  const phases   = new Float32Array(n);
  const rIdx     = new Uint8Array(n).fill(255); // 255 = nucleus
  const pos      = new Float32Array(n * 3);

  let pi = 0;
  for (let r = 0; r < ATOM_RINGS.length; r++) {
    const { a, b, rx, rz } = ATOM_RINGS[r];
    const cnt = r < ATOM_RINGS.length - 1 ? perRing : (ringN - perRing * (ATOM_RINGS.length - 1));
    for (let k = 0; k < cnt && pi < n - nucleusN; k++) {
      const phi = (k / Math.max(1, cnt)) * Math.PI * 2;
      phases[pi] = phi;
      rIdx[pi]   = r;
      ringPos(a, b, rx, rz, phi, pos, pi);
      pi++;
    }
  }
  // Nucleus: dense random cluster at center
  for (; pi < n; pi++) {
    const r2 = 0.25 * Math.cbrt(Math.random());
    const u  = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    pos[pi*3]   = r2 * Math.sin(ph) * Math.cos(th);
    pos[pi*3+1] = r2 * Math.cos(ph);
    pos[pi*3+2] = r2 * Math.sin(ph) * Math.sin(th);
  }
  return { pos, phases, rIdx };
}

function tickAtom(home, phases, rIdx, elapsed, n) {
  const speed = 0.35;
  for (let i = 0; i < n; i++) {
    if (rIdx[i] === 255) continue;
    const { a, b, rx, rz } = ATOM_RINGS[rIdx[i]];
    ringPos(a, b, rx, rz, phases[i] + elapsed * speed, home, i);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function TronCanvas() {
  const mountRef    = useRef(null);

  useEffect(() => {  // eslint-disable-line react-hooks/exhaustive-deps
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(THREE => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      // Renderer + camera
      const scene    = new THREE.Scene();
      const camera   = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 6;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 1);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      // Form home positions (DNA/ATOM/genSphere preserved for future use)
      const voronoiHome = genVoronoi(N);
      const atomData    = genAtom(N); // keep in memory, not active
      void atomData;

      // Particle buffers
      const positions    = voronoiHome.slice();
      const colors       = new Float32Array(N * 3).fill(1);
      const disp         = new Float32Array(N * 3);
      const jPhase       = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      // Morph state (single form — no cycling)
      const prevHome    = voronoiHome.slice();
      const effHome     = voronoiHome.slice();
      const currHome    = voronoiHome;
      const morphT_ref  = { v: 1.0 };
      const currentForm = "VORONOI";

      // Geometry + material
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.05, map: makeDotTexture(THREE),
        transparent: true, opacity: 0.6,
        vertexColors: true, sizeAttenuation: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });

      const group = new THREE.Group();
      group.add(new THREE.Points(geometry, material));
      group.position.x = 0;
      group.scale.set(0.62, 0.62, 0.62);
      scene.add(group);

      // Mouse state
      const mouse = { x: 0, y: 0, active: false, lastMove: 0, mode: "repel", attractStart: 0 };
      const onMove = e => {
        const rect = container.getBoundingClientRect();
        mouse.x        = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y        = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        mouse.lastMove = Date.now();
        if (mouse.mode === "attract") { mouse.mode = "repel"; mouse.attractStart = 0; }
        mouse.active   = true;
      };
      const onLeave = () => { mouse.active = false; mouse.mode = "repel"; mouse.attractStart = 0; };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseleave", onLeave);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener("resize", onResize);

      // Reusable Three objects
      const raycaster = new THREE.Raycaster();
      const ndc       = new THREE.Vector2();
      const invMat    = new THREE.Matrix4();
      const localO    = new THREE.Vector3();
      const localD    = new THREE.Vector3();
      const infPt     = new THREE.Vector3();
      const localCam  = new THREE.Vector3();
      const viewDir   = new THREE.Vector3();

      let elapsed = 0, animId;
      let lastFrame = 0;

      // Throttle to ~30fps when tab is hidden to save GPU under backdrop-filter cards
      const targetFPS  = () => document.hidden ? 30 : 60;
      const frameDelay = () => 1000 / targetFPS();

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < frameDelay()) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05); // cap at 50ms to avoid jumps
        lastFrame = ts;
        elapsed += dt;

        group.rotation.y += 0.0008;
        group.rotation.x  = Math.sin(elapsed * 0.15) * 0.06;

        // Morph (single form, morphT stays at 1.0 — lerp is instant)
        if (morphT_ref.v < 1) morphT_ref.v = Math.min(1, morphT_ref.v + dt / MORPH_S);
        const mt = eio(morphT_ref.v);
        for (let i = 0; i < N * 3; i++) {
          effHome[i] = prevHome[i] + (currHome[i] - prevHome[i]) * mt;
        }

        // Mouse idle → attract mode
        const now = Date.now();
        if (mouse.active) {
          if (now - mouse.lastMove >= IDLE_MS && mouse.mode === "repel") {
            mouse.mode = "attract";
            mouse.attractStart = now;
          }
        }

        // Analytic ray → sphere intersection in group local space
        group.updateMatrixWorld();
        invMat.copy(group.matrixWorld).invert();
        localCam.copy(camera.position).applyMatrix4(invMat);
        viewDir.copy(localCam).normalize();

        let hasInf = false, ix = 0, iy = 0, iz = 0;
        if (mouse.active) {
          ndc.set(mouse.x, mouse.y);
          raycaster.setFromCamera(ndc, camera);
          localO.copy(raycaster.ray.origin).applyMatrix4(invMat);
          localD.copy(raycaster.ray.direction).transformDirection(invMat).normalize();

          const b    = 2 * localO.dot(localD);
          const c    = localO.lengthSq() - SR * SR;
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

        for (let i = 0; i < N; i++) {
          const i3 = i * 3;
          const hx = effHome[i3], hy = effHome[i3+1], hz = effHome[i3+2];

          // Target displacement from mouse
          let tdx = 0, tdy = 0, tdz = 0;
          if (hasInf) {
            const dx = hx - ix, dy = hy - iy, dz = hz - iz;
            const d2 = dx*dx + dy*dy + dz*dz;
            if (d2 < IR * IR) {
              const dist = Math.sqrt(d2);
              const t = 1 - dist / IR;
              const s = t * t * (3 - 2 * t); // smoothstep
              if (mouse.mode === "repel") {
                const len = Math.max(0.01, dist);
                const j   = Math.sin(elapsed * 4 + jPhase[i]) * 0.1 * s;
                tdx = (dx / len) * s * REPEL_F + j;
                tdy = (dy / len) * s * REPEL_F;
                tdz = (dz / len) * s * REPEL_F;
              } else {
                // Black-hole: inward pull + continuous swirl so particles never freeze
                const af      = s * ATTRACT_F * Math.min(attractAccum, 2) * 0.22;
                const swirl   = s * 0.38;
                const orbitT  = elapsed * 2.5 + jPhase[i];
                tdx = -dx * af + swirl * Math.cos(orbitT);
                tdy = -dy * af * 0.28;
                tdz = -dz * af + swirl * Math.sin(orbitT);
              }
            }
          }

          // Ease displacement toward target (springs back to 0 when no influence)
          disp[i3]   += (tdx - disp[i3])   * LD;
          disp[i3+1] += (tdy - disp[i3+1]) * LD;
          disp[i3+2] += (tdz - disp[i3+2]) * LD;

          positions[i3]   = hx + disp[i3];
          positions[i3+1] = hy + disp[i3+1];
          positions[i3+2] = hz + disp[i3+2];

          // Depth shading via dot product with view direction
          const len = Math.sqrt(hx*hx + hy*hy + hz*hz) || 1;
          const facing  = (hx/len)*vx + (hy/len)*vy + (hz/len)*vz;
          // Per-particle shimmer — pure white
          const shimmer = 0.18 * Math.sin(elapsed * 2.0 + jPhase[i]);
          const b       = Math.max(0, 0.18 + (facing * 0.5 + 0.5) * 0.78 + shimmer);
          colors[i3]   = b;
          colors[i3+1] = b;
          colors[i3+2] = b;
        }

        // Global breath: ~8.5s cycle (was 4.5s)
        material.opacity = 0.46 + Math.sin(elapsed * 0.74) * 0.40;

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate     = true;
        renderer.render(scene, camera);
      }

      animate();

      cleanup = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseleave", onLeave);
        window.removeEventListener("resize", onResize);
        geometry.dispose();
        material.map?.dispose();
        material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      };
    }).catch(err => console.error("TronCanvas:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#000" }}
    />
  );
}
