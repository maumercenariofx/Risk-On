// Negritas markdown inline (**x**) FUERA del cuerpo del artículo: el redactor
// las mete en summary/watch (les pedimos resaltar datos clave) pero esos campos
// se renderizan como texto plano — el 2026-07-13 la landing y el correo
// mostraban los asteriscos crudos ("**17.47**"). El body no pasa por aquí
// (ese sí se procesa con remark en lib/posts.js).
export function stripBold(s) {
  return String(s ?? "").replace(/\*\*(.+?)\*\*/g, "$1");
}

export function boldToHtml(s) {
  return String(s ?? "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
