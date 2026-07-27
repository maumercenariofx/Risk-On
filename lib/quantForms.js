// Shared particle-form generators and metadata for the Three.js visualizers
// (homepage RiskSphere hero + /learn Quant Lab).

export const eio = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

// Fibonacci sphere — every particle is a possible future price path under GBM.
export function genSphere(n, r) {
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

// Land/ocean mask of the globe at 0.25° resolution (1440×720), 1 bit per
// cell, row-major from the North pole, base64-encoded (derived from
// world-atlas land-50m). Rasterized into a data texture by makeGeoTexture()
// and sampled per-particle in the GLOBE shader — it never changes particle
// positions. Dimensions live in geoMasks.js (LAND_COLS/ROWS) and the
// generator scripts keep them in sync.

// Country-id mask for the COUNTRY_UNIVERSE at 0.5° (720×360 — sus rellenos
// son áreas grandes, no necesita el 0.25° de las costas), packed 2 cells per
// byte (4-bit ids). Built via real point-in-polygon
// against world-atlas 50m country boundaries (scripts/gen-country-mask.mjs)
// so the per-country highlight in the GLOBE shader respects real borders.
// Globe — same Fibonacci-sphere mesh as genSphere(); the world map is applied
// purely as a shader-side color/size filter (see makeGeoTexture(),
// GLOBE_VERTEX_SHADER, GLOBE_FRAGMENT_SHADER), so particle positions and
// density never change between forms.
export function genGlobe(n, r) {
  return genSphere(n, r);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Country border lines (interior political boundaries only, no coastlines),
// quantized to int16 lat/lon pairs + a uint16 edge list. Rasterized into the
// geo data texture by makeGeoTexture() (border channel) for the GLOBE shader.

function decodeBorderLatLon(m) {
  const { BORDER_POS_B64, BORDER_EDGES_B64 } = m;
  const ll    = new Int16Array(b64ToBytes(BORDER_POS_B64).buffer);
  const edges = new Uint16Array(b64ToBytes(BORDER_EDGES_B64).buffer);
  const n = ll.length / 2;
  const lats = new Float32Array(n), lons = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lats[i] = ll[i*2]   / 182.0444;
    lons[i] = ll[i*2+1] / 91.0222;
  }
  return { lats, lons, edges };
}

// Equirectangular data texture for the GLOBE shader: R = land(255)/ocean(0)
// from LAND_MASK_B64, G = country-border lines rasterized from
// decodeBorderLatLon(). Sampled per-particle using each particle's own
// lat/lon — never alters particle positions or density.
let _geoCanvas = null;
function buildGeoCanvas(m) {
  const { LAND_COLS, LAND_ROWS, LAND_MASK_B64, COUNTRY_COLS, COUNTRY_ROWS, COUNTRY_MASK_B64 } = m;
  if (_geoCanvas) return _geoCanvas;
  const W = 1440, H = 720;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  const bytes = b64ToBytes(LAND_MASK_B64);

  // Limpieza: COMPONENTES de tierra chicos se descartan — atolones y
  // micro-archipiélagos (Tuamotu, Fiji/Vanuatu, Noronha…) se veían como
  // "puntitos sueltos en el mar", sobre todo comprimidos en el borde de la
  // esfera. El umbral se calibró a 4 celdas a 1° y se escala con el ÁREA
  // física (× (celdas-por-grado)²) para que subir la resolución de la
  // máscara no los resucite. BFS con vecindad-8 y wrap horizontal;
  // Cuba/Hawái grande/Japón sobreviven de sobra.
  const srcLand = new Uint8Array(LAND_COLS * LAND_ROWS);
  for (let i = 0; i < srcLand.length; i++) {
    srcLand[i] = (bytes[i >> 3] & (1 << (i & 7))) ? 1 : 0;
  }
  const MIN_COMPONENT = Math.round(4 * (LAND_COLS / 360) ** 2);
  const cleanLand = new Uint8Array(srcLand);
  const seen = new Uint8Array(srcLand.length);
  const stack = [];
  for (let start = 0; start < srcLand.length; start++) {
    if (!srcLand[start] || seen[start]) continue;
    const comp = [];
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const r = (i / LAND_COLS) | 0, c = i % LAND_COLS;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= LAND_ROWS) continue;
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const cc = ((c + dc) % LAND_COLS + LAND_COLS) % LAND_COLS;
          const j = rr * LAND_COLS + cc;
          if (srcLand[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    if (comp.length < MIN_COMPONENT) for (const i of comp) cleanLand[i] = 0;
  }

  const land = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = (y / H * LAND_ROWS) | 0;
    for (let x = 0; x < W; x++) {
      const col = (x / W * LAND_COLS) | 0;
      land[y * W + x] = cleanLand[row * LAND_COLS + col] ? 255 : 0;
    }
  }

  // Country ids (0=none, 1-5 matching RISK_COUNTRIES) packed 2-per-byte at
  // COUNTRY_COLS x COUNTRY_ROWS — sampled into the B channel below.
  const countryBytes = b64ToBytes(COUNTRY_MASK_B64);
  const countryId = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = (y / H * COUNTRY_ROWS) | 0;
    for (let x = 0; x < W; x++) {
      const col = (x / W * COUNTRY_COLS) | 0;
      const i = row * COUNTRY_COLS + col;
      const byte = countryBytes[i >> 1];
      countryId[y * W + x] = (i % 2 === 0) ? (byte & 0x0f) : (byte >> 4);
    }
  }

  // Coastlines: any land/ocean transition in the mask itself is also a
  // country edge, so trace it into the border (G) channel — this gives every
  // country its full outline, not just shared interior political borders.
  const COAST_R = 1;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const v = land[idx];
      let coast = 0;
      for (let dy = -COAST_R; dy <= COAST_R && !coast; dy++) {
        const yy = Math.max(0, Math.min(H - 1, y + dy));
        for (let dx = -COAST_R; dx <= COAST_R; dx++) {
          const xx = ((x + dx) % W + W) % W;
          if (land[yy * W + xx] !== v) { coast = 255; break; }
        }
      }
      const p = idx * 4;
      // id × 17: soporta los 15 ids del nibble (15×17=255). Con ×51 (calibrado
      // para 5 países) los ids 6-14 se desbordaban y TODOS decodificaban como
      // Turquía — los países nuevos jamás se iluminaban.
      img.data[p] = v; img.data[p+1] = coast; img.data[p+2] = countryId[idx] * 17; img.data[p+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const { lats, lons, edges } = decodeBorderLatLon(m);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgb(0,255,0)";
  ctx.lineWidth = 2;
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], bI = edges[e+1];
    const ax = (lons[a]  + 180) / 360 * W, ay = (90 - lats[a])  / 180 * H;
    const bx = (lons[bI] + 180) / 360 * W, by = (90 - lats[bI]) / 180 * H;
    if (Math.abs(ax - bx) > W / 2) continue; // skip antimeridian-wrapping segments
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }

  _geoCanvas = c;
  return c;
}

