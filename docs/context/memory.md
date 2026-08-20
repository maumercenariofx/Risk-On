# Project Memory

Architecture decisions and high-relevance facts. One line each, readable.
Format: `# decision: one-sentence rationale`. Dedupe before appending -
never restate a fact that is already here.

<!-- Soft cap ~11k tokens (bytes / 4). Past it: snapshot to
docs/context/archive/memory/<YYYY-MM-DD>.md, then compact in place. -->

## Producto
- Risk On (riskon.lat) es el sitio personal de Mauricio Mercenario: FX y riesgo global con foco en USD/MXN, bilingüe ES/EN. No tiene fines de lucro — su valor es presencia de marca y fidelización de clientes.
- El producto central es "El Pre-Market": un view diario que sale por correo antes de las 7:00 CDMX, L-V. La puntualidad es promesa de marca explícita ("antes de las 7:00 con datos de minutos").
- El marcador público de posturas en `/indice` es parte del producto, no un adorno: cada postura se evalúa contra el USD/MXN real a 5 días hábiles, y el redactor debe reconocer en el texto cómo le fue a la última postura que maduró.

## Arquitectura
- La generación del view vive en GitHub Actions y NO en Vercel: el view bilingüe pide 4200-6000 tokens a Claude (55-90s) y no cabe en el límite de 60s de una función serverless de Vercel Hobby. Causa raíz de los fallos del 3 y 6 de julio 2026.
- El disparo primario del pipeline es cronjob.org 6:50 → `/api/trigger-gen` → `workflow_dispatch`, no el cron interno de Actions: el scheduler de Actions demostró ser flaky (no corrió el 2026-07-07). Los crons `52 12` y `5 13` UTC quedaron de respaldo.
- Cadena de respaldos del envío en tres eslabones: 6:52 Actions (gen→send), 7:00 cronjob.org (`send-daily?resend=1`), 7:10 Vercel cron. Cualquier eslabón que falle, el siguiente recoge.
- La idempotencia de todo el pipeline se apoya en dos guardas de archivo: `content/<slug>.md` (no regenera) y `sent/<slug>.json` (no reenvía). Cualquier paso nuevo que escriba o envíe debe respetarlas.
- El redactor usa Claude Code CLI (`claude -p`) con `CLAUDE_CODE_OAUTH_TOKEN` (suscripción Max, $0 extra de API) como camino primario; `@anthropic-ai/sdk` con `ANTHROPIC_API_KEY` es solo respaldo si el CLI falla. Modelo: `claude-opus-4-8`.
- El estilo/validación nunca bloquea el envío: si el validador de copy falla, se publica igual — jamás bloquear el correo de las 7am por estilo.
- Stack: Next.js 14 App Router + React 18 + Tailwind 3, JavaScript puro (sin TypeScript). Vercel Hobby, push a `main` = redeploy.
- Turso/libSQL (`@libsql/client`) se usa SOLO para el sistema de alertas, no para el contenido ni los suscriptores.
- Los suscriptores viven en un Google Sheet alimentado por `scripts/apps-script-subscribe.gs`; `lib/subscribers.js` tiene reintentos y alerta cuando el Sheet no responde (2026-07-30).
- El post diario en X (@risk_on_views) se compone del front-matter del view sin IA ($0) y es best-effort: si X falla, el run queda verde porque el correo ya salió.
- El recap semanal sale los viernes 16:00 CDMX (`recap-weekly.yml`), con respaldo a las 16:30, idempotente por archivo + marcador.

## Modelo cuantitativo
- El índice Risk On (`lib/riskIndex.js`) es determinístico y compuesto de 5 señales: VIX 35%, DXY 22%, MOVE 18%, US10Y 15%, MXN vol 10%. El redactor lo explica pero NUNCA lo cambia.
- El score es un NOWCAST, no un pronóstico: su IC a 1 día es momentum (−0.06) y a 5-10 días contrarian (+0.08/+0.10). Nunca usarlo como señal direccional lineal.
- El edge real del índice, verificado por mitades del sample en un backtest de 5 años (~1,180 días): tras una banda RISK-OFF, pro-peso acierta 76% (n=38). El pánico extremo ha sido zona de rebote del peso.
- `computeStretch` en `lib/posturaPrior.js` y el backtest en `scripts/research-posturas.mjs` comparten definición a propósito — cambiar una sin la otra invalida el prior.
- NEUTRAL es una trampa bajo la regla del marcador (acierta ~21%): solo se justifica como tesis de rango explícita. PRO-DÓLAR exige catalizador del día, no estadística (43% base).

## Editorial
- La fuente de verdad del tono es la const `SYSTEM` en `lib/dailyView.js` (~línea 411). No se reinventa ni se duplica en otro lado.
- La anti-monotonía está implementada como sistema, no como consejo: veto temático calculado en código (un tema que abrió ≥2 de los últimos 3 titulares no puede volver a liderar sin movimiento fuerte), memoria del view anterior y de la semana, y límite de 2-3 repeticiones por término técnico dentro del mismo artículo.
- La referencia temporal al view anterior se calcula en código (`prevViewRef`), no se deja al modelo: el 2026-07-13 el artículo dijo "Ayer señalamos..." cuando "ayer" fue domingo.
- Regla de compliance del producto: postura y sesgo direccional sí, enmarcados como opinión de mercado; recomendaciones operativas concretas (precios de entrada/salida, instrumentos, tamaños de posición) están prohibidas.
- Prohibido afirmar cuánto subió o bajó el par vs el cierre previo cuando ese cierre no es verificable — la regla está codificada, no es criterio del redactor.
