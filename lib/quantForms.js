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

// Land/ocean mask of the globe at 1.5° resolution (240×120), 1 bit per cell,
// row-major from the North pole, base64-encoded. Used by genGlobe() to scatter
// particles only over land, so they trace out the continents.
const LAND_COLS = 240, LAND_ROWS = 120;
const LAND_MASK_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPj/z////3EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/++f///wcAAPADgAEAAOADAAAAAAAAAAAAAAAg3N4f/v///wcAAB8AAAAAAAA4AAAAAAAAAAAAAAADAOAH/P///wcAAA4AAAAAAAAwAAAAAAAAAAAAAAC8cQwBAP///wcAAAAAAIAHAMD/DwDwAAAAAAAAAOAAAAAAAPz//wMAAAAAAGAAAPz/AQAAAAAAAAAAAOBdc/MDAPj//wEAAAAAABjAwP///z9gAAAAA4AAAED8A/P/AOD//wEAAAAAADjg/v///z//HwCAAPj/A0/8X4PwB/D//wAAAOA/AADh/v///////wM+A/7///8Pw56BB+D/DwAAAPz/Y+zf/f//////////N/D///////+Bf/D/AQAAAP7/x////v//////////GP7//////7/wJ+AfAH4AAD9++P//////////////AOD//////88GH8AfAAwAwJ////////////////9/APz//////wNxDIAPAAAA8M///////////////98/APzf/////wHwAwAGAAAA+M///////////////+ADAPAB+P///wHwMwAAAAAA8A//////////////ZBgAAIACgP///wPgfwAAAAAQAAf///////////8fAA4AACAAAP///z/gfwAAAAAwYMf///////////8PAB8AAAQAAP7////5/wMAAABoQOj///////////8DAA8AAAAAgPz////5/wcAAADs+P////////////9/AAcAAAAAAPj////7/wMAAADg+f////////////9/AAEAAAAAAPj/////zwAAAAAw/v////////////+/AAAAAAAAAPD/////Gw4AAACg//////////////8fAAAAAAAAAOD/////HxAAAADA//////////////8fAAAAAAAAAOD//////wAAAACA//9P/vj///////8PAAAAAAAAAOD/////EwAAAACA//wHfPz////////HAAAAAAAAAOD/////AQAAAAD8g/EH8Pj////////gAAAAAAAAAOD/////AAAAAAD8Aebn+fH//////z8AAAAAAAAAAOD///9/AAAAAAD8AGT8//H//////xpgAAAAAAAAAMD///8/AAAAAAD8AMT8//H/////fzggAAAAAAAAAID///8fAAAAAABwdAD8/////////zE4AAAAAAAAAID///8fAAAAAACwfwBD/////////zA/AAAAAAAAAAD+//8PAAAAAAD4fwAA/////////wAHAAAAAAAAAAD8//8DAAAAAAD8/2OA/////////4EAAAAAAAAAAADo//8DAAAAAAD8/+///////////wEAAAAAAAAAAADo/wkCAAAAAAD+//////z//////wEAAAAAAAAAAADYfwACAAAAAID///8///n//////wEAAAAAAAAAAACgfwAWAAAAAMD///9//+H//////wAAAAAAAAAAAAAgfwAAAAAAAMD///9//jPg////fwAAAAAAAAAAAAAAfgAAAAAAAOD//////H/A////PwEAAAAAAAAAAAAAfAAIAAAAAOD//////f/A/+f/BwAAAAAAAAAAAAAAfDBwAAAAAOD/////+X8A/sN/AAAAAAAAAAAAAAAA+DgAAwAAAOD/////+T8A/oB/AwAAAAAAAAAAAAAA4B8AAAAAAOD/////8x8AfoB/AAMAAAAAAAAAAAAAgPwAAAAAAOD/////8wcAPoD+AAEAAAAAAAAAAAAAAPgBAAAAAOD/////7wEAHAD+AQEAAAAAAAAAAAAAAMAAAAAAAOD/////PwAAHAD8AQQAAAAAAAAAAAAAAICAAgAAAMD/////HwMAGADgAAoAAAAAAAAAAAAAAADBfgAAAID//////wMAGABAAAAAAAAAAAAAAAAAAADy/wAAAID//////wEAIAAGAAwAAAAAAAAAAAAAAADw/wEAAAD//////wEAIAAIAAgAAAAAAAAAAAAAAADw/x8AAAD8+P///wAAAAAZYAAAAAAAAAAAAAAAAADg/z8AAAAAwP///wAAAAAbMAAAAAAAAAAAAAAAAADw/z8AAAAAwP//fwAAAAAWfAAAAAAAAAAAAAAAAAD4/38AAAAAwP//HwAAAAAcficAAAAAAAAAAAAAAAD8//8BAAAAwP//DwAAAAAYPiABAAAAAAAAAAAAAAD8//8DAAAAwP//BwAAAAA4vgEaAAAAAAAAAAAAAAD8//8/AAAAgP//BwAAAABwEBL+AAAAAAAAAAAAAAD8////AAAAAP//AwAAAABgAADwAQAAAAAAAAAAAAD8////AQAAAP//AwAAAADABADyAwEAAAAAAAAAAAD4////AQAAAP7/AwAAAAAAHADwBgQAAAAAAAAAAADw////AAAAAP7/BwAAAAAAAAQADAAAAAAAAAAAAADw//9/AAAAAP7/BwAAAAAAAAAAAAAAAAAAAAAAAADg//9/AAAAAP7/BwAAAAAAAICHAAAAAAAAAAAAAADg//8/AAAAAP//BwEAAAAAANDHAAAAAAAAAAAAAADA//8/AAAAAP//hwMAAAAAAPjHAQAAAAAAAAAAAAAA//8/AAAAAP//4QEAAAAAAPzfAQAAAAAAAAAAAAAA/v8/AAAAAP//4AEAAAAAAP7/AwAAAAAAAAAAAAAA/v8fAAAAAP5/wAAAAAAAgP//ByAAAAAAAAAAAAAA/v8fAAAAAP7/4AAAAAAA4P//D0AAAAAAAAAAAAAA/v8HAAAAAPz/4AAAAAAA8P//HwAAAAAAAAAAAAAA/v8AAAAAAPx/YAAAAAAA8P//PwAAAAAAAAAAAAAA/v8AAAAAAPw/AAAAAAAA8P//PwAAAAAAAAAAAAAA/v8AAAAAAPw/AAAAAAAA8P//PwAAAAAAAAAAAAAA/38AAAAAAPgfAAAAAAAA4P//PwAAAAAAAAAAAAAA/z8AAAAAAPAPAAAAAAAA4P//PwAAAAAAAAAAAAAA/x8AAAAAAPAHAAAAAAAA4B/+PwAAAAAAAAAAAAAA/w8AAAAAAPABAAAAAAAA4Af0HwAAAAAAAAAAAAAA/wMAAAAAAAAAAAAAAAAAAADwDwAIAAAAAAAAAACA/wMAAAAAAAAAAAAAAAAAAADgDwAQAAAAAAAAAACA/wEAAAAAAAAAAAAAAAAAAADAAgBwAAAAAAAAAACAfwAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAACAHwAAAAAAAAAAAAAAAAAAAAAABgAQAAAAAAAAAACAHwAAAAAAAAAAAAAAAAAAAAAABgAMAAAAAAAAAADADwAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAADABwAAAAAAAAAAAAAAAAAAAAAAAIADAAAAAAAAAADADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAgwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAADwAAAR4Pv4HAAAAAAAAAAAAAAAACAAAAAAAAAAA4P8/4P//////BwAAAAAAAAAAAAAAPwAAAAAAAADg//8//P///////wMAAAAAAAAAAACAewAAAADI/v////8///////////8BAAAAAAAAABAAeAAAAID///////////////////8DAAAAAAAe4P//fwAAAMD//////////////////38AAADA////////BwAAAPz//////////////////x8AAEDz//////8/AAAA8P///////////////////x8AABj///////8PAIAH/////////////////////38AAADA//////8/gPAD4P///////////////////wcAAAD+////////P4Dx/////////////////////w8AAAD8//////////////////////////////////8A/wMA/v//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////";