export async function makeGeoTexture(THREE) {
  const m = await import("./geoMasks");
  const tex = new THREE.CanvasTexture(buildGeoCanvas(m));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // Nearest filtering keeps land/ocean/border edges crisp instead of
  // softening them into a blurry gradient band when sampled per-particle.
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.flipY = false;
  return tex;
}

// Curated list of the 5 countries currently flagged as the top risk-on/off
// drivers. `score` is a 0-100 stress reading (0 = calm/risk-on -> green,
// 100 = high stress/risk-off -> red) driving the traffic-light tint and
// blink in the GLOBE shader (see COUNTRY_MASK_B64, GLOBE_FRAGMENT_SHADER);
// `phase` offsets each country's blink so they don't pulse in sync.
// Placeholder values pending a real per-country macro/stress feed — update
// in place once one is wired up, the shader plumbing reads from here.
// Universo de países candidatos del radar. Cada hora /api/country-risk los
// puntúa TODOS y el sitio muestra los 5 más calientes (chips + globo) — así
// un pico de riesgo fuera de los clásicos no se pierde. `maskId` = id 4-bit
// en COUNTRY_MASK_B64 (regenerar con scripts/gen-country-mask.mjs si cambia
// la lista); `score` = fallback si el feed falla.
export const COUNTRY_UNIVERSE = [
  { id: "mx", maskId: 1,  name_es: "México",         name_en: "Mexico",        lat: 23.6,  lon: -102.5, score: 62, phase: 0.0 },
  { id: "us", maskId: 2,  name_es: "Estados Unidos", name_en: "United States", lat: 39.8,  lon: -98.6,  score: 48, phase: 1.3 },
  { id: "cn", maskId: 3,  name_es: "China",          name_en: "China",         lat: 35.0,  lon: 103.8,  score: 70, phase: 2.6 },
  { id: "br", maskId: 4,  name_es: "Brasil",         name_en: "Brazil",        lat: -10.3, lon: -53.2,  score: 65, phase: 3.9 },
  { id: "tr", maskId: 5,  name_es: "Turquía",        name_en: "Turkey",        lat: 38.9,  lon: 35.2,   score: 88, phase: 5.2 },
  { id: "jp", maskId: 6,  name_es: "Japón",          name_en: "Japan",         lat: 36.2,  lon: 138.3,  score: 40, phase: 0.7 },
  { id: "gb", maskId: 7,  name_es: "Reino Unido",    name_en: "UK",            lat: 54.0,  lon: -2.5,   score: 38, phase: 1.9 },
  { id: "de", maskId: 8,  name_es: "Alemania",       name_en: "Germany",       lat: 51.2,  lon: 10.4,   score: 36, phase: 3.2 },
  { id: "in", maskId: 9,  name_es: "India",          name_en: "India",         lat: 21.0,  lon: 78.0,   score: 45, phase: 4.5 },
  { id: "kr", maskId: 10, name_es: "Corea del Sur",  name_en: "South Korea",   lat: 36.5,  lon: 127.8,  score: 42, phase: 5.8 },
  { id: "za", maskId: 11, name_es: "Sudáfrica",      name_en: "South Africa",  lat: -29.0, lon: 24.7,   score: 55, phase: 0.4 },
  { id: "ar", maskId: 12, name_es: "Argentina",      name_en: "Argentina",     lat: -34.0, lon: -64.0,  score: 58, phase: 1.6 },
  { id: "cl", maskId: 13, name_es: "Chile",          name_en: "Chile",         lat: -35.7, lon: -71.5,  score: 44, phase: 2.9 },
  { id: "co", maskId: 14, name_es: "Colombia",       name_en: "Colombia",      lat: 4.6,   lon: -74.1,  score: 50, phase: 4.2 },
];

