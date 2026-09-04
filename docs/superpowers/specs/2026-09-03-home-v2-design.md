# Home V2 — jerarquía del índice (diseño aprobado 2026-09-03)

Origen: un "master prompt" externo (72 secciones) que comparaba riskon.lat con
mentoria-algoritmica.vercel.app. Se descartó casi todo (Risk Lab, model
confidence, régimen intradía, labels en inglés, Academy, rutas nuevas) porque
o ya existe en el repo o contradice lo que el propio backtest demostró. Lo que
sobrevive es una sola tesis: **el índice es el producto y el Home no lo dice**.

## Decisiones de producto (Mauricio, 2026-09-03)

1. **Producto al frente, autor pegado a la evidencia.** No se invierte la
   jerarquía "marca vs. autor": el sitio es un portafolio profesional. El nombre
   se queda visible (nav, hero, views), pero acompañando al índice y al
   marcador público, no como el producto.
2. **El score en vivo sigue siendo el protagonista.** Un número congelado todo
   el día mata la razón de volver a las 11. Lo que cambia es la *referencia*:
   el score publicado (el del correo, el que se califica en /indice) aparece
   como ancla del día debajo del vivo.
3. **Drivers en vivo, con la marca del publicado.** Si el hero es vivo, las
   señales también; si no, vuelve la contradicción "el número no cuadra".
4. **Nav de 5 + Suscríbete.** Análisis, Alertas y Contacto bajan al footer y
   al ⌘K.

## Alcance

### KEEP (sin cambios de comportamiento)
Globo/RiskSphere, países en alerta, time-lapse 30D, count-up, termómetro,
sparkline, RegimeStrip, sticky badge, panel de noticias, Ticker, TapeWidget,
DailyWatch, DailyRead (+ SubscribeForm y el ancla `#subscribe`), MarketsClient,
RatesSection, EconCalendar, AdvancedData, CountdownTimers, ProjectCards,
RiskBands (ancla `#bandas`), CommandPalette, Footer legal, toggle ES/EN.

### MODIFY
- `app/page.jsx` — recompone el orden (ver abajo) y calcula en servidor:
  `published` (score/band/signals/date del view más reciente), `publishedAt`
  (`sent/<slug>.json → sentAt`, opcional), `regimeAge`, `range7`.
- `components/RiskGauge.jsx` — (a) recibe `published`, `publishedAt`,
  `regimeAge`, `range7`; (b) línea de ancla bajo el score; (c) Δ intradía;
  (d) chips de edad de régimen / rango 7 views junto al delta; (e) el
  `Collapse` "Componentes del índice" se sustituye por `<ScoreDrivers>`;
  (f) `DailyRead` y `MarketsClient` salen del componente (los monta page.jsx).
  Sub-línea del hero: "9 señales · un régimen · antes de las 7:00".
  Byline: "Research de Mauricio Mercenario · marcador público →" (a /indice).
- `components/Nav.jsx` — links y subtítulo.
- `components/Footer.jsx` — añade Análisis y Alertas a "Secciones".
- `components/CommandPalette.jsx` — añade entrada de página `/alertas`.
- `app/layout.jsx` — `title`/OG title y description.

### NEW
- `components/ScoreDrivers.jsx` — presentacional, client (vive dentro de
  RiskGauge, que ya es client). Props: `live` (breakdown de computeRiskScore:
  `[{key,label,sub,w}]` o null), `published` (`post.signals`:
  `[{label,sub,w}]` o null), `publishedLabel` (texto de la ancla).
- `lib/homeStats.js` — funciones puras: `regimeAge(posts)`, `range7(posts)`,
  `pushes(breakdown)`. Testeables sin React.

### REMOVE
Nada se borra del repo. El `Collapse` de señales dentro de RiskGauge se
elimina porque `ScoreDrivers` lo reemplaza con la misma información más la
referencia publicada; el detalle por señal y la tabla de pesos siguen en
`/metodologia`.

## Orden del Home

```
TapeWidget (fixed)
RiskGauge
  ├ hero (globo · h1 WHAT'S TODAY'S RISK? · sub-línea · score vivo · banda
  │        · ancla publicada · en vivo/cerrado · frescura)
  ├ Ticker
  ├ termómetro · Δ vs ayer · Δ intradía · edad régimen · rango 7v · sparkline
  ├ RegimeStrip
  ├ sticky badge · panel noticias
  └ ScoreDrivers  ← "Qué mueve el score" + ¿Cómo se calcula? → /metodologia
DailyWatch        ← qué vigilar hoy · FX · rango técnico
DailyRead         ← El Pre-Market + SubscribeForm (#subscribe)
MarketsClient embed
CountdownTimers
MobileCollapse: RatesSection · EconCalendar · AdvancedData
ProjectCards
RiskBands (#bandas) + CTA "Ver track record →" /indice
```

