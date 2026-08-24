// lib/articleStyle.js
// Tipografía editorial del cuerpo de los views — compartida entre la página
// del archivo (PostView) y el overlay lector de la landing (ViewOverlay).
// Serif 17px/1.75 con medida de ~65ch: legibilidad de editorial impresa.
export const ARTICLE_CLS =
  "prose-invert mx-auto max-w-[65ch] font-serif text-[17px] leading-[1.75] text-bone/85 " +
  "[&>p]:mb-5 [&_strong]:text-bone " +
  "[&>p:first-of-type]:text-[19px] [&>p:first-of-type]:text-bone [&>p:first-of-type]:font-medium " +
  // h3 traía font-mono Y font-sans en la misma cadena: una de las dos no hacía
  // nada y cuál ganaba dependía del orden de salida de Tailwind (auditoría
  // 2026-08-21). Se queda mono, que es el lenguaje de etiqueta del sitio.
  "[&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:font-mono [&_h3]:text-[13px] [&_h3]:uppercase [&_h3]:tracking-[3px] [&_h3]:text-muted";