// Back-compat: los 5 clásicos como selección por default (hasta que llegue el
// feed en vivo). QuantLab (/learn) también los usa.
export const RISK_COUNTRIES = COUNTRY_UNIVERSE.slice(0, 5);

// Builds the uCountryData uniform array (vec2(score 0-1, phase) per country,
// in RISK_COUNTRIES order / country-mask id order) for the GLOBE shader.
export function makeCountryDataUniform(THREE) {
  return RISK_COUNTRIES.map((c) => new THREE.Vector2(c.score / 100, c.phase));
}

// uSelIds: qué 5 maskIds del universo están seleccionados (el shader solo
// ilumina esos). Default = los 5 clásicos.
export function makeSelIdsUniform() {
  return RISK_COUNTRIES.map((c) => c.maskId);
}

// Inverse of the lat/lon projection used in GLOBE_VERTEX_SHADER
// (phi = acos(dir.y), theta = atan(dir.z, -dir.x)) — converts a country's
// lat/lon back into the same fixed object-space direction its particles sit
// at, so the globe can be rotated to bring that point to face the camera.
export function latLonToDir(lat, lon) {
  const latR  = (lat * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return {
    x: -Math.cos(latR) * Math.cos(theta),
    y: Math.sin(latR),
    z: Math.cos(latR) * Math.sin(theta),
  };
}

// GLOBE shader — projects each particle's fixed 3D position to lat/lon and
// samples the geo/tension textures to color and size it, without ever
// touching the underlying mesh (positions/density stay exactly as generated
// by genSphere()).
export const GLOBE_VERTEX_SHADER = /* glsl */ `
precision highp float;
attribute float jPhase;
uniform sampler2D uMap;
uniform float uColorT;
uniform float uPixelsPerUnit;
uniform float uPixelRatio;
uniform float uSize;
uniform float uTime;
uniform vec3  uLightDir;
uniform float uUseViewFacing;
uniform float uBrightBase;
uniform float uBrightScale;
uniform float uShimmerSpeed;
uniform float uStorm;
uniform float uFocusId;
uniform float uFocusLift;
uniform vec3  uRippleDir;
uniform float uRippleT;
varying vec3 vColor;
varying vec3 vDir;
varying float vLand;
varying float vBorder;
varying float vCountryId;
varying float vFacing;
varying float vRipple;

void main() {
  vec3 dir = normalize(position);
  vDir = dir;
  float phi = acos(clamp(dir.y, -1.0, 1.0));
  float theta = atan(dir.z, -dir.x);
  if (theta < 0.0) theta += 6.283185307;
  vec2 uv = vec2(theta / 6.283185307, phi / 3.141592653);

  vec4 mapSample = texture2D(uMap, uv);
  vLand      = mapSample.r;
  vBorder    = mapSample.g;
  vCountryId = mapSample.b * 15.0;

  vec3 pos = position;
  // Turbulencia de tormenta (clima de riesgo): ondas cruzadas baratas en GPU
  // — la superficie "hierve" sutilmente en risk-off, quieta en risk-on. No
  // toca los buffers de CPU (settle-skip intacto).
  if (uStorm > 0.001) {
    float n = sin(dir.x * 9.0 + uTime * 1.7)
            * sin(dir.y * 11.0 - uTime * 1.3)
            * sin(dir.z * 10.0 + uTime * 2.1);
    pos += dir * n * uStorm * 0.028 * uColorT;
  }
  // Fly-to: el país enfocado se ELEVA en relieve.
  if (uFocusId > 0.5 && abs(vCountryId - uFocusId) < 0.5) {
    pos += dir * uFocusLift * 0.10;
  }

  // Pulso sísmico (click/tap): frente de onda gaussiano que avanza desde el
  // punto tocado por distancia angular, levantando partículas a su paso.
  // uRippleT < 0 = apagado. 100% shader — cero simulación de CPU.
  vRipple = 0.0;
  if (uRippleT >= 0.0) {
    float angDist = acos(clamp(dot(dir, uRippleDir), -1.0, 1.0));
    float wave = angDist - uRippleT * 1.55;
    float ring = exp(-wave * wave * 160.0);
    float decay = exp(-uRippleT * 1.7);
    pos += dir * ring * decay * 0.06;
    vRipple = ring * decay;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  // Dot product between this particle's outward sphere normal and the
  // direction back to the camera, both in view space — positive means the
  // particle is on the near side of the globe. Used in the fragment shader
  // to fade out far-side particles only while the GLOBE tint is active, so
  // the world map doesn't show both hemispheres at once.
  vec3 viewNormal = normalize(normalMatrix * dir);
  vec3 viewDir    = normalize(-mvPosition.xyz);
  vFacing = dot(viewNormal, viewDir);

  // Per-particle brightness: a "facing" term (either camera-relative, for the
  // RiskSphere hero, or a fixed light direction, for the Quant Lab forms)
  // plus a per-particle shimmer driven by uTime — computed on the GPU so the
  // CPU no longer loops over every particle each frame.
  float facingLight = dot(dir, uLightDir);
  float facing = mix(facingLight, vFacing, uUseViewFacing);
  float shimmer = 0.12 * sin(uTime * uShimmerSpeed + jPhase) * (1.0 - uColorT);
  float b = max(0.0, uBrightBase + (facing * 0.5 + 0.5) * uBrightScale + shimmer);
  vColor = vec3(b);

  float size = uSize * (1.0 + vBorder * uColorT * 0.9);
  gl_PointSize = size * uPixelsPerUnit * uPixelRatio / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const GLOBE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D uDot;
uniform float uColorT;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uCountryData[5];
uniform float uSelIds[5];
uniform vec3 uSunDir;
uniform float uNightAmt;
uniform vec3 uCityDir[8];
uniform float uCityGlow[8];
uniform float uStorm;
uniform float uFocusId;
uniform float uFocusLift;
uniform vec3 uRippleColor;
varying vec3 vColor;
varying vec3 vDir;
varying float vLand;
varying float vBorder;
varying float vCountryId;
varying float vFacing;
varying float vRipple;

void main() {
  float b = vColor.r;

  // Temperatura de color: océano azul profundo tenue (antes negro puro — el
  // Pacífico de frente se veía como hoyo vacío) y tierra blanco cálido. La
  // separación frío/cálido es lo que hace leer el mapa como superficie.
  vec3 oceanColor  = vec3(0.10, 0.17, 0.27);
  vec3 landColor   = vec3(2.06, 1.99, 1.87);
  vec3 borderColor = vec3(0.0);
  // Semáforo vívido (2026-07-06: el usuario pidió más brillo/llamativo)
  vec3 riskGreen   = vec3(0.10, 0.72, 0.38);
  vec3 riskYellow  = vec3(0.98, 0.68, 0.12);
  vec3 riskRed     = vec3(1.00, 0.22, 0.16);

  vec3 geo = mix(oceanColor, landColor, vLand);
  geo = mix(geo, borderColor, vBorder);

  // ── Día/noche REAL (posición solar en espacio-objeto): el hemisferio
  // nocturno se apaga y el terminador lleva una banda ámbar de amanecer. ──
  float sunDot = dot(vDir, uSunDir);
  float night = smoothstep(0.09, -0.13, sunDot) * uNightAmt;
  geo *= mix(1.0, 0.40, night * vLand);
  geo *= mix(1.0, 0.72, night * (1.0 - vLand)); // el océano nocturno también baja
  float dawn = (1.0 - smoothstep(0.0, 0.20, abs(sunDot))) * uNightAmt;
  geo += vec3(0.62, 0.34, 0.10) * dawn * 0.18 * vLand;

  // Luces de ciudad: las plazas financieras brillan en la noche; las que
  // están OPERANDO ahora laten (uCityGlow 1.0) y las cerradas quedan tenues.
  vec3 cityCol = vec3(1.0, 0.82, 0.45);
  for (int i = 0; i < 8; i++) {
    float cd2 = dot(vDir, uCityDir[i]);
    float g = smoothstep(0.9974, 0.9998, cd2);
    float tw = mix(1.0, 0.72 + 0.28 * sin(uTime * 2.4 + float(i) * 1.9), step(0.9, uCityGlow[i]));
    geo += cityCol * g * max(night, 0.25 * uNightAmt) * uCityGlow[i] * tw * 2.1;
  }

  // Traffic-light highlight para los 5 países SELECCIONADOS del universo
  // (uSelIds trae sus maskIds 1-14; el resto del mapa queda neutro), tinted
  // by stress score and pulsing at a rate + intensity that scales with that
  // score, each with its own phase so the countries don't blink in sync.
  // Land-only and shaped by real country polygons.
  int cid = int(vCountryId + 0.5);
  bool selected = false;
  vec2 cd = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    if (cid == int(uSelIds[i] + 0.5)) { cd = uCountryData[i]; selected = true; }
  }
  if (cid >= 1 && selected) {
    float score = cd.x;
    vec3 riskColor = score < 0.5
      ? mix(riskGreen, riskYellow, score * 2.0)
      : mix(riskYellow, riskRed, (score - 0.5) * 2.0);
    // Parpadeo más rápido y con más presencia (piso 0.35 aunque el país esté
    // tranquilo; clamp para no extrapolar el mix con el blending aditivo).
    float pulse = 0.5 + 0.5 * sin(uTime * (1.0 + score * 3.5) + cd.y);
    float amt = clamp((0.35 + 0.75 * score) * pulse * 1.4, 0.0, 1.0) * uColorT;
    geo = mix(geo, riskColor, amt * vLand);

    // Relámpagos de tormenta: en risk-off (uStorm alto), los países en
    // alerta (score>0.65) sueltan flashes blancos-azulados esporádicos —
    // gate pseudoaleatorio por slot de tiempo + decaimiento exponencial.
    if (uStorm > 0.05 && score > 0.65) {
      float cyc = uTime * 1.5 + cd.y * 3.7;
      float slot = floor(cyc);
      float gate = step(0.90, fract(sin(slot * 127.1 + cd.y * 311.7) * 43758.5453));
      float env = exp(-fract(cyc) * 9.0);
      geo += vec3(0.85, 0.90, 1.0) * gate * env * uStorm * vLand * 2.6 * uColorT;
    }
  }

  // Every particle now renders in GLOBE mode (not just a sparse subset), and
  // additive blending stacks the front/back hemispheres on top of each
  // other, so a per-particle gain below 1 keeps that sum near the intended
  // ocean/land/border tone instead of blowing out to white.
  vec3 finalColor = mix(vec3(b), geo * 0.5, uColorT);

  // Fly-to: el país enfocado brilla, el resto del planeta baja la luz
  // (viñeta narrativa — "la cámara" cuenta dónde está la historia).
  if (uFocusId > 0.5) {
    float isFocus = 1.0 - step(0.5, abs(vCountryId - uFocusId));
    finalColor *= mix(1.0 - uFocusLift * 0.35, 1.0 + uFocusLift * 0.85, isFocus);
  }

  // Pulso sísmico: el frente de onda brilla del color de la banda del día.
  finalColor += uRippleColor * vRipple * 1.5 * uColorT;

  // Fade out far-side particles only while the GLOBE tint is active, so the
  // map reads as a single solid sphere instead of front+back continents
  // showing through each other. Other forms keep every particle visible.
  // Corte del hemisferio lejano: antes (−0.08→0.05) dejaba pasar partículas
  // rasantes del lado oculto — en el borde de la esfera se veían como
  // "puntitos flotando en el mar" y una medialuna dura. Cortar ya de frente
  // (0.02→0.14) limpia el limbo.
  float frontVis = smoothstep(0.02, 0.14, vFacing);
  float visibility = mix(1.0, frontVis, uColorT);

  vec4 dot = texture2D(uDot, gl_PointCoord);
  gl_FragColor = vec4(finalColor, 1.0) * dot * uOpacity * visibility;
}
`;

// Atmósfera: halo fresnel azul-blanco en el limbo del globo. Se renderiza en
// una esfera BackSide ligeramente mayor que el globo — la porción visible
// alrededor de la silueta produce un aro de luz suave que se desvanece hacia
// afuera. Additive, sin depth: convive con las partículas sin ordenarse.
export const ATMO_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal  = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const ATMO_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform float uPulse;
uniform float uStorm;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 3.0);
  // Respiración: la intensidad ondula lento (uPulse la acelera en risk-off,
  // la calma en risk-on). Deriva tipo aurora: ondas suaves que RECORREN la
  // circunferencia del aro (ángulo en view-space + tiempo), en dos
  // frecuencias desfasadas para que no se lea como patrón. Nada parpadea:
  // todo es senoidal lento. Con TORMENTA (uStorm), la respiración y la
  // deriva se agitan — la atmósfera entera se pone inquieta.
  float breathe = 1.0 + (0.22 + 0.20 * uStorm) * sin(uTime * uPulse);
  float ang = atan(vNormal.y, vNormal.x);
  float stormAmp = 1.0 + uStorm * 0.9;
  float drift = 1.0
    + 0.16 * stormAmp * sin(ang * 3.0 - uTime * (0.55 + uStorm * 0.5))
    + 0.10 * stormAmp * sin(ang * 5.0 + uTime * (0.33 + uStorm * 0.4) + 1.7)
    + 0.07 * uStorm * sin(ang * 9.0 - uTime * 1.6);
  gl_FragColor = vec4(uColor, rim * uIntensity * 0.55 * breathe * drift);
}
`;

// Fronteras de país como LÍNEAS vectoriales (LineSegments): nítidas e
// independientes de la densidad de partículas. Mismo corte de hemisferio
// lejano que las partículas (smoothstep sobre facing) para que no se vea la
// malla política del lado oculto.
export const BORDER_LINE_VERTEX_SHADER = /* glsl */ `
varying float vFacing;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normalize(position));
  vFacing = dot(n, normalize(-mv.xyz));
  gl_Position = projectionMatrix * mv;
}
`;

export const BORDER_LINE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uColorT;
uniform vec3 uColor;
varying float vFacing;
void main() {
  float frontVis = smoothstep(0.02, 0.14, vFacing);
  gl_FragColor = vec4(uColor, frontVis * uColorT * 0.38);
}
`;

