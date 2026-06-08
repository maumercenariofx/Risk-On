"use client";
import { useEffect, useRef } from "react";

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

function loadThree() {
  if (typeof window !== "undefined" && window.THREE) return Promise.resolve(window.THREE);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${THREE_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.THREE));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = THREE_SRC;
    script.async = true;
    script.onload = () => resolve(window.THREE);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

const PARTICLES        = 9000;
const RADIUS           = 2.4;
const INFLUENCE_RADIUS = 1.2;
const MAX_DISPLACEMENT = 0.55;
const LERP             = 0.07;

function createDotTexture(THREE) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0,   "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.65)");
  g.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Fibonacci sphere (golden-angle spiral) — uniform point density, no pole clustering
function fibonacciSphere(count, radius) {
  const pos  = new Float32Array(count * 3);
  const norm = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    norm[i * 3]     = x;
    norm[i * 3 + 1] = y;
    norm[i * 3 + 2] = z;
    pos[i * 3]     = x * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = z * radius;
  }
  return { pos, norm };
}

export default function TronCanvas() {
  const mountRef = useRef(null);

  useEffect(() => {
    let destroyed = false;
    let cleanup = () => {};

    loadThree().then((THREE) => {
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 6;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      // Particle data: HOME (Fibonacci position), NORM (radial direction == home/radius)
      const { pos: home, norm } = fibonacciSphere(PARTICLES, RADIUS);
      const positions   = home.slice();
      const colors      = new Float32Array(PARTICLES * 3).fill(1);
      const dispState   = new Float32Array(PARTICLES);
      const jitterPhase = new Float32Array(PARTICLES);
      for (let i = 0; i < PARTICLES; i++) jitterPhase[i] = Math.random() * Math.PI * 2;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.05,
        map: createDotTexture(THREE),
        transparent: true,
        opacity: 0.55,
        vertexColors: true,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const group  = new THREE.Group();
      const points = new THREE.Points(geometry, material);
      group.add(points);
      scene.add(group);
      // Nudged off-center so it reads as ambient texture rather than
      // competing with the centered text columns for attention.
      group.position.x = 1.35;

      // Mouse tracked in NDC relative to the container (canvas itself has pointer-events: none)
      const mouse = { x: -10, y: -10, active: false };
      const onMouseMove = (e) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        mouse.active = true;
      };
      const onMouseLeave = () => { mouse.active = false; };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseleave", onMouseLeave);

      const onResize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      const raycaster   = new THREE.Raycaster();
      const ndc         = new THREE.Vector2();
      const invMatrix   = new THREE.Matrix4();
      const localOrigin = new THREE.Vector3();
      const localDir    = new THREE.Vector3();
      const influence   = new THREE.Vector3();
      const localCamPos = new THREE.Vector3();
      const localViewDir = new THREE.Vector3();

      let animId;
      let elapsed = 0;

      function animate() {
        animId = requestAnimationFrame(animate);
        elapsed += 16.7;

        // Continuous slow rotation around Y, with a subtle X tilt that breathes
        group.rotation.y += 0.0008;
        group.rotation.x = Math.sin(elapsed * 0.00015) * 0.06;

        group.updateMatrixWorld();
        invMatrix.copy(group.matrixWorld).invert();

        // View direction in the sphere's local space — drives depth shading
        localCamPos.copy(camera.position).applyMatrix4(invMatrix);
        localViewDir.copy(localCamPos).normalize();

        // Project the cursor onto the sphere (analytic ray/sphere intersection in local space)
        let hasInfluence = false;
        if (mouse.active) {
          ndc.set(mouse.x, mouse.y);
          raycaster.setFromCamera(ndc, camera);
          localOrigin.copy(raycaster.ray.origin).applyMatrix4(invMatrix);
          localDir.copy(raycaster.ray.direction).transformDirection(invMatrix).normalize();

          const b    = 2 * localOrigin.dot(localDir);
          const c    = localOrigin.lengthSq() - RADIUS * RADIUS;
          const disc = b * b - 4 * c;
          if (disc >= 0) {
            const t = (-b - Math.sqrt(disc)) / 2;
            if (t > 0) {
              influence.copy(localDir).multiplyScalar(t).add(localOrigin);
              hasInfluence = true;
            }
          }
        }

        const ix = influence.x, iy = influence.y, iz = influence.z;
        const vx = localViewDir.x, vy = localViewDir.y, vz = localViewDir.z;

        for (let i = 0; i < PARTICLES; i++) {
          const i3 = i * 3;
          const hx = home[i3], hy = home[i3 + 1], hz = home[i3 + 2];
          const nx = norm[i3], ny = norm[i3 + 1], nz = norm[i3 + 2];

          // Outward push along the surface normal, falling off smoothly with distance
          let target = 0;
          if (hasInfluence) {
            const dx = hx - ix, dy = hy - iy, dz = hz - iz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < INFLUENCE_RADIUS) {
              const t = 1 - dist / INFLUENCE_RADIUS;
              const s = t * t * (3 - 2 * t); // smoothstep
              target = s * MAX_DISPLACEMENT;
            }
          }

          // Spring/lerp toward the target — elastic settle back to HOME when influence fades
          let d = dispState[i];
          d += (target - d) * LERP;
          dispState[i] = d;

          // Organic per-particle jitter, scaled by current displacement so idle points stay still
          const jitter = Math.sin(elapsed * 0.004 + jitterPhase[i]) * d * 0.2;
          const total  = d + jitter;

          positions[i3]     = hx + nx * total;
          positions[i3 + 1] = hy + ny * total;
          positions[i3 + 2] = hz + nz * total;

          // Depth shading: dimmer on the far side relative to the camera
          const facing = nx * vx + ny * vy + nz * vz;
          const bright = 0.06 + (facing * 0.5 + 0.5) * 0.44;
          colors[i3] = colors[i3 + 1] = colors[i3 + 2] = bright;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;

        renderer.render(scene, camera);
      }
      animate();

      cleanup = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseleave", onMouseLeave);
        window.removeEventListener("resize", onResize);
        geometry.dispose();
        material.map?.dispose();
        material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }).catch((err) => {
      console.error("Failed to load three.js for TronCanvas:", err);
    });

    return () => {
      destroyed = true;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100%", height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        background: "#000000",
      }}
    >
      <div style={{
        position: "absolute",
        top: 16, right: 20,
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 10,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.18)",
      }}>
        [ ◇ Sphere ]
      </div>
    </div>
  );
}
