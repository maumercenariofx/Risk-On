# TODO

Open work ONLY - holds `pending` and `in_progress` items. Done items move
to results.md. Format: `- [ ] (pending|in_progress) task - short note`.

<!-- Soft cap ~2.5k tokens (bytes / 4). -->


## Decisiones que solo Mauricio puede tomar (bloquean trabajo)
- [ ] (pending) El mentís del view del 24-ago NO va a salir solo. La nota de corrección publicada dice "mañana lo explico completo", pero `fetchPrevViews` le pasa al redactor título, resumen, postura, condición y niveles del view anterior — nunca el cuerpo, así que el bot del martes no puede saber que hubo una corrección. O se escribe a mano en `notas/2026-08-25.txt` (la libreta se renderiza en el correo), o se acepta que el mentís vive solo en el archivo.
- [ ] (pending) ¿Backfilleamos `band` en los 58 views históricos? Se puede hacer con precisión (los cortes cambiaron el 13-jul-2026: antes 29/48/72, después 32/49/67), pero implica reescribir `content/` — y CLAUDE.md dice que esa carpeta es del bot.
- [ ] (pending) Reparar el `body_en` del 24-ago: la nota de corrección hecha a mano ese día (commit cbd00af) dejó tres `>` sueltos dentro de frases ("credited a Powell > speech…") porque se escribió un blockquote dentro de un escalar YAML plegado. El generador no produce esto. El arreglo es borrar esos tres `> `, pero es editar `content/` a mano.
- [ ] (pending) Mover el disparo de cronjob.org de 6:50 a 6:40. El gen tarda 3.5-4.5 min y el correo sale 6:53-6:56 con ~5 min de margen; el 2-sep salió 7:05 y el 3-sep 7:02. Resuelve también el "PUBLICADO 07:02" bajo "ANTES DE LAS 7:00" del hero.
- [ ] (pending) X (`@risk_on_views`) responde `402 credits depleted` desde el 7-sep. Recargar créditos en developer.x.com o borrar los secrets `X_*`. Desde el merge del 2026-09-11 llega un correo ⚠️ cada día hábil que X falle por segundo día seguido; el primero, el lunes 14-sep si nada cambia.
- [ ] (pending) Cortes del índice: NO se cambian hasta verificar la compresión del score en vivo (ver Quant). Si después se quiere que las 4 bandas aparezcan, la opción menos disruptiva medida es colas rodantes a 3 años con el 49 fijo (hoy 35/49/64.3); ningún esquema mejora el pronóstico fuera de muestra, es decisión de comunicación (`scripts/validate/05-bandas-nowcast.mjs`).
- [ ] (pending) Opcional, desde el 2026-10-12: para entonces todos los correos de los últimos 30 días llevan la baja firmada, y se puede decidir si una baja SIN firma pide confirmación por correo. Hoy se acepta a propósito: rechazar un one-click de RFC 8058 manda al lector al botón de spam.

## Quant
- [ ] (pending) Compresión del score en vivo: sobre 10 views comparables la desviación del score publicado es 2.7 contra 5.5 de la réplica de `history.csv`, y en 40 días la del sub-score del S&P es 14.4 contra 22.1. Hipótesis sin verificar: el sub-score usa el cambio premarket de ES=F escalado con la MAD de cambios diarios completos del ^GSPC (`app/api/market/route.js:363`), y un cambio de medio día medido con escala de día completo sale chico. Toca el camino del correo y el índice: si se corrige, re-correr `scripts/validate/` en el mismo commit.
- [ ] (pending) Documentación que no coincide con los datos: de 2005 a 2007 hay 717 días con 7 de 9 señales (sin carry, no 8 de 9); el comentario de `scripts/lib/histScore.mjs` sobre la columna `carry_proxy` no corresponde a nada; el objetivo de calibración de `lib/riskScore.js` (RISK-ON ~3.6%) no coincide con el 1.7% [0.8, 2.9] de 2021-26.

## Limpieza candidata (no urgente)
- [ ] (pending) `/api/market` sigue pidiendo AAPL, TSLA, NVDA y ETH a Yahoo sin ningún consumidor desde que salieron del ticker. Quitarlos ahorra cuatro llamadas, pero es la ruta que alimenta el gen de las 6:50: hacerlo con un dry-run de fin de semana.
- [ ] (pending) `claimsDates`/`nfpDates` en `app/api/calendar/route.js` usan `getDay()` local: correctos en UTC (Vercel, Actions), pero en una máquina en hora de CDMX los jueves salen en viernes. Solo afecta al desarrollo local.

## Higiene del entorno local
- [ ] (pending) Decidir qué hacer con `C:\Users\mauri\Documents\risk-o-meter` — carpeta completamente vacía, candidata a borrar.
- [ ] (pending) Decidir qué hacer con `C:\Users\mauri\Documents\Risk-On-backup-2026-07-14.git` — respaldo bare de git de hace un mes; el remoto de GitHub ya cumple esa función.
- [ ] (pending) Hábito: hacer `git pull` antes de trabajar. El bot commitea a diario desde Actions, así que el clon local se queda atrás rápido (estaba 35 commits atrás el 2026-08-20).

## Pendientes de arquitectura
- [ ] (pending) Añadir `docs/references/` reales conforme se necesiten y cablearlos como reglas de una línea en `CLAUDE.md`.
- [ ] (pending) Evaluar si vale definir agentes en `docs/agents/` (candidatos naturales: un agente "redactor/editorial" dueño del tono, y uno "quant" dueño del índice y los backtests).
