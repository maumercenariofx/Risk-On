"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  genGlobe, genSphere, genThomas, genVoronoi, genAtom, tickAtom, eio,
  makeDotTexture, makeGeoTexture, makeCountryDataUniform, makeSelIdsUniform, latLonToDir,
  HERO_FORMS, RISK_COUNTRIES, GLOBE_VERTEX_SHADER, GLOBE_FRAGMENT_SHADER,
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
const MORPH_S = 1.4;
const INTRO_MORPH_S = 1.0;
const BASE_SCALE = 1.3;
const GLOBE_IDX = HERO_FORMS.findIndex(f => f.id === "GLOBE");
const ATOM_IDX  = HERO_FORMS.findIndex(f => f.id === "ATOM");

// Hover effect: while the cursor is MOVING, nearby particles are pushed
// outward (repel/crater). If the cursor stays still for IDLE_THRESHOLD,
// it flips to "black hole" mode — particles get absorbed and held orbiting
// at the event-horizon rim (ORBIT_RADIUS) instead of spiraling into the
// center, growing faster the longer the cursor stays still. Moving again
// snaps back to repel and everything springs home with inertia (overdamped,
// no bounce).
const HOVER_RADIUS       = 0.455;
const HOVER_RADIUS2      = HOVER_RADIUS * HOVER_RADIUS;
const ORBIT_RADIUS       = HOVER_RADIUS * 0.65;
const RADIAL_K           = 12;
const IDLE_THRESHOLD     = 0.6;
const REPEL_ACCEL        = 14;
const ATTRACT_ACCEL_BASE = 6;
const ATTRACT_ACCEL_GROWTH = 18;
const ATTRACT_RAMP       = 1.5;
const SPRING_K           = 9;
const DAMPING            = 0.88;

