// One-off generator/inserter for COUNTRY_MASK_B64 in lib/quantForms.js.
// Rasterizes the 5 RISK_COUNTRIES (mx, us, cn, br, tr) into a 360x180
// (1deg) grid using real point-in-polygon against world-atlas 50m
// country boundaries, packing 2 cells (4-bit country id, 0-5) per byte —
// same row-major, north-pole-first convention as LAND_MASK_B64. Inserts
// the result as a new const right after LAND_MASK_B64 in quantForms.js.
import atlas from "world-atlas/countries-50m.json" with { type: "json" };
import * as topojson from "topojson-client";
import fs from "fs";

const COLS = 360, ROWS = 180;
const geo = topojson.feature(atlas, atlas.objects.countries);

// id order matches RISK_COUNTRIES in lib/quantForms.js -> country id 1-5
const ORDER = [
  ["484", 1], // mx
  ["840", 2], // us
  ["156", 3], // cn
  ["076", 4], // br
  ["792", 5], // tr
];

const polys = ORDER.map(([iso, id]) => {
  const f = geo.features.find((f) => f.id === iso);
  const geom = f.geometry;
  const rings = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return { id, rings: rings.map((poly) => poly[0]) }; // outer ring only
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

const file = "lib/quantForms.js";
const src = fs.readFileSync(file, "utf8");
const marker = 'const LAND_MASK_B64 = ';
const idx = src.indexOf(marker);
if (idx === -1) throw new Error("LAND_MASK_B64 not found");
const lineEnd = src.indexOf("\n", idx);

const insertion =
  `\n\n// Country-id mask for the curated RISK_COUNTRIES (mx=1, us=2, cn=3, br=4,\n` +
  `// tr=5; 0=none) at the same 360x180 (1deg) resolution as the land mask,\n` +
  `// packed 2 cells per byte (4-bit ids). Built via real point-in-polygon\n` +
  `// against world-atlas 50m country boundaries (scripts/gen-country-mask.mjs)\n` +
  `// so the per-country highlight in the GLOBE shader respects real borders.\n` +
  `const COUNTRY_COLS = 360, COUNTRY_ROWS = 180;\n` +
  `const COUNTRY_MASK_B64 = "${b64}";`;

const out = src.slice(0, lineEnd + 1) + insertion.slice(1) + src.slice(lineEnd + 1);
fs.writeFileSync(file, out);
console.log("inserted", b64.length, "base64 chars after line", src.slice(0, idx).split("\n").length);
