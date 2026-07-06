// Regenerador de LAND_MASK_B64 en lib/geoMasks.js.
// La máscara original traía una FILA CORRUPTA en lat -16.5 (una raya de
// "tierra" cruzando el Pacífico desde Perú hasta lon -105) — se veía como una
// línea de puntitos en el mar. Rasteriza de nuevo 360x180 (1°) con
// point-in-polygon real contra los países de world-atlas 50m (su unión =
// tierra firme). Mismo encoding que el decode de quantForms: row-major desde
// el polo norte, 1 bit por celda, LSB primero dentro del byte.
import atlas from "world-atlas/countries-50m.json" with { type: "json" };
import * as topojson from "topojson-client";
import fs from "fs";

const COLS = 360, ROWS = 180;
const geo = topojson.feature(atlas, atlas.objects.countries);

// Anillos exteriores de TODOS los países, con bbox para descartar rápido.
// Anillos que CRUZAN el antimeridiano (Fiji, este de Rusia…) rompen la
// paridad del ray-casting y pintaban filas enteras de "tierra" (así nació la
// raya corrupta en lat -16.5 = latitud de Fiji): se detectan por un salto de
// lon > 180 entre vértices consecutivos y se re-mapean a un marco continuo
// 0..360 (lons negativas +360); al muestrear se usa la lon equivalente.
const rings = [];
for (const f of geo.features) {
  const g = f.geometry;
  if (!g) continue;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    let ring = poly[0];
    let wraps = false;
    for (let i = 1; i < ring.length; i++) {
      if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { wraps = true; break; }
    }
    if (wraps) ring = ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    rings.push({ ring, minX, maxX, minY, maxY, wraps });
  }
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

const bits = new Uint8Array(Math.ceil((COLS * ROWS) / 8));
let landCells = 0;
// Epsilon: si la lat/lon del muestreo coincide EXACTA con un vértice del
// polígono, la paridad del ray-casting se rompe (así nació la fila corrupta
// -16.5 de la máscara original — Natural Earth tiene vértices en esa lat).
const EPS = 1e-6;
for (let row = 0; row < ROWS; row++) {
  const lat = 90 - (row + 0.5) + EPS;
  for (let col = 0; col < COLS; col++) {
    const lon = -180 + (col + 0.5) + EPS;
    let land = false;
    for (const r of rings) {
      const lx = r.wraps && lon < 0 ? lon + 360 : lon;
      if (lx < r.minX || lx > r.maxX || lat < r.minY || lat > r.maxY) continue;
      if (pointInRing(lx, lat, r.ring)) { land = true; break; }
    }
    if (land) {
      const i = row * COLS + col;
      bits[i >> 3] |= 1 << (i & 7);
      landCells++;
    }
  }
}

const b64 = Buffer.from(bits).toString("base64");
const file = "lib/geoMasks.js";
const src = fs.readFileSync(file, "utf8");
const re = /export const LAND_MASK_B64 = "[^"]*";/;
if (!re.test(src)) throw new Error("LAND_MASK_B64 not found in " + file);

// Diff contra la máscara vieja para reportar qué cambió.
const oldB64 = src.match(/export const LAND_MASK_B64 = "([^"]*)";/)[1];
const oldBits = Buffer.from(oldB64, "base64");
let diff = 0;
for (let i = 0; i < COLS * ROWS; i++) {
  const a = (bits[i >> 3] >> (i & 7)) & 1;
  const b = (oldBits[i >> 3] >> (i & 7)) & 1;
  if (a !== b) diff++;
}

fs.writeFileSync(file, src.replace(re, `export const LAND_MASK_B64 = "${b64}";`));
console.log(`land cells: ${landCells} · celdas distintas vs máscara vieja: ${diff}`);
