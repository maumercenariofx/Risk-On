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

const N            = 14000;
const SR           = 2.4;
const IR           = 1.2;
const REPEL_F      = 0.55;
const ATTRACT_F    = 0.45;
const IDLE_MS      = 600;
const LERP_D       = 0.065;
const VORONOI_SEEDS = 80;
const VORONOI_K     = 7;

function genVoronoi(n) {
  const seeds = [];
  while (seeds.length < VORONOI_SEEDS) {
    const x = (Math.random() - 0.5) * SR * 2.2;
    const y = (Math.random() - 0.5) * SR * 2.2;
    const z = (Math.random() - 0.5) * SR * 2.2;
    if (x*x + y*y + z*z < SR * SR * 1.15) seeds.push([x, y, z]);
  }
  const edgeSet = new Set(), edges = [];
  for (let i = 0; i < VORONOI_SEEDS; i++) {
    seeds
      .map((s, j) => {
        if (i === j) return { j, d: Infinity };
        const dx = seeds[i][0]-s[0], dy = seeds[i][1]-s[1], dz = seeds[i][2]-s[2];
        return { j, d: Math.sqrt(dx*dx + dy*dy + dz*dz) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, VORONOI_K)
      .forEach(({ j }) => {
        const key = Math.min(i,j) + "_" + Math.max(i,j);
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([i, j]); }
      });
  }
  const lens     = edges.map(([a, b]) => {
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

// Transparent Voronoi-only background — no button, no cycling, no black background
export default function VoronoiBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(THREE => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100);
      camera.position.z = 6;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 1); // solid black — backdrop-filter blurs actual particles
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      // Dot texture
      const sz  = 64;
      const cvs = document.createElement("canvas");
      cvs.width = cvs.height = sz;
      const ctx = cvs.getContext("2d");
      const g   = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0,   "rgba(255,255,255,1)");
      g.addColorStop(0.4, "rgba(255,255,255,0.6)");
      g.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz);
      const tex = new THREE.CanvasTexture(cvs);

      const home      = genVoronoi(N);
      const positions = home.slice();
      const colors    = new Float32Array(N * 3).fill(1);
      const disp      = new Float32Array(N * 3);
      const jPhase    = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.05, map: tex, transparent: true, opacity: 0.5,
        vertexColors: true, sizeAttenuation: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });

      const group = new THREE.Group();
      group.add(new THREE.Points(geometry, material));
      group.scale.set(0.90, 0.90, 0.90);
      scene.add(group);

      const mouse = { x: 0, y: 0, active: false, lastMove: 0, mode: "repel", attractStart: 0 };
      const onMove = (e) => {
        const rect = container.getBoundingClientRect();
        mouse.x        = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y        = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        mouse.lastMove = Date.now();
        if (mouse.mode === "attract") { mouse.mode = "repel"; mouse.attractStart = 0; }
        mouse.active   = true;
      };
      const onLeave = () => { mouse.active = false; mouse.mode = "repel"; mouse.attractStart = 0; };
      container.addEventListener("mousemove", onMove);
      container.addEventListener("mouseleave", onLeave);

      const raycaster = new THREE.Raycaster();
      const ndc       = new THREE.Vector2();
      const invMat    = new THREE.Matrix4();
      const localO    = new THREE.Vector3();
      const localD    = new THREE.Vector3();
      const infPt     = new THREE.Vector3();
      const localCam  = new THREE.Vector3();
      const viewDir   = new THREE.Vector3();

      let elapsed = 0, animId, lastFrame = 0;

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        const fps = document.hidden ? 30 : 60;
        if (ts - lastFrame < 1000 / fps) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        group.rotation.y += 0.0008;
        group.rotation.x  = Math.sin(elapsed * 0.15) * 0.06;

        group.updateMatrixWorld();
        invMat.copy(group.matrixWorld).invert();
        localCam.copy(camera.position).applyMatrix4(invMat);
        viewDir.copy(localCam).normalize();

        const now = Date.now();
        if (mouse.active && now - mouse.lastMove >= IDLE_MS && mouse.mode === "repel") {
          mouse.mode = "attract"; mouse.attractStart = now;
        }

        let hasInf = false, ix = 0, iy = 0, iz = 0;
        if (mouse.active) {
          ndc.set(mouse.x, mouse.y);
          raycaster.setFromCamera(ndc, camera);
          localO.copy(raycaster.ray.origin).applyMatrix4(invMat);
          localD.copy(raycaster.ray.direction).transformDirection(invMat).normalize();
          const b = 2 * localO.dot(localD);
          const c = localO.lengthSq() - SR * SR;
          const disc = b*b - 4*c;
          if (disc >= 0) {
            const sq = Math.sqrt(disc);
            const t  = (-b - sq) / 2 > 0 ? (-b - sq) / 2 : (-b + sq) / 2;
            if (t > 0) { infPt.copy(localD).multiplyScalar(t).add(localO); hasInf = true; ix = infPt.x; iy = infPt.y; iz = infPt.z; }
          }
        }

        const vx = viewDir.x, vy = viewDir.y, vz = viewDir.z;
        const attractAccum = mouse.mode === "attract" && mouse.attractStart > 0
          ? Math.min(3, (now - mouse.attractStart) / 400) : 0;
        const LD = mouse.mode === "attract" ? 0.08 : LERP_D;

        for (let i = 0; i < N; i++) {
          const i3 = i * 3;
          const hx = home[i3], hy = home[i3+1], hz = home[i3+2];
          let tdx = 0, tdy = 0, tdz = 0;
          if (hasInf) {
            const dx = hx-ix, dy = hy-iy, dz = hz-iz;
            const d2 = dx*dx + dy*dy + dz*dz;
            if (d2 < IR * IR) {
              const dist = Math.sqrt(d2);
              const t = 1 - dist / IR;
              const s = t * t * (3 - 2 * t);
              if (mouse.mode === "repel") {
                const len = Math.max(0.01, dist);
                const j   = Math.sin(elapsed * 4 + jPhase[i]) * 0.1 * s;
                tdx = (dx/len)*s*REPEL_F + j; tdy = (dy/len)*s*REPEL_F; tdz = (dz/len)*s*REPEL_F;
              } else {
                const af    = s * ATTRACT_F * Math.min(attractAccum, 2) * 0.22;
                const swirl = s * 0.38;
                const orbitT = elapsed * 2.5 + jPhase[i];
                tdx = -dx*af + swirl*Math.cos(orbitT); tdy = -dy*af*0.28; tdz = -dz*af + swirl*Math.sin(orbitT);
              }
            }
          }
          disp[i3]   += (tdx - disp[i3])   * LD;
          disp[i3+1] += (tdy - disp[i3+1]) * LD;
          disp[i3+2] += (tdz - disp[i3+2]) * LD;
          positions[i3]   = hx + disp[i3];
          positions[i3+1] = hy + disp[i3+1];
          positions[i3+2] = hz + disp[i3+2];

          const len    = Math.sqrt(hx*hx + hy*hy + hz*hz) || 1;
          const facing = (hx/len)*vx + (hy/len)*vy + (hz/len)*vz;
          const shimmer = 0.18 * Math.sin(elapsed * 2.0 + jPhase[i]);
          const b = Math.max(0, 0.18 + (facing * 0.5 + 0.5) * 0.78 + shimmer);
          colors[i3] = colors[i3+1] = colors[i3+2] = b;
        }

        material.opacity = 0.38 + Math.sin(elapsed * 0.74) * 0.22;
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate     = true;
        renderer.render(scene, camera);
      }

      animate();

      // ResizeObserver handles both window resize and container height changes
      const ro = new ResizeObserver(() => {
        camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });
      ro.observe(container);

      cleanup = () => {
        cancelAnimationFrame(animId);
        container.removeEventListener("mousemove", onMove);
        container.removeEventListener("mouseleave", onLeave);
        ro.disconnect();
        geometry.dispose(); tex.dispose(); material.dispose(); renderer.dispose();
        if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      };
    }).catch(err => console.error("VoronoiBackground:", err));

    return () => { destroyed = true; cleanup(); };
  }, []);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />;
}
