// Prueba de regresión de la guarda de frescura del pulso (lib/dailyView.js).
//
// El fixture es el pulso REAL que el 24-ago-2026 metió al view publicado un
// discurso de Jackson Hole de agosto de 2025 —con Powell, que había dejado el
// cargo en mayo— y un recorte de la Fed que el mercado no estaba descontando.
// Si esta prueba se pone en rojo, la red que evita repetirlo se rompió.
//
// Correr: node scripts/test-pulse-frescura.mjs
import { sanitizePulse } from "../lib/dailyView.js";

const PULSO_24AGO = `**Resumen pre-market — lunes 24 de agosto de 2026, 06:50 CDMX**

- **[DATO-HOY]** Sin dato de alto impacto de EE.UU. hoy (lunes); el **PCE** llega **jueves 26-ago a las 6:30 CDMX (8:30 ET)** — aún no publicado.

- **[MACRO-EU]** Powell en **Jackson Hole (viernes 22-ago)** abrió la puerta a un recorte en septiembre: "el balance de riesgos puede justificar ajustar la postura". Los futuros descuentan **~89%** de un recorte de 25 pb en septiembre.

- **[MÉXICO]** Banxico mantuvo la tasa en **6.50%**; minutas (21-ago) muestran voto dividido. USD/MXN operando cerca de **17.03** (previo 17.0333, rango 17.031–17.049).

- **[FLUJOS-EM]** Bloomberg: los **carry trades financiados en dólar hilan su racha ganadora más larga desde 2008**; índice EM de Bloomberg +18% en 2025.

- **[GEOPOLÍTICA]** Riesgo activo hoy: **nuevas sanciones económicas de EE.UU. a Irán** y **ruptura de las negociaciones comerciales EE.UU.–Canadá**.

Sources:
- [Yahoo Finance — Powell Jackson Hole](https://finance.yahoo.com/news/fed-chair-powell-opens-door-to-september-rate-cut-in-jackson-hole-speech-140020886.html)
- [FXStreet — Banxico minutes split vote](https://www.fxstreet.com/amp/news/banxico-minutes-show-split-vote-further-cuts-lie-ahead-202508211600)
- [Bloomberg — 'It's a Carry World'](https://www.bloomberg.com/news/articles/2026-08-23/-it-s-a-carry-world-em-trade-notches-longest-run-since-2008)`;

const PULSO_SANO = `**Resumen pre-market — lunes 24 de agosto de 2026**

- **[DATO-HOY]** Sin dato de alto impacto hoy; el PCE llega el miércoles 26-ago. (Reuters, 2026-08-24)

- **[MÉXICO]** USD/MXN opera cerca de **16.93** tras el cierre del viernes. (El Financiero, 2026-08-24)

Sources:
- [Reuters](https://www.reuters.com/markets/2026-08-24/mexico-peso)`;

let fallos = 0;
const t = (nombre, cond) => {
  console.log(`${cond ? "  ✓" : "  ✗ FALLA"}  ${nombre}`);
  if (!cond) fallos++;
};

console.log("── el pulso real del 24-ago contra el spot verificado (16.934) ──");
t("se descarta entero: cotiza el par 9.6 centavos fuera",
  sanitizePulse(PULSO_24AGO, "2026-08-24", 16.934) === null);

console.log("\n── el mismo pulso sin el bullet que trae el precio viejo ──");
// Aísla la segunda red: el dateline "viernes 22-ago" fue viernes en 2025 y
// sábado en 2026, que es exactamente la huella de la nota reciclada.
const sinPrecio = PULSO_24AGO.split("\n").filter((l) => !l.includes("[MÉXICO]")).join("\n");
const limpio = sinPrecio && sanitizePulse(sinPrecio, "2026-08-24", 16.934);
t("el bullet de Powell/Jackson Hole se va", limpio != null && !/Powell/.test(limpio));
t("el bullet con 'jueves 26-ago' (que es miércoles) se va", limpio != null && !/DATO-HOY/.test(limpio));
t("la lista de fuentes se retira completa", limpio != null && !/Sources:/.test(limpio));
t("el bullet de geopolítica sobrevive", limpio != null && /GEOPOL/.test(limpio));

console.log("\n── un pulso legítimo no se toca ──");
t("pasa intacto", sanitizePulse(PULSO_SANO, "2026-08-24", 16.934) === PULSO_SANO);
t("a 3 centavos del spot sigue intacto", sanitizePulse(PULSO_SANO, "2026-08-24", 16.90) === PULSO_SANO);
t("sin spot no se juzga por precio", sanitizePulse(PULSO_SANO, "2026-08-24", null) === PULSO_SANO);
t("sin slug devuelve el texto tal cual", sanitizePulse(PULSO_SANO, null, 16.934) === PULSO_SANO);
t("texto vacío devuelve null", sanitizePulse("", "2026-08-24", 16.934) === null);

console.log(fallos ? `\n${fallos} prueba(s) en rojo` : "\nTodo verde");
process.exit(fallos ? 1 : 0);
