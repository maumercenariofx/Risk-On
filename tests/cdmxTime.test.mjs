// Horas del calendario en CDMX (2026-09-11): verano e invierno de cada zona.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enCdmx } from "../lib/cdmxTime.js";

test("BCE del 10-sep: 14:15 en Frankfurt son las 06:15 en CDMX", () => {
  assert.deepEqual(enCdmx("2026-09-10", "14:15", "Europe/Berlin"), { date: "2026-09-10", time: "06:15" });
});

test("CPI de EE.UU. con horario de verano: 08:30 ET son las 06:30 CDMX", () => {
  assert.deepEqual(enCdmx("2026-09-11", "08:30", "America/New_York"), { date: "2026-09-11", time: "06:30" });
});

test("FOMC de diciembre, sin horario de verano: 14:00 ET son las 13:00 CDMX", () => {
  assert.deepEqual(enCdmx("2026-12-09", "14:00", "America/New_York"), { date: "2026-12-09", time: "13:00" });
});

test("Banco de Inglaterra en verano: 12:00 en Londres son las 05:00 CDMX", () => {
  assert.deepEqual(enCdmx("2026-09-17", "12:00", "Europe/London"), { date: "2026-09-17", time: "05:00" });
});

test("Banco de Japón: el mediodía de Tokio es la noche anterior en México", () => {
  assert.deepEqual(enCdmx("2026-09-18", "12:00", "Asia/Tokyo"), { date: "2026-09-17", time: "21:00" });
});

test("Banxico ya está en hora de CDMX y no se mueve", () => {
  assert.deepEqual(enCdmx("2026-09-24", "13:00", "America/Mexico_City"), { date: "2026-09-24", time: "13:00" });
});
