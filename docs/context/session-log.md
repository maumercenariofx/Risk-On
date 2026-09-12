# Session Log

One line per session, newest at top. Format: `[YYYY-MM-DD]: what happened`.

<!-- Soft cap ~4k tokens (bytes / 4). -->

- [2026-09-03]: Home V2 — hero con ancla publicada, ScoreDrivers, nav de 5. Spec + plan en docs/superpowers/.
- [2026-08-24]: El view del día salió con un Jackson Hole que no había ocurrido — el pulso recicló una nota de 2025. Corregido el view, corregidos los 7 views de jun/jul que nombraban a Powell como chair, y cerrada la puerta con una guarda determinística de frescura del pulso con su prueba de regresión.
- [2026-08-21]: Repo movido de `C:\Users\mauri\Documents\Risk-On` a `C:\Users\mauri\Risk On` (la carpeta del perfil, que estaba vacía). Verificado con `npm run build` limpio y git/remoto intactos. Añadido el editor del sistema de diseño en `docs/business/brand/color-palette.html`.
- [2026-08-20]: Scaffold inicial del proyecto — creado `docs/context|references|agents/` y `CLAUDE.md` desde cero (no existía). Clon local actualizado con 35 commits pendientes del bot. Sembrados `memory.md` (arquitectura, pipeline, quant, reglas editoriales) y `todo.md` (README desactualizado en 5 puntos, higiene de carpetas locales).
- [2026-09-10]: Diagnóstico del view de hoy: SÍ salió (6:54:57, 51 suscriptores, en bandeja). La confusión fue la alerta ⚠️ de las 6:51, que viene del cron de Vercel /api/gen-daily que sigue vivo y muere a diario. Cron de Vercel quitado y subido a main. A todo.md: X en 402 credits depleted desde el 7-sep, margen del envío de ~5 min.
- [2026-09-11]: "Termina todo": marcador con orden explícito (subido antes del recap), redactor sin COT diario ni score de remate, correo con base pro-peso y baja firmada segura ante escáneres, calendario en CDMX, alerta de X, FRED arreglado, tests en CI, Home/archivo/EN del agente de diseño integrados y prueba de bandas y vol publicada. Dos dry-runs verdes. El recap no salió a las 16:00 (sus crons de Actions llegan tarde SIEMPRE: 16:31, 16:32, 21:38, 17:55 las últimas cuatro semanas), así que se subió a main a las 17:05 y se verificó producción con 12 comprobaciones antes de que el recap corriera a las 18:03. El recap salió con el código nuevo: 54 destinatarios, agenda en hora CDMX, enlace de baja firmado y las cinco posturas recientes en el marcador (la semana pasada citó las de julio).
