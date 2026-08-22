# Lessons

Mistakes turned into rules. Append after every correction. One line each,
list format. Before a fix, grep this file for the area - you may have hit
it before.

<!-- Soft cap ~7k tokens (bytes / 4). -->

- **Un fix de alineación de fechas se propaga a TODO lo que lea la misma fuente.** El `gmtoffset` de `MXN=X` se corrigió en `lib/forwardReturns.js` (2026-07-31) y se quedó ahí; los 4 scripts de backtest siguieron con `.toISOString()` pelón. Regla: al corregir el parseo de una fuente de datos, `grep` de la construcción vieja en todo el repo en el MISMO commit.
- **Una cifra hardcodeada en la UI se desincroniza del backtest que la produjo.** `BandEvidence.jsx` tenía `hit: 76` en la tabla y "76%" otra vez en la prosa. Regla: un número de backtest se declara UNA vez, y la prosa lo interpola; si no se puede, no va en la prosa.
- **`preventDefault()` condicionado al pathname miente en cuanto se mueve un componente.** El CTA de suscripción asumía que `#subscribe` existía en "/" porque alguna vez estuvo ahí. Regla: para saltar a un ancla, pregunta si el ancla EXISTE (`document.getElementById`), no en qué página crees estar.
- **Un componente que nunca se importa no protege de nada.** `Disclaimer.jsx` tenía el único aviso legal del repo y llevaba meses sin renderizarse. Regla: lo que es de compliance se verifica en el HTML servido (`curl | grep`), no en que el archivo exista.
- **Un fallback "para que no se vea vacío" es peor que el hueco.** `MarketsClient` dibujaba una serie inventada entre 18.10 y 18.42 cuando fallaba la API, con el spot real en 16.89 — contradiciendo la regla de la casa. Regla: si un dato no se pudo verificar, se dice; no se rellena.
- **Publicar el sample completo y guardarse la mitad reciente es el tipo de cosa que define la reputación.** `posturaPrior.js` documenta internamente "mitad reciente: 64%" y "54%"; el público solo veía 76% y 57%. Regla: si un número se calculó por mitades, se publican las dos.
- **Nunca hagas un reemplazo masivo con regex escrita a mano sobre todo el repo.** Un script de barrido con `String.replace(RegExp, fn)` duplicó el contenido íntegro de 28 archivos (`send-daily` pasó de 47 KB a 667 KB) y hubo que restaurarlos desde HEAD y rehacer ocho ediciones a mano. Regla: (1) reemplazo **literal** con `split().join()`, nunca regex, cuando lo que cambia es una cadena fija; (2) **ensayo en seco** obligatorio que imprima el delta de bytes por archivo antes de escribir — si sustituyes 7 caracteres por 7, el delta DEBE ser 0 y cualquier otra cosa es un bug; (3) si el script tiene una guarda de conteo y falla, **no escribas nada** (esa guarda sí salvó a `AlertManager.jsx`).
- **Un archivo puede tener CRLF aunque sus vecinos tengan LF.** Un ancla multilínea con `\n` falló en `backtest-taindex.mjs` mientras funcionaba en los otros tres, y el script alcanzó a escribir un `off` usado pero no declarado. Regla: anclas de una sola línea, o detectar el separador con `s.includes("\r\n")` antes de sustituir.
- **Verifica los ratios de contraste contra el fondo REAL, no contra negro puro.** El fondo del sitio es `ink` #0A0A0B y las cards `ink2` #111113: los ratios salen ~5% por debajo de lo calculado sobre #000, y un token que "pasa AA" sobre negro puede reprobar sobre la card.