// Posiciones para THREE.LineSegments de fronteras, en el MISMO marco angular
// que usa el shader del globo para mapear la textura (theta = atan(z, -x)):
// x = -cos(lat)·cos(t), y = sin(lat), z = cos(lat)·sin(t), t = (lon+180)°.
// Si la línea se dibujara con la convención estándar quedaría espejeada
// respecto al mapa de partículas. Segmentos que cruzan el antimeridiano se
// saltan (mismo criterio que buildGeoCanvas).
export async function makeBorderPositions(r) {
  const m = await import("./geoMasks");
  const { lats, lons, edges } = decodeBorderLatLon(m);
  const out = new Float32Array(edges.length * 3);
  const D = Math.PI / 180;
  let w = 0;
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1];
    if (Math.abs(lons[a] - lons[b]) > 180) continue;
    for (const i of [a, b]) {
      const lat = lats[i] * D, t = (lons[i] + 180) * D;
      const cl = Math.cos(lat);
      out[w++] = -cl * Math.cos(t) * r;
      out[w++] = Math.sin(lat) * r;
      out[w++] = cl * Math.sin(t) * r;
    }
  }
  return out.slice(0, w);
}

// ── Flujos de capital: arcos animados entre plazas financieras ───────────────
// Cada ruta es un gran círculo elevado sobre la superficie; el shader anima
// "cometas" de luz recorriéndolo. La DIRECCIÓN cuenta el régimen: risk-on →
// el capital fluye del núcleo (NY/LDN/TYO) hacia emergentes; risk-off → se
// invierte y drena de vuelta. El arco NY↔CDMX es la arteria de la casa
// (aSpecial=1): late con el movimiento del USD/MXN del día.
export const FIN_CENTERS = [
  { id: "nyc", name: "Nueva York", lat: 40.7,   lon: -74.0,  tz: "America/New_York" },
  { id: "ldn", name: "Londres",    lat: 51.5,   lon: -0.1,   tz: "Europe/London" },
  { id: "tyo", name: "Tokio",      lat: 35.7,   lon: 139.7,  tz: "Asia/Tokyo" },
  { id: "syd", name: "Sídney",     lat: -33.9,  lon: 151.2,  tz: "Australia/Sydney" },
  { id: "hkg", name: "Hong Kong",  lat: 22.3,   lon: 114.2,  tz: "Asia/Hong_Kong" },
  { id: "fra", name: "Fráncfort",  lat: 50.1,   lon: 8.7,    tz: "Europe/Berlin" },
  { id: "mex", name: "CDMX",       lat: 19.4,   lon: -99.1,  tz: "America/Mexico_City" },
  { id: "sao", name: "São Paulo",  lat: -23.55, lon: -46.6,  tz: "America/Sao_Paulo" },
];
// [núcleo, destino, especial] — el flujo "hacia EM" corre de a→b.
export const FLOW_ROUTES = [
  ["nyc", "mex", 1],
  ["nyc", "sao", 0], ["ldn", "mex", 0], ["nyc", "ldn", 0],
  ["ldn", "fra", 0], ["ldn", "tyo", 0], ["tyo", "hkg", 0],
  ["hkg", "syd", 0], ["nyc", "tyo", 0], ["sao", "ldn", 0],
];