let _landCells = null;
function landCells() {
  if (_landCells) return _landCells;
  const bytes = Uint8Array.from(atob(LAND_MASK_B64), (c) => c.charCodeAt(0));
  const cells = [];
  for (let r = 0; r < LAND_ROWS; r++) {
    for (let c = 0; c < LAND_COLS; c++) {
      const i = r * LAND_COLS + c;
      if (bytes[i >> 3] & (1 << (i & 7))) cells.push(i);
    }
  }
  _landCells = cells;
  return cells;
}

// Globe — particles scattered only over land, so they trace out the
// continents on the surface of a sphere (a low-poly "world map").
export function genGlobe(n, r) {
  const pos   = new Float32Array(n * 3);
  const cells = landCells();
  for (let i = 0; i < n; i++) {
    const cell = cells[(Math.random() * cells.length) | 0];
    const row  = (cell / LAND_COLS) | 0;
    const col  = cell % LAND_COLS;
    const lat  = 90 - (row + Math.random()) * (180 / LAND_ROWS);
    const lon  = -180 + (col + Math.random()) * (360 / LAND_COLS);
    const phi   = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    pos[i*3]   = -r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] =  r * Math.cos(phi);
    pos[i*3+2] =  r * Math.sin(phi) * Math.sin(theta);
  }
  return pos;
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

export function makeDotTexture(THREE) {
  const size = 48;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0,   "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
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
