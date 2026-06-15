"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  genGlobe, makeDotTexture,
  makeGeoTexture, makeCountryDataUniform, latLonToDir,
  GLOBE_VERTEX_SHADER, GLOBE_FRAGMENT_SHADER,
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

const N = 144000;
const R = 1.8;
const FOCUS_LERP = 0.06;

// Hover effect: while the cursor is MOVING, nearby particles are pushed
// outward (repel/crater). If the cursor stays still for IDLE_THRESHOLD,
// it flips to "black hole" mode — particles get sucked inward with
// growing force + a swirl, forming a void. Moving again snaps back to
// repel and everything springs home with inertia (overdamped, no bounce).
const HOVER_RADIUS       = 0.2275;
const HOVER_RADIUS2      = HOVER_RADIUS * HOVER_RADIUS;
const IDLE_THRESHOLD     = 0.6;
const REPEL_ACCEL        = 14;
const ATTRACT_ACCEL_BASE = 6;
const ATTRACT_ACCEL_GROWTH = 18;
const ATTRACT_RAMP       = 1.5;
const SWIRL_FRAC         = 0.4;
const SPRING_K           = 9;
const DAMPING            = 0.88;

const RiskSphere = forwardRef(function RiskSphere({ height = 274 }, ref) {
  const mountRef    = useRef(null);
  const selectRef   = useRef(null);

  useImperativeHandle(ref, () => ({
    focusCountry: (lat, lon) => selectRef.current?.focusCountry(lat, lon),
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
      const geoTex = makeGeoTexture(THREE);

      const home    = genGlobe(N, R);
      const effHome = home.slice();

      // Per-particle hover-displacement state (local space, pre-group-scale).
      const dispX = new Float32Array(N), dispY = new Float32Array(N), dispZ = new Float32Array(N);
      const velX  = new Float32Array(N), velY  = new Float32Array(N), velZ  = new Float32Array(N);

      const jPhase  = new Float32Array(N);
      for (let i = 0; i < N; i++) jPhase[i] = Math.random() * Math.PI * 2;

      const geometry = new THREE.BufferGeometry();
      const posAttr  = new THREE.BufferAttribute(effHome, 3);
      geometry.setAttribute("position", posAttr);
      geometry.setAttribute("jPhase",   new THREE.BufferAttribute(jPhase, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uMap:           { value: geoTex },
          uDot:           { value: tex },
          uColorT:        { value: 1 },
          uOpacity:       { value: 0.715 },
          uCountryData:   { value: makeCountryDataUniform(THREE) },
          uPixelsPerUnit: { value: 1 },
          uPixelRatio:    { value: Math.min(window.devicePixelRatio, 2) },
          uSize:          { value: 0.019 },
          uTime:          { value: 0 },
          uLightDir:      { value: new THREE.Vector3(0, 0, 0) },
          uUseViewFacing: { value: 1 },
          uBrightBase:    { value: 0.22 },
          uBrightScale:   { value: 0.72 },
          uShimmerSpeed:  { value: 1.8 },
        },
        vertexShader: GLOBE_VERTEX_SHADER,
        fragmentShader: GLOBE_FRAGMENT_SHADER,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });

      const updatePixelsPerUnit = () => {
        const fovRad = THREE.MathUtils.degToRad(camera.fov);
        material.uniforms.uPixelsPerUnit.value = (container.clientHeight / 2) / Math.tan(fovRad / 2);
      };
      updatePixelsPerUnit();

      const group = new THREE.Group();
      group.add(new THREE.Points(geometry, material));
      group.scale.set(1.3, 1.3, 1.3);
      scene.add(group);

      // Country-focus animation target (radians, group.rotation.y).
      let focusTarget = null;

      selectRef.current = {
        focusCountry: (lat, lon) => {
          const d = latLonToDir(lat, lon);
          focusTarget = -Math.atan2(d.x, d.z);
        },
      };

      // ── Hover effect state ──
      let elapsed = 0, animId, lastFrame = 0;
      let mouseActive = false;
      let lastMoveAt  = 0;
      const mouseNDC    = new THREE.Vector2();
      const mouseLocal  = new THREE.Vector3();
      const raycaster   = new THREE.Raycaster();
      const hitSphere   = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R);
      const hitPoint    = new THREE.Vector3();
      const localMatrix = new THREE.Matrix4();

      const onPointerMove = (e) => {
        const rect = container.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        if (Math.abs(nx - mouseNDC.x) > 1e-4 || Math.abs(ny - mouseNDC.y) > 1e-4) {
          lastMoveAt = elapsed;
        }
        mouseNDC.x = nx; mouseNDC.y = ny;
        mouseActive = true;
      };
      const onPointerLeave = () => { mouseActive = false; };
      const onPointerDown  = (e) => { onPointerMove(e); lastMoveAt = elapsed; };
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerleave", onPointerLeave);
      // Touch has no hover/leave — track the finger while down and release
      // on lift/cancel so the effect works the same way on mobile.
      container.addEventListener("pointerdown",   onPointerDown);
      container.addEventListener("pointerup",     onPointerLeave);
      container.addEventListener("pointercancel", onPointerLeave);

      function animate(ts = 0) {
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < 1000 / 60) return;
        const dt = Math.min((ts - lastFrame) / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        if (focusTarget !== null) {
          // Shortest-path turn toward the selected country, recentering tilt.
          let dyaw = (focusTarget - group.rotation.y) % (2 * Math.PI);
          if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
          if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
          group.rotation.y += dyaw * FOCUS_LERP;
          group.rotation.x += (0 - group.rotation.x) * FOCUS_LERP;
          if (Math.abs(dyaw) < 0.003 && Math.abs(group.rotation.x) < 0.003) {
            group.rotation.y = focusTarget;
            group.rotation.x = 0;
            focusTarget = null;
          }
        } else {
          group.rotation.y += 0.0036;
          // Idle wobble oscillates around 0.
          group.rotation.x += (Math.sin(elapsed * 0.2) * 0.07 - group.rotation.x) * 0.03;
        }

        material.uniforms.uTime.value = elapsed;

        // Re-project the cursor onto the globe's surface every frame, so the
        // attraction point tracks the cursor even while the group rotates.
        if (mouseActive) {
          raycaster.setFromCamera(mouseNDC, camera);
          const rayLocal = raycaster.ray.clone().applyMatrix4(localMatrix.copy(group.matrixWorld).invert());
          if (rayLocal.intersectSphere(hitSphere, hitPoint)) {
            mouseLocal.copy(hitPoint);
          } else {
            mouseActive = false;
          }
        }

        const idleTime = elapsed - lastMoveAt;
        const isAttract = mouseActive && idleTime >= IDLE_THRESHOLD;
        const attractAccel = isAttract
          ? ATTRACT_ACCEL_BASE + Math.min(idleTime - IDLE_THRESHOLD, ATTRACT_RAMP) * ATTRACT_ACCEL_GROWTH
          : 0;

        for (let i = 0; i < N; i++) {
          const ix = i * 3, iy = ix + 1, iz = ix + 2;
          const bx = home[ix], by = home[iy], bz = home[iz];
          const px = bx + dispX[i], py = by + dispY[i], pz = bz + dispZ[i];

          let fx, fy, fz;

          if (mouseActive) {
            const dx = mouseLocal.x - px, dy = mouseLocal.y - py, dz = mouseLocal.z - pz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < HOVER_RADIUS2 && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              const falloff = 1 - d / HOVER_RADIUS;
              const invD = 1 / d;
              const rx = dx * invD, ry = dy * invD, rz = dz * invD;
              if (isAttract) {
                // Black hole: pull toward the cursor with a spiral swirl,
                // growing stronger the longer the cursor stays still.
                const tx = -ry, ty = rx, tz = 0;
                const accel = falloff * attractAccel;
                fx = (rx + tx * SWIRL_FRAC) * accel;
                fy = (ry + ty * SWIRL_FRAC) * accel;
                fz = (rz + tz * SWIRL_FRAC) * accel;
              } else {
                // Repel: push away from the cursor (crater follows the mouse).
                const accel = falloff * REPEL_ACCEL;
                fx = -rx * accel;
                fy = -ry * accel;
                fz = -rz * accel;
              }
            } else {
              fx = -dispX[i] * SPRING_K;
              fy = -dispY[i] * SPRING_K;
              fz = -dispZ[i] * SPRING_K;
            }
          } else {
            fx = -dispX[i] * SPRING_K;
            fy = -dispY[i] * SPRING_K;
            fz = -dispZ[i] * SPRING_K;
          }

          const vx = (velX[i] + fx * dt) * DAMPING;
          const vy = (velY[i] + fy * dt) * DAMPING;
          const vz = (velZ[i] + fz * dt) * DAMPING;
          velX[i] = vx; velY[i] = vy; velZ[i] = vz;

          const ndx = dispX[i] + vx * dt;
          const ndy = dispY[i] + vy * dt;
          const ndz = dispZ[i] + vz * dt;
          dispX[i] = ndx; dispY[i] = ndy; dispZ[i] = ndz;

          effHome[ix] = bx + ndx;
          effHome[iy] = by + ndy;
          effHome[iz] = bz + ndz;
        }

        posAttr.needsUpdate = true;
        renderer.render(scene, camera);
      }

      animate();

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        updatePixelsPerUnit();
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", onResize);
        container.removeEventListener("pointermove", onPointerMove);
        container.removeEventListener("pointerleave", onPointerLeave);
        container.removeEventListener("pointerdown", onPointerDown);
        container.removeEventListener("pointerup", onPointerLeave);
        container.removeEventListener("pointercancel", onPointerLeave);
        geometry.dispose();
        tex.dispose(); geoTex.dispose();
        material.dispose();
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
