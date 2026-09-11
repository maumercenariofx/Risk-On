// Firma de los enlaces de baja (2026-09-11): una sola fuente para quien firma
// (send-daily, send-recap) y quien verifica (app/api/unsubscribe).
import { test } from "node:test";
import assert from "node:assert/strict";
import { unsubSig, unsubUrl } from "../lib/unsubscribe.js";

test("la firma es estable e ignora mayúsculas y espacios", () => {
  process.env.CRON_SECRET = "secreto-de-prueba";
  assert.equal(unsubSig(" Ana@Mail.com "), unsubSig("ana@mail.com"));
  assert.equal(unsubSig("ana@mail.com").length, 32);
});

test("el enlace lleva la firma y sobrevive a un + en el correo", () => {
  process.env.CRON_SECRET = "secreto-de-prueba";
  const u = new URL(unsubUrl("https://riskon.lat", "ana+fx@mail.com"));
  assert.equal(u.searchParams.get("email"), "ana+fx@mail.com");
  assert.equal(u.searchParams.get("sig"), unsubSig("ana+fx@mail.com"));
});

test("sin CRON_SECRET el enlace sale sin firma y no truena", () => {
  delete process.env.CRON_SECRET;
  const u = new URL(unsubUrl("https://riskon.lat", "ana@mail.com"));
  assert.equal(u.searchParams.get("sig"), null);
  assert.equal(u.searchParams.get("email"), "ana@mail.com");
});
