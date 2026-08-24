# Risk On — Take risks or stay average

Sitio personal de Mauricio Mercenario: FX y mercados explicados para todos, con el **índice Risk On** que mide cuánto riesgo hay hoy en el mercado.

Construido con Next.js 14 (App Router) + Tailwind. Bilingüe ES/EN. Desplegable gratis en Vercel.

---

## 🚀 Cómo ponerlo en línea (paso a paso, sin saber programar)

### 1. Sube el proyecto a GitHub
1. Crea una cuenta gratis en https://github.com
2. Crea un repositorio nuevo (botón verde "New"), por ejemplo `risk-on`. Déjalo público o privado, da igual.
3. Descomprime esta carpeta en tu compu.
4. La forma más fácil sin terminal: en la página del repo, arrastra TODOS los archivos de la carpeta `riskon` a la zona "uploading files" y dale commit. (Si sabes usar git, haz el push normal.)

### 2. Conéctalo a Vercel
1. Crea cuenta gratis en https://vercel.com con tu GitHub.
2. Dale "Add New… → Project".
3. Selecciona el repo `risk-on`. Vercel detecta Next.js solo.
4. Dale "Deploy". Espera ~1 minuto.
5. ¡Listo! Te da una URL tipo `risk-on.vercel.app`. Puedes conectar tu propio dominio después.

Cada vez que cambies algo en GitHub, Vercel actualiza el sitio solo.

---

## ✍️ Cómo se publica el view diario

**Ya no se escribe a mano.** Un workflow de GitHub Actions lo genera cada día
hábil antes de las 7:00 CDMX, lo commitea a `content/<YYYY-MM-DD>.md` y lo
envía por correo. Crear ese archivo a mano rompería la guarda de idempotencia
(`content/<slug>.md` existe → no se regenera) y dejaría al lector sin view.

    6:50  cronjob.org → /api/trigger-gen → workflow_dispatch   [disparo primario]
    6:52  Actions: generar → commit/push → send-daily → post en X
    7:00  cronjob.org → /api/send-daily?resend=1                [respaldo 1]
    7:10  Vercel cron → /api/send-daily?resend=1                [respaldo 2]

Lo que SÍ escribes tú:

- `notas/<YYYY-MM-DD>.txt` — una línea tuya, opcional. El generador la recoge
  a las 6:52 y el correo la renderiza en su propio bloque, "De la libreta".
  Ver `notas/README.md`.
- `docs/references/views-editorial.md` — el manual editorial que el redactor
  lee cada mañana, con el registro de errores ya cometidos.

Para probar un cambio del generador sin tocar el correo real:

    gh workflow run gen-daily.yml -f dry_run=1

genera y muestra el view completo sin escribir, sin commitear y sin enviar
(funciona también en fin de semana, a propósito).

<details>
<summary>Formato del front-matter, por si necesitas leerlo</summary>

```markdown
---
date: "2026-06-04"
title_es: "Tu titular en español"
title_en: "Your headline in English"
score: 45
summary_es: "Resumen corto en español."
summary_en: "Short summary in English."
---

Aquí va tu comentario del día. Escribe normal.
Puedes usar **negritas** y separar en párrafos.
```

</details>

> El `score` (0-100) NO es una lectura editorial: lo calcula `lib/riskScore.js`
> de forma determinística y el redactor tiene instrucción explícita de
> explicarlo y jamás de cambiarlo. Desde el 21-ago-2026 el front-matter guarda
> también la `band`, congelada al publicar.

---

## 📊 El índice Risk On

Vive en `lib/riskScore.js` (9 señales). Hasta el 21-ago-2026 este README describía `lib/riskIndex.js`, un archivo muerto de 5 señales que ya se borró; el índice real **no usa DXY**:

| Componente | Peso | Qué mide |
|---|---|---|
| VIX | 20% | Miedo en el S&P 500 |
| USD/MXN | 18% | El par mismo, z contra su propia deriva |
| S&P 500 | 15% | Apetito de riesgo en renta variable |
| Carry | 10% | Diferencial Banxico − Fed |
| MXN vol | 10% | Volatilidad realizada del USD/MXN |
| MOVE | 8% | Volatilidad de bonos del Tesoro |
| Bitcoin | 7% | Beta de riesgo especulativo |
| Curva 2s10s | 7% | Pendiente de la curva US |
| Oro | 5% | Refugio |

Los pesos NO deberían editarse a la ligera: entraron en un solo commit, nunca se
optimizaron contra el resultado, y esa es la principal defensa del índice contra
el sobreajuste. Si los cambias, hay que re-correr el backtest en el mismo commit.

Los datos llegan vía `app/api/market/route.js`, con **Yahoo Finance** como fuente
dominante (v8 chart) y Frankfurter solo para algunos pares FX. Stooq ya no se
usa. Hay valores de respaldo si una fuente falla — y ese es justamente un punto
débil conocido: son constantes que entran al histórico sin bandera.

> `mxnVol` ya no se ajusta a mano: se calcula con `rollingVol()` sobre la serie
> de cierres del USD/MXN. Es volatilidad REALIZADA, no implícita — la implícita
> no está en fuentes gratuitas y el índice no la usa.

---

## 🛠️ Correr en local (opcional)

```bash
npm install
npm run dev
```
Abre http://localhost:3000

---

## ⚖️ Nota de compliance

Todo el contenido es informativo/educativo y opinión personal. **El producto
central hoy ES un correo diario con suscriptores** (Resend, lista en un Google
Sheet), más un canal de alertas en beta — así que la frase original de que "el
sitio no usa correos" dejó de ser cierta hace tiempo.

Lo que se mantiene: no se publican precios de entrada o salida, ni instrumentos
puntuales, ni tamaños de posición. Se publica sesgo y postura general, enmarcados
como opinión de mercado. El aviso legal va en el pie de cada página y dentro del
marcador de posturas.

Revisa las políticas de tu empleador antes de publicar.