## Definiciones (para que nadie las reinvente)

- **Empuje de una señal** `push_i = w_i · (sub_i − 50) / Σw`. Σ push = score − 50.
  Positivo empuja a risk-on, negativo a risk-off. Es atribución exacta de un
  promedio ponderado respecto al punto neutro; no es "contribución" en sentido
  estadístico ni predice nada. Se muestra en puntos del índice con un decimal.
  Σw es la suma de pesos de las señales CON dato (igual que computeRiskScore).
- **Edad del régimen**: número de views consecutivos (el más reciente hacia
  atrás) cuya banda es igual a la del view más reciente. Banda = `band` del
  front-matter si existe; si no, `riskBand(score).key` (58 views antiguos no
  traen `band`; los cortes cambiaron el 2026-07-13, así que para views
  anteriores a esa fecha `riskBand` puede diferir de la banda que se publicó —
  se acepta: la edad rara vez cruza esa fecha y si lo hace, es historia).
  Se etiqueta "N views", nunca "N días": los views son L-V y hay huecos.
- **Rango 7 views**: min/max de `score` de los 7 views más recientes
  (incluido el de hoy). Si hay menos de 3, no se muestra.
- **Δ intradía**: `liveScore − published.score`. Solo se muestra si hay
  resultado vivo y el view publicado es de hoy (fecha CDMX); si el view más
  reciente no es de hoy (fin de semana, festivo, fallo), la ancla dice
  "Último view · vie 29 ago · 57" y no hay Δ intradía.
- **publishedAt**: `sent/<slug>.json.sentAt` formateado a hora CDMX
  ("Publicado 06:58"). Si no existe el json, "Publicado hoy" / "Último view
  <fecha>". Jamás se inventa una hora.

## Estados

| Situación | Hero | ScoreDrivers |
|---|---|---|
| Vivo OK, view de hoy | score vivo · ancla "Publicado 06:58 · 57 Constructivo" · Δ intradía | barras vivas + marca publicada |
| Vivo OK, view viejo | score vivo · ancla "Último view · vie 29 ago · 57" | barras vivas + marca del último view |
| Sin vivo (api falla) | hoy RiskGauge usa un fallback hardcodeado (RiskGauge:153) — se mantiene para no tocar el globo | barras publicadas, etiqueta "publicado 06:58" |
| Sin view (dev sin content/) | como hoy, sin ancla | no se renderiza |
| Mercado cerrado | igual que hoy: "MERCADO CERRADO · CIERRE DEL VIERNES" | barras vivas del cierre |

## Copy

- `<title>`: "Risk On — ¿Cuánto riesgo hay hoy? Índice diario para MXN"
- description: "Índice Risk On: 9 señales, un régimen, publicado antes de las
  7:00 CDMX y calificado en público contra el USD/MXN. Research de Mauricio
  Mercenario."
- Nav subtítulo: "Índice de riesgo y view diario · Mauricio Mercenario" /
  "Risk index and daily view · Mauricio Mercenario"
- Nav links: Hoy(/) · Mercados · Índice · Archivo · Aprende · [Suscríbete]
- Hero sub-línea: "9 señales · un régimen · antes de las 7:00" /
  "9 signals · one regime · before 7:00"
- ScoreDrivers título: "Qué mueve el score" / "What's moving the score";
  pie: "Empuje de cada señal respecto al punto neutro (50). Suman el score.
  ¿Cómo se calcula? →"
- Footer: "Take risks or stay average" se queda como lema.

## Lo que NO se toca
`lib/dailyView.js`, `lib/riskScore.js`, `app/api/**`, `.github/workflows`,
`content/`, `sent/`, rutas/URLs, `RiskSphere`, `TrackRecord`, `/indice`,
`/metodologia`.

## Verificación
- `node --test` sobre `lib/homeStats.js` (empuje suma score−50; edad; rango).
- `npm run build` limpio.
- QA visual desktop + móvil 375px: hero, ancla, drivers, nav, footer; sin
  overflow horizontal nuevo (el de 22px preexistente queda como estaba).
- `/#bandas`, `#subscribe`, CTA sticky, ⌘K → todo sigue resolviendo.