export const FLOW_VERTEX_SHADER = /* glsl */ `
attribute float aT;
attribute float aSpecial;
varying float vT;
varying float vSpecial;
varying float vFacing;
void main() {
  vT = aT; vSpecial = aSpecial;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normalize(position));
  vFacing = dot(n, normalize(-mv.xyz));
  gl_Position = projectionMatrix * mv;
}
`;

export const FLOW_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uColorT;
uniform float uFlowDir;
uniform vec3 uFlowColor;
uniform float uMxnPulse;
varying float vT;
varying float vSpecial;
varying float vFacing;
void main() {
  // Cometas: cabeza brillante + cola que se desvanece, recorriendo el arco.
  float speed = mix(0.16, 0.26 + uMxnPulse, vSpecial);
  float phase = fract(vT * 3.0 - uTime * speed * uFlowDir);
  float comet = pow(1.0 - phase, 5.0);
  float base = 0.10 + comet * 0.90;
  float ends = smoothstep(0.0, 0.06, vT) * smoothstep(1.0, 0.94, vT);
  float frontVis = smoothstep(-0.06, 0.10, vFacing);
  vec3 col = mix(uFlowColor, vec3(1.0), vSpecial * 0.45 + comet * 0.35) * (1.0 + comet * 0.6);
  gl_FragColor = vec4(col, base * ends * frontVis * uColorT * (0.62 + vSpecial * 0.33));
}
`;

export function makeFlowGeometry(THREE, r) {
  const SEG = 64;
  const pts = [], ts = [], specials = [];
  const byId = Object.fromEntries(FIN_CENTERS.map((c) => [c.id, c]));
  const dirOf = (c) => { const d = latLonToDir(c.lat, c.lon); return new THREE.Vector3(d.x, d.y, d.z); };
  for (const [aId, bId, special] of FLOW_ROUTES) {
    const a = dirOf(byId[aId]), b = dirOf(byId[bId]);
    const ang = a.angleTo(b);
    const lift = 0.10 + 0.16 * (ang / Math.PI); // los arcos largos vuelan más alto
    let prev = null, prevT = 0;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      // normalize(lerp) ≈ slerp para rutas no antipodales — suficiente visual.
      const p = a.clone().lerp(b, t).normalize()
        .multiplyScalar(r * (1 + Math.sin(Math.PI * t) * lift));
      if (prev) {
        pts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        ts.push(prevT, t);
        specials.push(special, special);
      }
      prev = p; prevT = t;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
  g.setAttribute("aSpecial", new THREE.Float32BufferAttribute(specials, 1));
  return g;
}

// ── Sol real: dirección del punto subsolar en el MISMO espacio-objeto de las
// partículas (declinación estacional + ángulo horario UTC; sin ecuación del
// tiempo — ±15 min de error es invisible a esta escala). ─────────────────────
export function sunDirNow(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60;
  const lon = (12 - utcH) * 15;
  return latLonToDir(decl, lon);
}

// Glow por plaza: 1.0 si su mercado local está operando (Lun-Vie ~8-17 hora
// local, DST gratis vía Intl), 0.35 tenue si está cerrada.
export function cityGlowNow(date = new Date()) {
  return FIN_CENTERS.map((c) => {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: c.tz, hour: "numeric", weekday: "short", hour12: false,
      }).formatToParts(date);
      const h = Number(parts.find((p) => p.type === "hour")?.value ?? 12) % 24;
      const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
      const open = wd !== "Sat" && wd !== "Sun" && h >= 8 && h < 17;
      return open ? 1.0 : 0.35;
    } catch { return 0.5; }
  });
}

// Thomas attractor — a more symmetric chaotic flow that loops between
// "regimes" without a fixed pattern, like markets cycling risk-on / risk-off.
export function genThomas(n) {
  const pos = new Float32Array(n * 3);
  const b = 0.19, dt = 0.02;
  let x = 1.1, y = 1.1, z = -0.01;
  for (let i = 0; i < 1000; i++) { // burn-in onto the attractor
    const dx = (Math.sin(y) - b * x) * dt, dy = (Math.sin(z) - b * y) * dt, dz = (Math.sin(x) - b * z) * dt;
    x += dx; y += dy; z += dz;
  }
  for (let i = 0; i < n; i++) {
    pos[i*3]   = x * 0.4;
    pos[i*3+1] = y * 0.4;
    pos[i*3+2] = z * 0.4;
    const dx = (Math.sin(y) - b * x) * dt, dy = (Math.sin(z) - b * y) * dt, dz = (Math.sin(x) - b * z) * dt;
    x += dx; y += dy; z += dz;
  }
  return pos;
}

// Edge list connecting consecutive points — draws an attractor's trajectory
// as a continuous wireframe curve through phase space.
export function genChainEdges(n) {
  const edges = new Uint32Array((n - 1) * 2);
  for (let i = 0; i < n - 1; i++) {
    edges[i*2]   = i;
    edges[i*2+1] = i + 1;
  }
  return edges;
}

// Voronoi tessellation — random seed points joined into a k-NN graph, with
// particles distributed along the edges (weighted by length). Each region
// is the "zone of influence" of its seed, like markets splitting into
// sectors of correlated risk.
export function genVoronoi(n, r) {
  const SEEDS = 80, K = 7;
  const seeds = [];
  while (seeds.length < SEEDS) {
    const x = (Math.random() - 0.5) * r * 2.2;
    const y = (Math.random() - 0.5) * r * 2.2;
    const z = (Math.random() - 0.5) * r * 2.2;
    if (x*x + y*y + z*z < r * r * 1.15) seeds.push([x, y, z]);
  }
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
  const lens = edges.map(([a, b]) => {
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

// Orbital "atom" model — concentric rings of particles, each ring rotating
// at its own speed/plane around a dense central nucleus. Like sector/asset
// cycles rotating around a shared macro core.
function ringPos(a, b, rx, rz, phi, buf, i) {
  const lx = a * Math.cos(phi);
  const ly = b * Math.sin(phi);
  const cy = ly * Math.cos(rx), cz = ly * Math.sin(rx);
  buf[i*3]   = lx * Math.cos(rz) - cy * Math.sin(rz);
  buf[i*3+1] = lx * Math.sin(rz) + cy * Math.cos(rz);
  buf[i*3+2] = cz;
}

export function atomRings(r) {
  const k = r / 2.4;
  return [
    { a: 2.2 * k, b: 2.2 * k, rx: 0,              rz: 0              },
    { a: 2.0 * k, b: 2.0 * k, rx: Math.PI / 3,    rz: 0              },
    { a: 2.1 * k, b: 2.1 * k, rx: -Math.PI / 4,   rz: Math.PI / 4    },
    { a: 1.8 * k, b: 1.8 * k, rx: Math.PI / 2,    rz: Math.PI / 6    },
  ];
}

export function genAtom(n, r) {
  const rings    = atomRings(r);
  const nucleusN = Math.round(n * 0.06);
  const ringN    = n - nucleusN;
  const perRing  = Math.round(ringN / rings.length);
  const phases   = new Float32Array(n);
  const rIdx     = new Uint8Array(n).fill(255); // 255 = nucleus
  const pos      = new Float32Array(n * 3);

  let pi = 0;
  for (let ri = 0; ri < rings.length; ri++) {
    const { a, b, rx, rz } = rings[ri];
    const cnt = ri < rings.length - 1 ? perRing : (ringN - perRing * (rings.length - 1));
    for (let k = 0; k < cnt && pi < n - nucleusN; k++) {
      const phi = (k / Math.max(1, cnt)) * Math.PI * 2;
      phases[pi] = phi;
      rIdx[pi]   = ri;
      ringPos(a, b, rx, rz, phi, pos, pi);
      pi++;
    }
  }
  for (; pi < n; pi++) {
    const r2 = 0.25 * (r / 2.4) * Math.cbrt(Math.random());
    const u  = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    pos[pi*3]   = r2 * Math.sin(ph) * Math.cos(th);
    pos[pi*3+1] = r2 * Math.cos(ph);
    pos[pi*3+2] = r2 * Math.sin(ph) * Math.sin(th);
  }
  return { pos, phases, rIdx };
}

export function tickAtom(home, phases, rIdx, elapsed, n, r) {
  const rings = atomRings(r);
  const speed = 0.35;
  for (let i = 0; i < n; i++) {
    if (rIdx[i] === 255) continue;
    const { a, b, rx, rz } = rings[rIdx[i]];
    ringPos(a, b, rx, rz, phases[i] + elapsed * speed, home, i);
  }
}

export function makeDotTexture(THREE) {
  // 128 y potencia de 2: el 48 anterior era NPOT y three r128 (WebGL1) lo
  // re-escalaba internamente a POT con blur al generar mipmaps — punto
  // borroso justo en pantallas de DPR alto.
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,   "rgba(255,255,255,1)");
  g.addColorStop(0.7, "rgba(255,255,255,0.9)");
  g.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export const FORMS = [
  {
    id: "SPHERE",
    label_es: "Movimiento Browniano", label_en: "Brownian Motion",
    formula: "dS = μS·dt + σS·dW",
    es: "Cada partícula traza una posible trayectoria futura del precio: tendencia más ruido aleatorio. Es el motor detrás de Black-Scholes y de la simulación Monte Carlo de derivados.",
    en: "Each particle traces a possible future price path: drift plus random noise. It's the engine behind Black-Scholes and Monte Carlo derivatives pricing.",
  },
  {
    id: "GLOBE",
    label_es: "Mapa de Riesgo Global", label_en: "Global Risk Map",
    formula: "σ²ₚ = Σ wᵢwⱼσᵢσⱼρᵢⱼ",
    es: "El riesgo no se distribuye igual por el planeta: cada región tiene su propia volatilidad y su propia correlación con las demás. Diversificar geográficamente — no solo entre activos — es una de las formas más simples de reducir el riesgo total de un portafolio.",
    en: "Risk isn't spread evenly across the planet: every region has its own volatility and its own correlation with the rest. Diversifying geographically — not just across assets — is one of the simplest ways to reduce a portfolio's total risk.",
  },
  {
    id: "THOMAS",
    label_es: "Atractor de Thomas", label_en: "Thomas Attractor",
    formula: "dx/dt = sin(y) − bx",
    es: "Otro sistema caótico, más simétrico: la trayectoria gira entre distintos \"regímenes\" sin un patrón fijo, saltando de uno a otro de forma impredecible — como el mercado alternando entre risk-on y risk-off.",
    en: "Another chaotic system, more symmetric: the path loops between different \"regimes\" with no fixed pattern, jumping from one to another unpredictably — like markets swinging between risk-on and risk-off.",
  },
];

// Forms selectable from the homepage hero's figure switcher. GLOBE is
// always first/default. Separate from FORMS (used by /learn Quant Lab) so
// reordering or adding entries here doesn't affect that page.
export const HERO_FORMS = [
  FORMS.find(f => f.id === "GLOBE"),
  FORMS.find(f => f.id === "SPHERE"),
  FORMS.find(f => f.id === "THOMAS"),
  {
    id: "VORONOI",
    label_es: "Teselado de Voronoi", label_en: "Voronoi Tessellation",
    formula: "Vᵢ = {x : ‖x−pᵢ‖ ≤ ‖x−pⱼ‖}",
    es: "Cada partícula pertenece a la región más cercana a un punto semilla: así se reparten mercados y sectores en zonas de influencia. Un cambio en un solo punto reconfigura las fronteras de todas las regiones vecinas — como un shock que reacomoda las correlaciones entre activos.",
    en: "Each particle belongs to the region closest to a seed point — this is how markets and sectors split into zones of influence. A shift in a single point reshapes the borders of every neighboring region — like a shock that reshuffles correlations across assets.",
  },
  {
    id: "ATOM",
    label_es: "Modelo Orbital", label_en: "Orbital Model",
    formula: "r(t) = (cos ωt, sin ωt, θ)",
    es: "Activos que orbitan en ciclos distintos — renta fija, acciones, materias primas — cada uno con su propio periodo y plano, girando alrededor de un núcleo común. Los ciclos económicos y de tasas se mueven así: capas concéntricas que rotan a velocidades diferentes.",
    en: "Assets orbiting on distinct cycles — bonds, equities, commodities — each with its own period and plane, circling a shared core. Economic and rate cycles move the same way: concentric layers rotating at different speeds.",
  },
];

// Las 4 figuras matemáticas (el globo vive solo en la portada). Se muestran en el
// Quant Lab de /learn. No borrar — por si se quieren regresar a la portada.
export const LAB_FORMS = [
  FORMS.find((f) => f.id === "SPHERE"),
  FORMS.find((f) => f.id === "THOMAS"),
  HERO_FORMS.find((f) => f.id === "VORONOI"),
  HERO_FORMS.find((f) => f.id === "ATOM"),
];
