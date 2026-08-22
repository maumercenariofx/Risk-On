# Results / Build Log

Review notes for completed work. 1-4 lines per entry, list format, readable.

<!-- Soft cap ~6k tokens (bytes / 4). -->

- [2026-08-21] Repo movido a `C:\Users\mauri\Risk On`. Se movieron los 27 items de nivel superior (incluidos `.git`, `.env.local`, `.github`, `node_modules`) y se borró el origen vacío. Verificado: `git status` limpio, remoto intacto, `npm run build` compila todas las rutas sin error. Nada que tocar en GitHub ni Vercel — el remoto no cambia con un movimiento local.
- [2026-08-21] Editor del sistema de diseño en `docs/business/brand/color-palette.html` (178 KB, autocontenido). Papel `#0A0A0B` y tinta `#F5F5F2` conservados de producción; acento azure `#3D7BF7` y señal magenta `#EC4E88` añadidos deliberadamente fuera del arco 22°-157° de las bandas del índice, para que lo interactivo no se lea como risk-on/risk-off. Los seis chequeos de contraste pasan (separación de tono 100°, mínimo 90). Limitación: Geist no está en el catálogo del generador, la vista previa usa Inter/JetBrains Mono mientras producción sigue con Geist self-hosted.
- [2026-08-20] Scaffold de `docs/context` + `CLAUDE.md` desde cero. `CLAUDE.md` documenta el pipeline del view diario con sus tres respaldos, los pesos reales del índice (VIX 35 / DXY 22 / MOVE 18 / US10Y 15 / MXN 10) y apunta a la const `SYSTEM` de `lib/dailyView.js` como fuente de verdad del tono.
