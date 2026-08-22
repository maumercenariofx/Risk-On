# TODO

Open work ONLY - holds `pending` and `in_progress` items. Done items move
to results.md. Format: `- [ ] (pending|in_progress) task - short note`.

<!-- Soft cap ~2.5k tokens (bytes / 4). -->


## Diseño (auditoría 2026-08-21)
- [ ] (pending) Desborde horizontal de ~22px en móvil, PREEXISTENTE y hoy CLIPADO por `html { overflow-x: hidden }` en globals.css:13, así que no hay barra visible — es deuda latente, no un bug a la vista (producción: scrollWidth 397 vs clientWidth 375; medido 2026-08-21). Lo causan los bloques full-bleed que usan `width: 100vw; left: 50%; margin-left: -50vw` (`.hero-canvas` y el contenedor del `Ticker`): `100vw` incluye la barra de scroll. Fix: `width: 100%` con un wrapper `overflow-x: clip` en el body, o `calc(100vw - (100vw - 100%))`.

## README desactualizado (verificado 2026-08-20 contra el código)
- [ ] (pending) Corregir las fuentes de datos en `README.md` — dice "Frankfurter para FX, Stooq para VIX/índices"; `app/api/market/route.js` usa Yahoo Finance como fuente dominante y Frankfurter solo parcialmente. Stooq ya no aparece.
- [ ] (pending) Borrar del `README.md` la nota de que `mxnVol` se ajusta manual — hoy se calcula con `rollingVol()` sobre la serie de cierres del USD/MXN (`route.js:283`).
- [ ] (pending) Reescribir la nota de compliance del `README.md` — dice "el sitio no usa correos ni canales institucionales", pero el producto central hoy ES un correo diario con suscriptores.
- [ ] (pending) Actualizar la sección "Cómo publicar tu comentario diario" del `README.md` — describe crear el archivo a mano en GitHub; hoy lo genera el bot vía Actions y escribirlo a mano rompería la guarda de idempotencia.

## Higiene del entorno local
- [ ] (pending) Decidir qué hacer con `C:\Users\mauri\Documents\risk-o-meter` — carpeta completamente vacía, candidata a borrar.
- [ ] (pending) Decidir qué hacer con `C:\Users\mauri\Documents\Risk-On-backup-2026-07-14.git` — respaldo bare de git de hace un mes; el remoto de GitHub ya cumple esa función.
- [ ] (pending) Hábito: hacer `git pull` antes de trabajar. El bot commitea a diario desde Actions, así que el clon local se queda atrás rápido (estaba 35 commits atrás el 2026-08-20).

## Pendientes de arquitectura
- [ ] (pending) Añadir `docs/references/` reales conforme se necesiten y cablearlos como reglas de una línea en `CLAUDE.md`.
- [ ] (pending) Evaluar si vale definir agentes en `docs/agents/` (candidatos naturales: un agente "redactor/editorial" dueño del tono, y uno "quant" dueño del índice y los backtests).
