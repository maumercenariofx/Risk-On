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

## ✍️ Cómo publicar tu comentario diario (lo más fácil)

Cada edición es un archivo de texto en la carpeta `/content`. Para publicar una nueva:

1. En GitHub, entra a la carpeta `content`.
2. "Add file → Create new file".
3. Nómbralo con la fecha: `2026-06-04.md`
4. Pega esta plantilla y edítala:

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

5. Commit. En segundos aparece en el Archivo y en la portada. Eso es todo.

> El `score` (0-100) es tu lectura del índice Risk On de ese día. Define el color y la etiqueta automáticamente.

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

Los pesos y rangos son editables ahí mismo. Los datos llegan de APIs gratuitas vía `app/api/market/route.js` (Frankfurter para FX, Stooq para VIX/índices), con valores de respaldo si una fuente falla.

> La vol implícita del USD/MXN no está en fuentes gratis directas; ajústala manual en `route.js` (campo `mxnVol`) o conéctala a tu fuente cuando tengas una.

---

## 🛠️ Correr en local (opcional)

```bash
npm install
npm run dev
```
Abre http://localhost:3000

---

## ⚖️ Nota de compliance

Todo el contenido es informativo/educativo y opinión personal. El sitio no usa correos ni canales institucionales, no pone precios, y no invita a operar — solo lee la temperatura del mercado. Revisa las políticas de tu empleador antes de publicar.
