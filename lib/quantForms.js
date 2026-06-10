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

// Lorenz attractor — deterministic chaos: paths starting almost identical
// fan out onto completely different "wings" (the butterfly effect).
export function genLorenz(n) {
  const pos = new Float32Array(n * 3);
  const sigma = 10, rho = 28, beta = 8 / 3, dt = 0.005;
  let x = 0.1, y = 0, z = 0;
  for (let i = 0; i < 1000; i++) { // burn-in onto the attractor
    const dx = sigma * (y - x) * dt, dy = (x * (rho - z) - y) * dt, dz = (x * y - beta * z) * dt;
    x += dx; y += dy; z += dz;
  }
  for (let i = 0; i < n; i++) {
    pos[i*3]   = x * 0.07;
    pos[i*3+1] = (z - 25) * 0.07;
    pos[i*3+2] = y * 0.07;
    const dx = sigma * (y - x) * dt, dy = (x * (rho - z) - y) * dt, dz = (x * y - beta * z) * dt;
    x += dx; y += dy; z += dz;
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
    id: "LORENZ",
    label_es: "Atractor de Lorenz", label_en: "Lorenz Attractor",
    formula: "dx/dt = σ(y − x)",
    es: "Un sistema caótico determinista: trayectorias que arrancan casi idénticas terminan en alas completamente distintas. Es la metáfora clásica del \"efecto mariposa\" — un dato económico menor puede desatar un movimiento de mercado desproporcionado.",
    en: "A deterministic chaotic system: paths that start almost identical end up on completely different wings. It's the classic \"butterfly effect\" — a minor economic data point can trigger a disproportionate market move.",
  },
  {
    id: "THOMAS",
    label_es: "Atractor de Thomas", label_en: "Thomas Attractor",
    formula: "dx/dt = sin(y) − bx",
    es: "Otro sistema caótico, más simétrico: la trayectoria gira entre distintos \"regímenes\" sin un patrón fijo, saltando de uno a otro de forma impredecible — como el mercado alternando entre risk-on y risk-off.",
    en: "Another chaotic system, more symmetric: the path loops between different \"regimes\" with no fixed pattern, jumping from one to another unpredictably — like markets swinging between risk-on and risk-off.",
  },
];
