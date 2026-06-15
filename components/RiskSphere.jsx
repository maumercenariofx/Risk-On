"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  eio, genSphere, genGlobe, genThomas, genChainEdges, makeDotTexture,
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

const N = 144000; // same particle count for every form, enables morphing
const R = 1.8;
const MORPH_S       = 1.2;
const PULSE_SPEED   = (2 * Math.PI) / 3;
const DRAG_SENS     = 0.005;
const FOCUS_LERP    = 0.06;

const RiskSphere = forwardRef(function RiskSphere({ height = 274 }, ref) {
  const mountRef    = useRef(null);
  const selectRef   = useRef(null);

  useImperativeHandle(ref, () => ({
    select:       (idx)        => selectRef.current?.select(idx),
    focusCountry: (lat, lon)   => selectRef.current?.focusCountry(lat, lon),
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
          uColorT:        { value: 0 },
          uOpacity:       { value: 0.75 },
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

      // Wireframe — draws the attractor's trajectory as a continuous curve
      // through phase space. Only shown (and meaningful) for the attractors.
      const wireGeom = new THREE.BufferGeometry();
      wireGeom.setAttribute("position", posAttr);
      wireGeom.setIndex(new THREE.BufferAttribute(genChainEdges(N), 1));
      const wireMat  = new THREE.LineBasicMaterial({ color: 0xF5F5F2, transparent: true, opacity: 0 });
      const wireMesh = new THREE.LineSegments(wireGeom, wireMat);
      group.add(wireMesh);

      let globeColorT = 0;

      // Drag-to-rotate state and country-focus animation target (radians,
      // group.rotation.y). When dragging, auto-rotation pauses; on release
      // the globe keeps spinning with the momentum of the gesture (vx/vy,
      // in rad/s) until friction damps it out, then idle auto-rotation
      // resumes. tiltOffset is the user-set vertical tilt (group.rotation.x
      // base) — the idle wobble oscillates around it instead of snapping
      // back to 0.
      const drag = { active: false, lastX: 0, lastY: 0, lastT: 0, vx: 0, vy: 0 };
      let focusTarget = null;
      let tiltOffset  = 0;

      selectRef.current = {
        select: (idx) => {
          if (idx === currentIdx && morphT >= 1) return;
          prevHome.set(effHome);
          currHome   = HOMES[idx];
          currentIdx = idx;
          morphT     = 0;
        },
        focusCountry: (lat, lon) => {
          if (currentIdx !== 1) selectRef.current.select(1);
          const d = latLonToDir(lat, lon);
          focusTarget = -Math.atan2(d.x, d.z);
        },
      };

      let elapsed = 0, animId, lastFrame = 0;

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
            tiltOffset = 0;
            focusTarget = null;
          }
        } else if (drag.active) {
          // Rotation is driven directly by onPointerMove while dragging.
        } else if (Math.abs(drag.vx) > 0.0005 || Math.abs(drag.vy) > 0.0005) {
          // Momentum: keep spinning with the gesture's velocity, decaying
          // via friction until it falls below the threshold above.
          group.rotation.y += drag.vx * dt;
          tiltOffset = Math.max(-1.2, Math.min(1.2, tiltOffset + drag.vy * dt));
          group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + drag.vy * dt));
          const damp = Math.pow(0.95, dt * 60);
          drag.vx *= damp;
          drag.vy *= damp;
        } else {
          group.rotation.y += 0.003;
          // Idle wobble oscillates around the user's last drag tilt instead
          // of pulling back toward 0.
          group.rotation.x += ((tiltOffset + Math.sin(elapsed * 0.2) * 0.07) - group.rotation.x) * 0.03;
        }

        material.uniforms.uTime.value = elapsed;

        // Land/ocean/border tinting, only shown for the GLOBE form. Computed
        // before the per-particle loop so the shimmer/pulse damping below
        // (which fades to a calmer look while the globe tint is active) uses
        // the up-to-date value.
        const globeTarget = currentIdx === 1 ? 1 : 0;
        globeColorT += (globeTarget - globeColorT) * 0.07;
        material.uniforms.uColorT.value = globeColorT;

        // Morph effHome toward currHome
        if (morphT < 1) morphT = Math.min(1, morphT + dt / MORPH_S);
        const mt = eio(morphT);
        for (let i = 0; i < N * 3; i++) {
          effHome[i] = prevHome[i] + (currHome[i] - prevHome[i]) * mt;
        }

        // Wireframe: traces the attractor's path, only shown for the Thomas form
        const wireTarget = currentIdx === 2 ? 0.35 : 0;
        wireMat.opacity += (wireTarget - wireMat.opacity) * 0.07;

        // Pulse fades out while the GLOBE tint is active so the map doesn't
        // flicker in and out of brightness.
        material.uniforms.uOpacity.value = 0.715 + Math.sin(elapsed * PULSE_SPEED) * 0.165 * (1 - globeColorT);
        posAttr.needsUpdate = true;
        renderer.render(scene, camera);
      }

      animate();

      // ── Drag-to-rotate ──
      // Press and hold (mouse or touch) to spin the globe by hand; on
      // release it keeps rotating from wherever it was left.
      container.style.cursor     = "grab";
      container.style.touchAction = "none";

      const onPointerDown = (e) => {
        drag.active = true;
        drag.lastX  = e.clientX;
        drag.lastY  = e.clientY;
        drag.lastT  = performance.now();
        drag.vx = 0;
        drag.vy = 0;
        focusTarget = null;
        container.style.cursor = "grabbing";
      };
      const onPointerMove = (e) => {
        if (!drag.active) return;
        const now = performance.now();
        const dt  = Math.max((now - drag.lastT) / 1000, 1 / 1000);
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.lastT = now;

        const dRotY =  dx * DRAG_SENS;
        const dRotX = -dy * DRAG_SENS;
        group.rotation.y += dRotY;
        tiltOffset = Math.max(-1.2, Math.min(1.2, tiltOffset + dRotX));
        group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + dRotX));

        // Track angular velocity (rad/s) so release can keep spinning with
        // the gesture's momentum instead of stopping dead.
        drag.vx = dRotY / dt;
        drag.vy = dRotX / dt;
      };
      const onPointerUp = () => {
        drag.active = false;
        container.style.cursor = "grab";
      };

      container.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup",   onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        updatePixelsPerUnit();
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(animId);
        container.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove",   onPointerMove);
        window.removeEventListener("pointerup",     onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        window.removeEventListener("resize",        onResize);
        geometry.dispose(); wireGeom.dispose();
        tex.dispose(); geoTex.dispose();
        material.dispose(); wireMat.dispose();
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
