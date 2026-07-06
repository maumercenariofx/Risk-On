// Generator for COUNTRY_MASK_B64 in lib/geoMasks.js.
// Rasterizes the COUNTRY_UNIVERSE (14 países candidatos; el sitio elige los 5
// más calientes cada hora) into a 360x180 (1deg) grid using real
// point-in-polygon against world-atlas 50m country boundaries, packing
// 2 cells (4-bit country id, 0-15) per byte — same row-major,
// north-pole-first convention as LAND_MASK_B64. REPLACES the existing
// COUNTRY_MASK_B64 line in lib/geoMasks.js.
import atlas from "world-atlas/countries-50m.json" with { type: "json" };
import * as topojson from "topojson-client";
import fs from "fs";

const COLS = 360, ROWS = 180;
const geo = topojson.feature(atlas, atlas.objects.countries);

// maskId order MUST match COUNTRY_UNIVERSE in lib/quantForms.js (1-14).
const ORDER = [
  ["484", 1],  // mx
  ["840", 2],  // us
  ["156", 3],  // cn
  ["076", 4],  // br
  ["792", 5],  // tr
  ["392", 6],  // jp
  ["826", 7],  // gb
  ["276", 8],  // de
  ["356", 9],  // in
  ["410", 10], // kr
  ["710", 11], // za
  ["032", 12], // ar
  ["152", 13], // cl
  ["170", 14], // co
];

// Solo polígonos con bounding box >= 1.5 deg²: los islotes remotos de un país
// (Noronha, Pascua, etc.) se veían como pixeles sueltos brillando en el mar.
function bboxArea(ring) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

const polys = ORDER.map(([iso, id]) => {
  const f = geo.features.find((f) => f.id === iso);
  const geom = f.geometry;
  const rings = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return { id, rings: rings.map((poly) => poly[0]).filter((r) => bboxArea(r) >= 1.5) };
});

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

const ids = new Uint8Array(COLS * ROWS);
for (let row = 0; row < ROWS; row++) {
  const lat = 90 - (row + 0.5) * (180 / ROWS);
  for (let col = 0; col < COLS; col++) {
    const lon = -180 + (col + 0.5) * (360 / COLS);
    let cid = 0;
    for (const { id, rings } of polys) {
      for (const ring of rings) {
        if (pointInRing(lon, lat, ring)) { cid = id; break; }
      }
      if (cid) break;
    }
    ids[row * COLS + col] = cid;
  }
}

const packed = new Uint8Array(Math.ceil((COLS * ROWS) / 2));
for (let i = 0; i < COLS * ROWS; i++) {
  const nibble = ids[i] & 0x0f;
  const byteIdx = i >> 1;
  if (i % 2 === 0) packed[byteIdx] |= nibble;
  else packed[byteIdx] |= nibble << 4;
}

const b64 = Buffer.from(packed).toString("base64");

// Reemplaza la línea existente de COUNTRY_MASK_B64 en lib/geoMasks.js.
const file = "lib/geoMasks.js";
const src = fs.readFileSync(file, "utf8");
const re = /export const COUNTRY_MASK_B64 = "[^"]*";/;
if (!re.test(src)) throw new Error("COUNTRY_MASK_B64 not found in " + file);
fs.writeFileSync(file, src.replace(re, `export const COUNTRY_MASK_B64 = "${b64}";`));
console.log("replaced COUNTRY_MASK_B64:", b64.length, "base64 chars,", ORDER.length, "countries");
