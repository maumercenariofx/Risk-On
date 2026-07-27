"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  genGlobe, genSphere, genThomas, genVoronoi, genAtom, tickAtom, eio,
  makeDotTexture, makeGeoTexture, makeCountryDataUniform, makeSelIdsUniform, latLonToDir,
  HERO_FORMS, RISK_COUNTRIES, GLOBE_VERTEX_SHADER, GLOBE_FRAGMENT_SHADER,
  ATMO_VERTEX_SHADER, ATMO_FRAGMENT_SHADER,
  BORDER_LINE_VERTEX_SHADER, BORDER_LINE_FRAGMENT_SHADER, makeBorderPositions,
  FIN_CENTERS, FLOW_VERTEX_SHADER, FLOW_FRAGMENT_SHADER, makeFlowGeometry,
  sunDirNow, cityGlowNow,
} from "../lib/quantForms";

// Self-hosted (antes cdnjs): mismo dominio = más rápido y sin punto de fallo externo.
const THREE_SRC = "/vendor/three-r128.min.js";

// Post-processing (bloom) — módulos r128 self-hosted; se cargan SOLO en el
// tier alto de desktop. Orden importa: Pass define la base de todos.
const PP_FILES = [
  "Pass.js", "MaskPass.js", "CopyShader.js", "LuminosityHighPassShader.js",
  "ShaderPass.js", "RenderPass.js", "EffectComposer.js", "UnrealBloomPass.js",
];
function loadPostProcessing() {
  if (window.THREE?.UnrealBloomPass) return Promise.resolve();
  return PP_FILES.reduce((p, f) => p.then(() => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `/vendor/pp/${f}`; s.async = false;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  })), Promise.resolve());
}

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
    // Devuelve false si el 3D interno aún no monta (el handle externo existe
    // desde el primer render) — el caller debe REINTENTAR, no asumir éxito.
    setCountries: (list) => {
      if (!selectRef.current?.setCountries) return false;
      selectRef.current.setCountries(list);
      return true;
    },
    // Tiñe el halo atmosférico (color de la banda del índice) y ajusta su
    // respiración con el score. Mismo contrato que setCountries: false
    // mientras el 3D no monta.
    setHalo: (hex, score) => {
      if (!selectRef.current?.setHalo) return false;
      selectRef.current.setHalo(hex, score);
      return true;
    },
    // Flujos de capital (dirección/color por régimen + pulso USD/MXN).
    setFlows: (opts) => {
      if (!selectRef.current?.setFlows) return false;
      selectRef.current.setFlows(opts);
      return true;
    },
    // Fly-to cinematográfico a un país (y regreso).
    flyTo: (opts) => {
      if (!selectRef.current?.flyTo) return false;
      selectRef.current.flyTo(opts);
      return true;
    },
    flyBack: () => selectRef.current?.flyBack?.(),
    isFocused: () => selectRef.current?.isFocused?.() ?? false,
  }), []);

  useEffect(() => {
    let destroyed = false;
    let cleanup   = () => {};

    loadThree().then(async THREE => {
      if (destroyed) return;
      // El geo-data del globo vive en un chunk lazy (lib/geoMasks) — se espera
      // ANTES de crear renderer/canvas para no dejar nada a medio montar.
      const geoTex = await makeGeoTexture(THREE);
      const borderPos = await makeBorderPositions(R * 1.003);
      if (destroyed) return;
      const container = mountRef.current;
      if (!container) return;

      // Presupuesto por dispositivo: la simulación corre en CPU, así que el
      // conteo de partículas se adapta (el módulo declara el techo; aquí se
      // SOMBREA N con el valor efectivo para todo el efecto). En móvil se
      // arranca ALTO por default (DPR nativo hasta 3, 110k partículas): un
      // iPhone 3x renderizado a menos se re-escala BORROSO. El tier bajo solo
      // aplica con señales claras de gama baja — OJO: deviceMemory NO existe
      // en iOS Safari (Chrome-only), así que los iPhone caen al tier alto,
      // que es lo correcto. La red de seguridad real para Android débil es la
      // escalera adaptativa de DPR, no este gate.
      const isSmall = Math.min(window.innerWidth, window.innerHeight) < 768;
      const cores   = navigator.hardwareConcurrency || 4;
      const lowEnd  = (navigator.deviceMemory != null && navigator.deviceMemory <= 4) || cores <= 4;
      // Tier alto: DOBLE densidad (las costas se dibujan con partículas — con
      // 110k el espaciado de 0.61° era más grueso que la máscara de 0.5°) y
      // SUPERSAMPLING 1.25× sobre el DPR nativo (SSAA barato; la escalera
      // adaptativa lo baja si el device no lo sostiene).
      const N   = isSmall ? (lowEnd ? 72000 : 220000) : (lowEnd ? 72000 : 160000);
      let DPR = Math.min((window.devicePixelRatio || 1) * (lowEnd ? 1 : 1.25),
                         isSmall ? (lowEnd ? 2 : 3.75) : (lowEnd ? 2 : 2.5));

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 6.5;

      const renderer = new THREE.WebGLRenderer({ antialias: !isSmall, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(DPR);
      renderer.setSize(container.clientWidth, container.clientHeight);
      const canvas = renderer.domElement;
      // Debug observable (Playwright / Web Inspector remoto): DPR y N vivos.
      canvas.dataset.dpr = String(DPR);
      canvas.dataset.n = String(N);
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
          // uSize escala con 1/sqrt(N) para conservar el fill relativo: a
          // 220k (spacing ~0.43°) el punto baja a 0.0145 — trazo fino tipo
          // grabado sin ralear los continentes. El tier bajo (72k) conserva
          // el punto grande.
          uSize:          { value: isSmall ? (lowEnd ? 0.022 : 0.0145) : (lowEnd ? 0.019 : 0.016) },
          uTime:          { value: 0 },
          uLightDir:      { value: new THREE.Vector3(0, 0, 0) },
          uUseViewFacing: { value: 1 },
          uBrightBase:    { value: 0.22 },
          uBrightScale:   { value: 0.72 },
          uShimmerSpeed:  { value: 1.8 },
          // Día/noche real + luces de plaza (se refrescan cada 60s en el loop)
          uSunDir:        { value: (() => { const d = sunDirNow(); return new THREE.Vector3(d.x, d.y, d.z); })() },
          uNightAmt:      { value: 0 },
          uCityDir:       { value: FIN_CENTERS.map((c) => { const d = latLonToDir(c.lat, c.lon); return new THREE.Vector3(d.x, d.y, d.z); }) },
          uCityGlow:      { value: cityGlowNow() },
          // Clima de riesgo (0 sereno → 1 tormenta) — setHalo lo deriva del score
          uStorm:         { value: 0 },
          // Fly-to país (uFocusId = maskId enfocado, 0 = ninguno)
          uFocusId:       { value: 0 },
          uFocusLift:     { value: 0 },
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

      // Atmósfera: halo fresnel en el limbo (solo visible en modo GLOBE — su
      // intensidad sigue a uColorT, igual que las fronteras).
      const atmoMat = new THREE.ShaderMaterial({
        uniforms: {
          uIntensity: { value: 0 },
          uTime:      { value: 0 },
          // Velocidad de la respiración (rad/s); setHalo la ajusta con el
          // score: risk-off respira más inquieto, risk-on más sereno.
          uPulse:     { value: 0.9 },
          uStorm:     { value: 0 },
          // Azul neutro de arranque; en cuanto hay score, RiskGauge lo tiñe
          // del color de la banda del día vía setHalo().
          uColor: { value: new THREE.Color(0.45, 0.66, 1.0) },
        },
        vertexShader: ATMO_VERTEX_SHADER,
        fragmentShader: ATMO_FRAGMENT_SHADER,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      });
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 64, 48), atmoMat);
      group.add(atmo);

      // Fronteras vectoriales: nítidas a cualquier densidad de partículas.
      const borderGeo = new THREE.BufferGeometry();
      borderGeo.setAttribute("position", new THREE.BufferAttribute(borderPos, 3));
      const borderMat = new THREE.ShaderMaterial({
        uniforms: {
          uColorT: { value: 0 },
          uColor:  { value: new THREE.Color(0.78, 0.86, 1.0) },
        },
        vertexShader: BORDER_LINE_VERTEX_SHADER,
        fragmentShader: BORDER_LINE_FRAGMENT_SHADER,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const borderLines = new THREE.LineSegments(borderGeo, borderMat);
      group.add(borderLines);

      // ── Flujos de capital: arcos entre plazas con cometas de luz. La
      // dirección y el color los fija setFlows() según el régimen del día. ──
      const flowGeo = makeFlowGeometry(THREE, R * 1.012);
      const flowMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:      { value: 0 },
          uColorT:    { value: 0 },
          uFlowDir:   { value: -1 },
          uFlowColor: { value: new THREE.Color("#D9A227") },
          uMxnPulse:  { value: 0.15 },
        },
        vertexShader: FLOW_VERTEX_SHADER,
        fragmentShader: FLOW_FRAGMENT_SHADER,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const flows = new THREE.LineSegments(flowGeo, flowMat);
      group.add(flows);

      group.scale.set(groupScale, groupScale, groupScale);
      scene.add(group);

      // ── Panel del fly-to: anclado en 3D al país enfocado (se reproyecta
      // cada frame). pointer-events none: informa, no estorba. ──
      container.style.position = "relative";
      const panel = document.createElement("div");
      panel.style.cssText =
        "position:absolute;left:0;top:0;z-index:5;pointer-events:none;opacity:0;" +
        "transition:opacity .25s;font-family:var(--font-mono,monospace);" +
        "background:rgba(8,10,14,0.78);border:1px solid rgba(255,255,255,0.16);" +
        "border-left-width:3px;border-radius:6px;padding:8px 12px;min-width:130px;" +
        "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)";
      container.appendChild(panel);

      // ── Bloom cinematográfico (solo desktop tier alto): la página detrás
      // es #000, así que renderizar OPACO es visualmente idéntico — y el
      // UnrealBloom de r128 no compone bien sobre canvas transparente. ──
      let composer = null, bloomPass = null;
      if (!isSmall && !lowEnd) {
        try {
          await loadPostProcessing();
          if (!destroyed && window.THREE.UnrealBloomPass) {
            renderer.setClearColor(0x000000, 1);
            composer = new THREE.EffectComposer(renderer);
            composer.addPass(new THREE.RenderPass(scene, camera));
            bloomPass = new THREE.UnrealBloomPass(
              new THREE.Vector2(container.clientWidth, container.clientHeight),
              0.5,   // strength: presencia sin lavar el mapa
              0.55,  // radius
              0.80   // threshold: solo florece lo realmente brillante
            );
            composer.addPass(bloomPass);
            composer.setPixelRatio?.(DPR);
            composer.setSize(container.clientWidth, container.clientHeight);
            canvas.dataset.bloom = "1";
          }
        } catch { composer = null; }
      }

      // Country-focus animation target (radians, group.rotation.y).
      let focusTarget = null;
      // Fly-to: estado del país enfocado + tweens de cámara/relieve.
      let focusData = null, focusLift = 0, focusLiftTarget = 0, camZTarget = 6.5, focusTilt = 0;
      let stormTarget = 0;
      const tmpV = new THREE.Vector3();

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
        // Halo del color de la banda del día, suavizado hacia blanco (pastel)
        // para que tiña sin gritar — el globo comunica el estado del mercado.
        // score (0-100) modula la respiración: risk-off (bajo) más inquieta
        // (~4s de periodo), risk-on (alto) más serena (~9s).
        setHalo: (hex, score = 50) => {
          atmoMat.uniforms.uColor.value.set(hex).lerp(new THREE.Color(1, 1, 1), 0.3);
          atmoMat.uniforms.uPulse.value = 0.7 + (1 - Math.max(0, Math.min(100, score)) / 100) * 0.9;
          // Clima de riesgo: la tormenta crece conforme cae el score (curva
          // suave; el loop hace el lerp para que el cambio nunca sea brusco).
          stormTarget = Math.pow(1 - Math.max(0, Math.min(100, score)) / 100, 1.6);
        },
        // Flujos de capital: dirección (risk-on → hacia EM), color de banda y
        // pulso del arco NY↔CDMX según el movimiento del USD/MXN del día.
        setFlows: ({ score = 50, mxnChg = 0, hex = "#D9A227" } = {}) => {
          flowMat.uniforms.uFlowDir.value = score >= 51 ? 1 : -1;
          flowMat.uniforms.uFlowColor.value.set(hex).lerp(new THREE.Color(1, 1, 1), 0.15);
          flowMat.uniforms.uMxnPulse.value = Math.min(0.6, Math.abs(mxnChg ?? 0) * 0.45);
        },
        // Fly-to cinematográfico: rota el globo al país, acerca la cámara,
        // eleva sus partículas y ancla el panel informativo en 3D.
        flyTo: ({ lat, lon, maskId, title = "", lines = [], color = "#fff" }) => {
          const d = latLonToDir(lat, lon);
          focusTarget = -Math.atan2(d.x, d.z);
          // Tilt de latitud: el país queda DE FRENTE, no en el borde inferior
          // (rotar x por latRad lleva su y a 0 — ver convención R_x).
          focusTilt = Math.max(-0.62, Math.min(0.62, (lat * Math.PI) / 180));
          focusData = { dirObj: new THREE.Vector3(d.x, d.y, d.z) };
          material.uniforms.uFocusId.value = maskId ?? 0;
          focusLiftTarget = 1;
          camZTarget = 5.55; // acercamiento con aire — a 4.9 el globo desbordaba todo el hero
          panel.style.borderLeftColor = color;
          panel.innerHTML =
            `<div style="font-size:9px;letter-spacing:2px;color:#8A8F98;text-transform:uppercase;margin-bottom:2px">${title}</div>` +
            lines.map((l) => `<div style="font-size:12px;color:#ECEFF4;line-height:1.5">${l}</div>`).join("");
        },
        flyBack: () => { focusLiftTarget = 0; camZTarget = 6.5; },
        isFocused: () => focusData !== null,
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
          list.slice(0, 5).forEach((c, i) => {
            if (!data[i]) return;
            data[i].x = Math.max(0, Math.min(100, c.score ?? 50)) / 100;
            data[i].y = c.phase ?? i * 1.3;
          });
          // Arreglo NUEVO (no mutar): el cache de uniforms de three puede
          // saltarse un re-upload de arrays planos mutados in place.
          material.uniforms.uSelIds.value = list.slice(0, 5).map((c) => c.maskId ?? 0);
        },
      };

      // ── Hover effect state ──
      // lastFrame = timestamp real del último render (para rawDt/dt);
      // nextFrameAt = reloj ACUMULADOR del throttle. El viejo
      // `ts - lastFrame < 1000/60` caía en el borde de cuantización en
      // pantallas 90/120Hz (ticks de ~8.3ms → cadencia 16.7/25/33ms) y esos
      // 33ms envenenaban la medición adaptativa como "frames lentos".
      let elapsed = 0, animId = 0, lastFrame = 0, nextFrameAt = 0, lastEnvAt = -999;
      let lastScrollAt = -1e9; // el scroll compite por el main thread — no medir ahí
      let mouseActive = false;
      let lastMoveAt  = 0;
      // settled = partículas en casa y sin interacción → se SALTA el loop de
      // física (el costo real del jank: N iteraciones + re-subir el buffer al
      // GPU cada frame). La rotación del grupo y el shader siguen animando.
      let settled = false, settleFrames = 0;
      // visible = false (hero fuera del viewport) → se detiene el rAF entero.
      let visible = true;
      // Calidad adaptativa ESCALONADA: arranca nítido y si el dispositivo no
      // sostiene ~30fps en reposo (sim dormida, sin scroll), baja el pixel
      // ratio de a 0.5 con re-medición entre pasos, hasta el piso 1.5. Se da
      // por terminada cuando una ventana pasa limpia (calidad sostenida) o
      // al tocar el piso. Umbral 34ms = 2+ frames de 60Hz perdidos — inmune a
      // la cuantización de 120Hz y al cap de rAF del Low Power Mode de iOS.
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
      const onScroll = () => { lastScrollAt = performance.now(); };
      window.addEventListener("scroll", onScroll, { passive: true });
      if (!isSmall) {
        container.addEventListener("pointermove", onPointerMove);
        container.addEventListener("pointerleave", onPointerLeave);
        container.addEventListener("pointerdown",   onPointerDown);
        container.addEventListener("pointerup",     onPointerLeave);
        container.addEventListener("pointercancel", onPointerLeave);
      }

      // ── Giroscopio (solo móvil): el globo se inclina sutilmente con el
      // teléfono — parallax físico. iOS exige permiso desde un gesto: se pide
      // en el PRIMER tap sobre el globo (discreto; si dicen no, no pasa nada).
      // Baseline = primera lectura, para que el tilt sea relativo a cómo
      // sostienes el teléfono, no a un "cero" absoluto.
      let gyroTilt = 0, gyroBase = null;
      const onGyro = (e) => {
        if (e.beta == null) return;
        if (gyroBase === null) gyroBase = e.beta;
        gyroTilt = Math.max(-0.09, Math.min(0.09, (e.beta - gyroBase) / 320));
      };
      const armGyro = async () => {
        try {
          if (typeof DeviceOrientationEvent?.requestPermission === "function") {
            if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return;
          }
          window.addEventListener("deviceorientation", onGyro);
        } catch {}
      };
      if (isSmall && typeof DeviceOrientationEvent !== "undefined") {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
          container.addEventListener("touchend", armGyro, { once: true, passive: true });
        } else {
          window.addEventListener("deviceorientation", onGyro); // Android: sin permiso
        }
      }

      function animate(ts = 0) {
        if (!visible) { animId = 0; return; } // pausa total fuera de pantalla
        animId = requestAnimationFrame(animate);
        // Throttle acumulador: 60fps promedio limpios en 60/90/120/144Hz.
        // El `ts - 32` re-ancla el reloj tras pausas (tab oculto, IO) para no
        // "reproducir" frames atrasados en ráfaga.
        if (ts < nextFrameAt) return;
        nextFrameAt = Math.max(nextFrameAt + 1000 / 60, ts - 32);
        const rawDt = lastFrame ? ts - lastFrame : 1000 / 60;
        const dt = Math.min(rawDt / 1000, 0.05);
        lastFrame = ts; elapsed += dt;

        // Calidad adaptativa: medir SOLO en reposo real — sim CPU dormida
        // (mismo criterio que needsSim, con el morphT del frame anterior: un
        // frame de desfase es irrelevante) y sin scroll reciente. Contar la
        // intro/settle degradaba hasta a un iPhone tope de gama — esos costos
        // son transitorios A PROPÓSITO y no representan el costo permanente.
        const simBusy = mouseActive || morphT < 1 || currentIdx === ATOM_IDX || !settled;
        if (!qDone && rawDt < 500 && !simBusy && ts - lastScrollAt > 300) {
          if (rawDt > 34) qSlow++;
          if (++qFrames >= 90) {
            if (qSlow > 30) { // >1/3 de frames lentos → un peldaño abajo
              DPR = Math.max(1.5, DPR - 0.5);
              renderer.setPixelRatio(DPR);
              renderer.setSize(container.clientWidth, container.clientHeight);
              material.uniforms.uPixelRatio.value = DPR;
              canvas.dataset.dpr = String(DPR);
              composer?.setPixelRatio?.(DPR);
              composer?.setSize(container.clientWidth, container.clientHeight);
              if (DPR <= 2 && composer) {
                // El bloom es lo primero que se sacrifica si el equipo sufre.
                composer = null; bloomPass = null;
                renderer.setClearColor(0x000000, 0);
                delete canvas.dataset.bloom;
              }
              if (DPR <= 1.5) qDone = true; // piso alcanzado
            } else {
              qDone = true; // ventana limpia → esta calidad se sostiene
            }
            qFrames = 0; qSlow = 0;
          }
        }

        if (focusTarget !== null) {
          // Shortest-path turn toward the selected country, recentering tilt
          // (o inclinando hacia la latitud del país si hay fly-to activo).
          const tiltGoal = focusData ? focusTilt : 0;
          let dyaw = (focusTarget - group.rotation.y) % (2 * Math.PI);
          if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
          if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
          group.rotation.y += dyaw * FOCUS_LERP;
          group.rotation.x += (tiltGoal - group.rotation.x) * FOCUS_LERP;
          if (Math.abs(dyaw) < 0.003 && Math.abs(group.rotation.x - tiltGoal) < 0.003) {
            group.rotation.y = focusTarget;
            group.rotation.x = tiltGoal;
            focusTarget = null;
          }
        } else if (focusData) {
          // Con un país en foco el globo se DETIENE y lo sostiene al frente
          // (la rotación decorativa lo sacaría de cámara en segundos).
          group.rotation.x += (focusTilt - group.rotation.x) * FOCUS_LERP;
        } else {
          group.rotation.y += 0.216 * dt; // por dt (0.0036×60): fluida aunque el pacing varíe
          // Idle wobble alrededor de 0 + inclinación del giroscopio (móvil).
          group.rotation.x += (Math.sin(elapsed * 0.2) * 0.07 + gyroTilt - group.rotation.x) * 0.03;
        }

        material.uniforms.uTime.value = elapsed;

        // Fade the globe-only tint/country highlight in or out as forms change.
        const colorTarget = currentIdx === GLOBE_IDX && !introActive ? 1 : 0;
        material.uniforms.uColorT.value += (colorTarget - material.uniforms.uColorT.value) * 0.05;
        // Atmósfera y fronteras vectoriales siguen el mismo fade que el tinte.
        atmoMat.uniforms.uIntensity.value = material.uniforms.uColorT.value;
        atmoMat.uniforms.uTime.value      = elapsed;
        borderMat.uniforms.uColorT.value  = material.uniforms.uColorT.value;

        // ── Ambiente: día/noche + sesiones (refresco 60s), tormenta, flujos ──
        material.uniforms.uNightAmt.value = material.uniforms.uColorT.value;
        if (elapsed - lastEnvAt > 60) {
          lastEnvAt = elapsed;
          const sd = sunDirNow();
          material.uniforms.uSunDir.value.set(sd.x, sd.y, sd.z);
          material.uniforms.uCityGlow.value = cityGlowNow(); // arreglo nuevo → re-upload
        }
        const storm = material.uniforms.uStorm.value + (stormTarget - material.uniforms.uStorm.value) * 0.02;
        material.uniforms.uStorm.value = storm;
        atmoMat.uniforms.uStorm.value  = storm;
        flowMat.uniforms.uTime.value   = elapsed;
        flowMat.uniforms.uColorT.value = material.uniforms.uColorT.value;

        // ── Fly-to: tween de cámara + relieve + panel anclado en 3D ──
        focusLift += (focusLiftTarget - focusLift) * 0.07;
        material.uniforms.uFocusLift.value = focusLift;
        camera.position.z += (camZTarget - camera.position.z) * 0.06;
        if (focusData) {
          if (focusLiftTarget === 0 && focusLift < 0.04) {
            material.uniforms.uFocusId.value = 0;
            focusData = null;
            panel.style.opacity = "0";
          } else {
            group.updateMatrixWorld();
            tmpV.copy(focusData.dirObj).multiplyScalar(R * (1 + focusLift * 0.1))
              .applyMatrix4(group.matrixWorld).project(camera);
            const sx = (tmpV.x * 0.5 + 0.5) * container.clientWidth;
            const sy = (-tmpV.y * 0.5 + 0.5) * container.clientHeight;
            panel.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${(sy - 16).toFixed(1)}px)`;
            panel.style.opacity = String(Math.min(1, Math.max(0, (focusLift - 0.3) * 1.9)));
          }
        }

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
        // Cursor ESTACIONADO (>6s sin moverse): libera el efecto — si no, un
        // mouse olvidado sobre el hero dejaba un vórtice permanente de
        // partículas desplazadas ("puntitos en el mar") y simulación eterna.
        if (mouseActive && idleTime > 6) mouseActive = false;
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

        if (composer) composer.render();
        else renderer.render(scene, camera);
      }

      animate();

      // Esc o click sobre el globo con un país enfocado → regreso del fly-to.
      const onKeyDown = (e) => { if (e.key === "Escape" && focusData) selectRef.current?.flyBack?.(); };
      const onCanvasClick = () => { if (focusData) selectRef.current?.flyBack?.(); };
      window.addEventListener("keydown", onKeyDown);
      canvas.addEventListener("click", onCanvasClick);

      // Fuera del viewport se detiene el rAF completo (render + física): el
      // globo dejaba de verse pero seguía costando frames a toda la página.
      const vio = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          if (!visible) { visible = true; lastFrame = 0; nextFrameAt = 0; if (!animId) animate(); }
        } else {
          visible = false;
        }
      }, { threshold: 0.02 });
      vio.observe(container);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        composer?.setSize(container.clientWidth, container.clientHeight);
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
        container.removeEventListener("touchend", armGyro);
        window.removeEventListener("deviceorientation", onGyro);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("keydown", onKeyDown);
        canvas.removeEventListener("click", onCanvasClick);
        geometry.dispose();
        tex.dispose(); geoTex.dispose();
        material.dispose();
        atmo.geometry.dispose(); atmoMat.dispose();
        borderGeo.dispose(); borderMat.dispose();
        flowGeo.dispose(); flowMat.dispose();
        bloomPass?.dispose?.();
        renderer.dispose();
        if (panel.parentNode === container) container.removeChild(panel);
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
