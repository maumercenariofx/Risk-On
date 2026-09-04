# TODO

Open work ONLY - holds `pending` and `in_progress` items. Done items move
to results.md. Format: `- [ ] (pending|in_progress) task - short note`.

<!-- Soft cap ~2.5k tokens (bytes / 4). -->


## Decisiones que solo Mauricio puede tomar (bloquean trabajo)
- [ ] (pending) El mentís del view del 24-ago NO va a salir solo. La nota de corrección publicada dice "mañana lo explico completo", pero `fetchPrevViews` le pasa al redactor título, resumen, postura, condición y niveles del view anterior — nunca el cuerpo, así que el bot del martes no puede saber que hubo una corrección. O se escribe a mano en `notas/2026-08-25.txt` (la libreta se renderiza en el correo), o se acepta que el mentís vive solo en el archivo.
- [ ] (pending) ¿Firmamos con HMAC los enlaces de baja? `sig()` ya está listo en `app/api/unsubscribe/route.js`; falta que el constructor del correo emita el enlace firmado — eso toca el camino de las 7am. Mientras tanto la exposición está mitigada con el paso de confirmación, no abierta.
- [ ] (pending) ¿Backfilleamos `band` en los 58 views históricos? Se puede hacer con precisión (los cortes cambiaron el 13-jul-2026: antes 29/48/72, después 32/49/67), pero implica reescribir `content/` — y CLAUDE.md dice que esa carpeta es del bot.

## Diseño (auditoría 2026-08-21)
- [ ] (pending) Desborde horizontal de ~22px en móvil, PREEXISTENTE y hoy CLIPADO por `html { overflow-x: hidden }` en globals.css:13, así que no hay barra visible — es deuda latente, no un bug a la vista (producción: scrollWidth 397 vs clientWidth 375; medido 2026-08-21). Lo causan los bloques full-bleed que usan `width: 100vw; left: 50%; margin-left: -50vw` (`.hero-canvas` y el contenedor del `Ticker`): `100vw` incluye la barra de scroll. Fix: `width: 100%` con un wrapper `overflow-x: clip` en el body, o `calc(100vw - (100vw - 100%))`.

## Higiene del entorno local
- [ ] (pending) Decidir qué hacer con `C:\Users\mauri\Documents\risk-o-meter` — carpeta completamente vacía, candidata a borrar.
- [ ] (pending) Decidir qué hacer con `C:\Users\mauri\Documents\Risk-On-backup-2026-07-14.git` — respaldo bare de git de hace un mes; el remoto de GitHub ya cumple esa función.
- [ ] (pending) Hábito: hacer `git pull` antes de trabajar. El bot commitea a diario desde Actions, así que el clon local se queda atrás rápido (estaba 35 commits atrás el 2026-08-20).

## Pendientes de arquitectura
- [ ] (pending) Añadir `docs/references/` reales conforme se necesiten y cablearlos como reglas de una línea en `CLAUDE.md`.
- [ ] (pending) Evaluar si vale definir agentes en `docs/agents/` (candidatos naturales: un agente "redactor/editorial" dueño del tono, y uno "quant" dueño del índice y los backtests).

## Home V2 — diferidos de la revisión final (2026-09-03)
- [ ] (pending) `ScoreDrivers`: orden por unión estricta de labels (hoy elige publicado O vivo; si el publicado trae <9 señales por dato ausente a las 6:52, la fila viva de esa señal no se dibuja). Fix de una línea: `Array.from(new Set([...pub, ...live]))`.
- [ ] (pending) `regimeAge`: guardia "N+" cuando la edad == posts.length (sería el inicio del archivo, no del régimen). Hoy 26 de 67.
- [ ] (pending) `HALF_SCALE=10` en `ScoreDrivers` asume Σw=100; con señales faltantes un push puede exceder 10 y la barra se clampa sin aviso.
- [ ] (pending) `npm test` no corre en CI. Añadir un workflow aparte (nunca en gen-daily).
- [ ] (pending) Accesibilidad: la marca del publicado en `ScoreDrivers` solo tiene `title`; candidato a texto visually-hidden con el valor.
- [ ] (pending) Decisión de Mauricio: el hero muestra "PUBLICADO 07:02" bajo "ANTES DE LAS 7:00" cuando el correo sale tarde (sentAt real del 3-sep = 13:02Z). Es dato honesto; ¿se deja, se cambia la promesa, o se arregla el retraso del envío?