const RiskSphere = forwardRef(function RiskSphere({ height = 274 }, ref) {
  const mountRef    = useRef(null);
  const selectRef   = useRef(null);

  useImperativeHandle(ref, () => ({
    focusCountry: (lat, lon) => selectRef.current?.focusCountry(lat, lon),
    select: (idx) => selectRef.current?.select(idx),
    setCountryScores: (map) => selectRef.current?.setCountryScores(map),
    setCountries: (list) => selectRef.current?.setCountries(list),
  }), []);

  useEffect(() => {
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(async THREE => {
      if (destroyed) return;
      // El geo-data del globo vive en un chunk lazy (lib/geoMasks) — se espera
      // ANTES de crear renderer/canvas para no dejar nada a medio montar.
      const geoTex = await makeGeoTexture(THREE);
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      // Presupuesto por dispositivo: la simulación corre en CPU, así que el
      // conteo de partículas se adapta (el módulo declara el techo; aquí se
      // SOMBREA N con el valor efectivo para todo el efecto). El DPR va a
      // resolución NATIVA (cap 2… o 3 en pantallas chicas: un iPhone 3x
      // renderizado a 1.5 se re-escala BORROSO — eso se veía "sucio"; el
      // canvas chico hace baratos esos píxeles, y el settle-skip ya mantiene
      // el CPU en cero en reposo).
      const isSmall = Math.min(window.innerWidth, window.innerHeight) < 768;
      const cores   = navigator.hardwareConcurrency || 4;
      const N   = isSmall ? 84000 : cores <= 4 ? 72000 : 110000;
      let DPR = Math.min(window.devicePixelRatio || 1, isSmall ? 2.5 : 2);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 6.5;

      const renderer = new THREE.WebGLRenderer({ antialias: !isSmall, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(DPR);
      renderer.setSize(container.clientWidth, container.clientHeight);
      const canvas = renderer.domElement;
      // pan-y: el swipe vertical SIGUE scrolleando la página aunque empiece
      // sobre el globo (crítico con el hero a pantalla completa); el efecto
      // táctil sigue vivo vía pointerdown/move y se cancela si el browser
      // toma el gesto para scrollear.
      canvas.style.touchAction = "pan-y";
      canvas.style.userSelect = "none";
      canvas.style.webkitUserSelect = "none";
      canvas.style.webkitTouchCallout = "none";
      canvas.style.webkitTapHighlightColor = "transparent";
      container.appendChild(canvas);

      const tex = makeDotTexture(THREE);

      // Particle positions for every selectable form. ATOM's home is
      // continuously re-ticked (orbital motion) while it's active.
      const atom = genAtom(N, R);
      const HOMES = HERO_FORMS.map(f => {
        switch (f.id) {
          case "GLOBE":   return genGlobe(N, R);
          case "SPHERE":  return genSphere(N, R);
          case "THOMAS":  return genThomas(N);
          case "VORONOI": return genVoronoi(N, R);
          case "ATOM":    return atom.pos;
          default:        return genGlobe(N, R);
        }
      });

      // Intro: particles start as a dense star-field cloud covering the
      // whole screen (denser center, fading at the edges) and converge
      // into the default Global Risk Map on load. Sigma is derived from
      // the camera's visible extent so the cloud fills the viewport on
      // any aspect ratio (desktop or mobile portrait) without clipping.
      const gauss = () => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };
      const fovRad    = THREE.MathUtils.degToRad(camera.fov);
      const visibleHW = 2 * Math.tan(fovRad / 2) * camera.position.z;
      // Shrink the globe on narrow/portrait viewports so it never gets
      // clipped by the container's left/right edges.
      const aspect    = container.clientWidth / container.clientHeight;
      const groupScale = Math.min(BASE_SCALE, (visibleHW * aspect * 0.85) / (2 * R));
      const visibleH = visibleHW / groupScale;
      const visibleW = visibleH * aspect;
      const sigmaX = visibleW * 0.5;
      const sigmaY = visibleH * 0.5;
      const sigmaZ = 1.5;
      const scatter = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        scatter[i*3]   = gauss() * sigmaX;
        scatter[i*3+1] = gauss() * sigmaY;
        scatter[i*3+2] = gauss() * sigmaZ;
      }

      let currentIdx  = GLOBE_IDX;
      let prevHome    = scatter;
      let currHome    = HOMES[GLOBE_IDX];
      let morphT      = 0;
      let morphDur    = INTRO_MORPH_S;
      let introActive = true;
      const baseNow  = scatter.slice();
      const effHome  = scatter.slice();

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
          uSelIds:        { value: makeSelIdsUniform() },
          uPixelsPerUnit: { value: 1 },
          uPixelRatio:    { value: DPR },
          // Puntos ~15% más grandes en pantallas chicas: con menos partículas
          // los continentes se rellenan y el mapa se lee sólido, no raleado.
          uSize:          { value: isSmall ? 0.022 : 0.019 },
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
      group.scale.set(groupScale, groupScale, groupScale);
      scene.add(group);

      // Country-focus animation target (radians, group.rotation.y).
      let focusTarget = null;

      selectRef.current = {
        focusCountry: (lat, lon) => {
          const d = latLonToDir(lat, lon);
          focusTarget = -Math.atan2(d.x, d.z);
        },
        select: (idx) => {
          if (idx < 0 || idx >= HOMES.length || idx === currentIdx) return;
          prevHome   = baseNow.slice();
          currHome   = HOMES[idx];
          currentIdx = idx;
          morphT     = 0;
          morphDur   = MORPH_S;
        },
        // Actualiza en vivo el color/pulso de cada país (score 0-100 por id).
        setCountryScores: (map) => {
          const arr = material.uniforms.uCountryData.value;
          RISK_COUNTRIES.forEach((c, i) => {
            if (map?.[c.id] != null && arr[i]) arr[i].x = Math.max(0, Math.min(100, map[c.id])) / 100;
          });
        },
        // Selección dinámica: reemplaza QUÉ 5 países ilumina el globo
        // (los 5 más calientes del universo) y con qué score/fase.
        setCountries: (list) => {
          const data = material.uniforms.uCountryData.value;
          const sel  = material.uniforms.uSelIds.value;
          list.slice(0, 5).forEach((c, i) => {
            if (!data[i]) return;
            sel[i]    = c.maskId ?? 0;
            data[i].x = Math.max(0, Math.min(100, c.score ?? 50)) / 100;
            data[i].y = c.phase ?? i * 1.3;
          });
        },
      };

      // ── Hover effect state ──
      let elapsed = 0, animId = 0, lastFrame = 0;
      let mouseActive = false;
      let lastMoveAt  = 0;
      // settled = partículas en casa y sin interacción → se SALTA el loop de
      // física (el costo real del jank: N iteraciones + re-subir el buffer al
      // GPU cada frame). La rotación del grupo y el shader siguen animando.
      let settled = false, settleFrames = 0;
      // visible = false (hero fuera del viewport) → se detiene el rAF entero.
      let visible = true;
      // Calidad adaptativa: arranca nítido y si el dispositivo no sostiene
      // ~38fps en los primeros segundos, baja el pixel ratio UNA vez (a 1.5).
      // Así los iPhone se ven a resolución casi nativa y un Android débil no
      // se arrastra.
      let qFrames = 0, qSlow = 0, qDone = DPR <= 1.5;
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
        settled = false; settleFrames = 0;
      };
      const onPointerLeave = () => { mouseActive = false; };
      const onPointerDown  = (e) => { onPointerMove(e); lastMoveAt = elapsed; };
      // El efecto cráter/hoyo negro es SOLO desktop (decisión 2026-07-06): en
      // móvil competía con el scroll, costaba física y no aportaba — sin
      // listeners, mouseActive nunca se enciende y la simulación no corre.
      if (!isSmall) {
        container.addEventListener("pointermove", onPointerMove);
        container.addEventListener("pointerleave", onPointerLeave);
        container.addEventListener("pointerdown",   onPointerDown);
        container.addEventListener("pointerup",     onPointerLeave);
        container.addEventListener("pointercancel", onPointerLeave);
      }

      function animate(ts = 0) {
        if (!visible) { animId = 0; return; } // pausa total fuera de pantalla
        animId = requestAnimationFrame(animate);
        if (ts - lastFrame < 1000 / 60) return;
        const rawDt = ts - lastFrame;
        const dt = Math.min(rawDt / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        // Calidad adaptativa: medir SOLO en reposo (sin morph/interacción).
        // Contar la intro degradaba hasta a un iPhone tope de gama — la intro
        // es pesada A PROPÓSITO y no representa el costo permanente.
        if (!qDone && rawDt < 500 && morphT >= 1 && !mouseActive) {
          if (rawDt > 26) qSlow++;
          if (++qFrames >= 90) {
            qDone = true;
            if (qSlow > 30) { // >1/3 de frames lentos → baja resolución
              DPR = 1.5;
              renderer.setPixelRatio(DPR);
              renderer.setSize(container.clientWidth, container.clientHeight);
              material.uniforms.uPixelRatio.value = DPR;
            }
          }
        }

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

        // Fade the globe-only tint/country highlight in or out as forms change.
        const colorTarget = currentIdx === GLOBE_IDX && !introActive ? 1 : 0;
        material.uniforms.uColorT.value += (colorTarget - material.uniforms.uColorT.value) * 0.05;

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

        // Continuously orbit ATOM's ring particles while it's the active form.
        if (currentIdx === ATOM_IDX) {
          tickAtom(HOMES[ATOM_IDX], atom.phases, atom.rIdx, elapsed, N, R);
        }

        if (morphT < 1) morphT = Math.min(1, morphT + dt / morphDur);
        else introActive = false;

        // El loop de N partículas + subir el buffer solo corre cuando hace
        // falta (interacción, morph o ATOM); en reposo el globo gira vía la
        // matriz del grupo y el shader — CPU casi en cero.
        const needsSim = mouseActive || morphT < 1 || currentIdx === ATOM_IDX || !settled;
        if (needsSim) {
        const mt = morphT < 1 ? eio(morphT) : 1;

        for (let i = 0; i < N; i++) {
          const ix = i * 3, iy = ix + 1, iz = ix + 2;
          const bx = prevHome[ix] + (currHome[ix] - prevHome[ix]) * mt;
          const by = prevHome[iy] + (currHome[iy] - prevHome[iy]) * mt;
          const bz = prevHome[iz] + (currHome[iz] - prevHome[iz]) * mt;
          baseNow[ix] = bx; baseNow[iy] = by; baseNow[iz] = bz;
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
                // Black hole: absorb the particle and hold it orbiting at
                // ORBIT_RADIUS (a spring centered on the rim, pulling in
                // particles still further out and pushing back any that
                // overshoot toward the center) while a tangential term
                // spins it around the rim, faster the longer the cursor idles.
                const tx = -ry, ty = rx, tz = 0;
                const radialErr   = d - ORBIT_RADIUS;
                const radialAccel = radialErr * RADIAL_K;
                const orbitAccel  = falloff * attractAccel;
                fx = rx * radialAccel + tx * orbitAccel;
                fy = ry * radialAccel + ty * orbitAccel;
                fz = rz * radialAccel + tz * orbitAccel;
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

        // Tras ~1.5s sin interacción los resortes ya convergieron: ancla todo
        // a su home exacto y deja de simular hasta el próximo toque/morph.
        if (!mouseActive && morphT >= 1 && currentIdx !== ATOM_IDX) {
          if (++settleFrames > 90) {
            for (let i = 0; i < N; i++) {
              const ix = i * 3;
              dispX[i] = 0; dispY[i] = 0; dispZ[i] = 0;
              velX[i] = 0; velY[i] = 0; velZ[i] = 0;
              effHome[ix] = baseNow[ix]; effHome[ix + 1] = baseNow[ix + 1]; effHome[ix + 2] = baseNow[ix + 2];
            }
            posAttr.needsUpdate = true;
            settled = true;
          }
        } else settleFrames = 0;
        } // fin needsSim

        renderer.render(scene, camera);
      }

      animate();

      // Fuera del viewport se detiene el rAF completo (render + física): el
      // globo dejaba de verse pero seguía costando frames a toda la página.
      const vio = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          if (!visible) { visible = true; lastFrame = 0; if (!animId) animate(); }
        } else {
          visible = false;
        }
      }, { threshold: 0.02 });
      vio.observe(container);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        const newScale = Math.min(BASE_SCALE, (visibleHW * camera.aspect * 0.85) / (2 * R));
        group.scale.set(newScale, newScale, newScale);
        updatePixelsPerUnit();
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(animId);
        vio.disconnect();
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

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height,
        touchAction: "pan-y",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    />
  );
});

export default RiskSphere;
