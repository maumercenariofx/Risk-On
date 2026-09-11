// Reglas deterministas del redactor (2026-09-11): el lente COT anti-monotonía
// y los avisos que se miden en el log sin disparar reintentos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cotParaLente, avisosSuaves } from "../lib/dailyView.js";

// Reporte con posiciones al martes 1-sep, publicado el viernes 4-sep.
const cot = { date: "2026-09-01", net: 93247, dNet: 10865 };
const prev = (slug, cito) => ({ slug, cot: cito });

test("COT: el lunes tras la publicación del viernes entra como reporte nuevo", () => {
  const r = cotParaLente(cot, [prev("2026-09-04", true), prev("2026-09-03", true), prev("2026-09-02", true)]);
  assert.equal(r.cot, cot);
});

test("COT: sin reporte nuevo y ya citado en los últimos 3 views, queda fuera", () => {
  const r = cotParaLente(cot, [prev("2026-09-07", true), prev("2026-09-04", false), prev("2026-09-03", false)]);
  assert.equal(r.cot, null);
  assert.match(r.motivo, /1 de los últimos 3/);
});

test("COT: sin reporte nuevo pero ningún view de los últimos 3 lo citó, vuelve", () => {
  const r = cotParaLente(cot, [prev("2026-09-10", false), prev("2026-09-09", false), prev("2026-09-08", false)]);
  assert.equal(r.cot, cot);
});

test("COT: sin dato no hay lente", () => {
  assert.equal(cotParaLente(null, []).cot, null);
});

test("avisos: inglés sin negritas y cierre con el score se reportan", () => {
  const v = { body_es: "**a** y **b** y **c**\n\nEl Risk On baja de 57 a 44.", body_en: "no bold at all" };
  assert.equal(avisosSuaves(v).length, 2);
});

test("avisos: un view limpio no reporta nada", () => {
  const v = { body_es: "**a** y **b** y **c**\n\nLa raya sigue en 17.04.", body_en: "one **bold** figure" };
  assert.deepEqual(avisosSuaves(v), []);
});

test("avisos: cuenta la antítesis «X, no Y» que el prompt prohíbe", () => {
  const v = { body_es: "**a** y **b** y **c**. Es el catalizador que decide, no el termómetro de riesgo.\n\nLa raya sigue en 17.04.", body_en: "one **bold** figure" };
  const avisos = avisosSuaves(v);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /×1/);
});
