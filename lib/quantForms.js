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

// Implied volatility surface sigma(K,T): smile across strike, steepens near T->0.
export function genVolSurface(n, cols, rows) {
  const pos = new Float32Array(n * 3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const u = col / (cols - 1);
      const v = row / (rows - 1);
      const K = (u - 0.5) * 5;     // strike, centered on ATM
      const T = 0.05 + v * 1.95;   // time to maturity (years)
      let sigma = 0.16 + (0.06 * K * K) / (T + 0.15) - 0.015 * K;
      sigma = Math.max(0.08, Math.min(0.85, sigma));
      pos[i*3]   = K * 0.7;
      pos[i*3+1] = (sigma - 0.32) * 3.2;
      pos[i*3+2] = (T - 1.0) * 1.0;
    }
  }
  return pos;
}

// Hyperbolic saddle — curved portfolio space (Fisher information metric).
export function genSaddle(n, cols, rows) {
  const pos = new Float32Array(n * 3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const u = col / (cols - 1);
      const v = row / (rows - 1);
      const x = (u - 0.5) * 3.6;
      const z = (v - 0.5) * 3.6;
      pos[i*3]   = x;
      pos[i*3+1] = (x * x - z * z) * 0.32;
      pos[i*3+2] = z;
    }
  }
  return pos;
}

// Edge list for a COLSxROWS grid — drawn as a wireframe over the vol surface /
// saddle so they read as surfaces, not just a cloud of points.
export function genGridEdges(cols, rows) {
  const edges = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (col < cols - 1) edges.push(i, i + 1);
      if (row < rows - 1) edges.push(i, i + cols);
    }
  }
  return new Uint32Array(edges);
}

// Geodesic across the saddle — the path a quant rebalancer would follow.
export function genGeodesic(numPts) {
  const pos = new Float32Array(numPts * 3);
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const x = (t - 0.5) * 3.6;
    const z = 1.5 * Math.sin(Math.PI * t);
    pos[i*3]   = x;
    pos[i*3+1] = (x * x - z * z) * 0.32 + 0.03;
    pos[i*3+2] = z;
  }
  return pos;
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
    id: "VOLSURFACE",
    label_es: "Superficie de Volatilidad", label_en: "Volatility Surface",
    formula: "σ(K, T)",
    es: "La volatilidad implícita no es plana: forma una \"sonrisa\" en el eje del strike (K) — el mercado cobra más por movimientos extremos — y se empina cerca del vencimiento (T) cuando hay eventos próximos.",
    en: "Implied volatility isn't flat: it forms a \"smile\" across strikes (K) — the market prices in fatter tails — and steepens near expiry (T) ahead of upcoming events.",
  },
  {
    id: "SADDLE",
    label_es: "Geometría de Riesgo (Fisher)", label_en: "Risk Geometry (Fisher)",
    formula: "gᵢⱼ = E[∂ᵢlnL · ∂ⱼlnL]",
    es: "Los fondos cuant modelan las correlaciones de un portafolio como una superficie curva (silla hiperbólica). Para rebalancear no trazan una línea recta: siguen la geodésica — la ruta que minimiza la fricción al moverse por ese espacio.",
    en: "Quant funds model portfolio correlations as a curved surface (hyperbolic saddle). To rebalance they don't move in a straight line — they follow the geodesic, the path that minimizes friction across that space.",
  },
];
