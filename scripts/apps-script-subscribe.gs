// Google Apps Script — "El Pre" subscriber webhook (alta, baja y lectura).
//
// Hoja: columnas
//   A: Email | B: Fecha | C: Estado | D: Nombre | E: Apellidos | F: Trato | G: Lang
//   H: WhatsApp | I: Fuente
//   (Estado = "active" | "unsub"; D/E/F son opcionales y solo se usan para
//    saludar por nombre en el correo diario. G = "es" | "en": idioma en el que
//    el suscriptor recibe el correo diario; vacío = español. H = teléfono para
//    las futuras alertas intradía; I = canal de adquisición: x | linkedin |
//    google | colega | otro — para medir qué canal convierte.)
//
// Setup / re-deploy (IMPORTANTE: edita la implementación EXISTENTE para
// conservar la misma URL /exec — crear una NUEVA cambia el id y rompe Vercel):
// 1. En tu Google Sheet: Extensiones > Apps Script.
// 2. Pega este contenido completo (reemplaza el anterior). CONSERVA tu TOKEN.
// 3. Implementar > Administrar implementaciones > (la existente) > Editar (lápiz)
//      > Versión: "Nueva versión" > Implementar.   [misma URL /exec]
//      - Ejecutar como: Yo   ·   Quién tiene acceso: Cualquiera
// 4. No hace falta cambiar SHEETS_WEBHOOK_URL / SHEETS_LIST_URL si reusaste la URL.
//
// Compat: las filas viejas (solo A/B/C) siguen funcionando — sin nombre = saludo
// genérico. doGet devuelve `active` como objetos { email, nombre, apellidos, trato };
// el servidor también acepta el formato viejo (arreglo de correos).

var TOKEN = "CAMBIA_ESTE_TOKEN";

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  var email     = String(data.email || "").trim().toLowerCase();
  var date      = String(data.date  || new Date().toISOString());
  var action    = String(data.action || "subscribe");
  var nombre    = String(data.nombre    || "").trim();
  var apellidos = String(data.apellidos || "").trim();
  var trato     = String(data.trato     || "").trim();
  var lang      = String(data.lang      || "").trim().toLowerCase();
  if (lang !== "en" && lang !== "es") lang = "";
  var whatsapp  = String(data.whatsapp  || "").trim();
  var fuente    = String(data.fuente    || "").trim().toLowerCase();

  if (!email) {
    return ContentService.createTextOutput(JSON.stringify({ error: "missing email" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var values = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === email) { rowIdx = i + 1; break; }
  }

  if (action === "unsubscribe") {
    if (rowIdx > 0) sheet.getRange(rowIdx, 3).setValue("unsub");
    else sheet.appendRow([email, date, "unsub", "", "", "", "", "", ""]);
  } else if (rowIdx > 0) {
    // Reactivar y completar campos sin sobrescribir con vacío lo ya guardado.
    sheet.getRange(rowIdx, 3).setValue("active");
    if (nombre)    sheet.getRange(rowIdx, 4).setValue(nombre);
    if (apellidos) sheet.getRange(rowIdx, 5).setValue(apellidos);
    if (trato)     sheet.getRange(rowIdx, 6).setValue(trato);
    if (lang)      sheet.getRange(rowIdx, 7).setValue(lang);
    if (whatsapp)  sheet.getRange(rowIdx, 8).setValue(whatsapp);
    if (fuente)    sheet.getRange(rowIdx, 9).setValue(fuente);
  } else {
    sheet.appendRow([email, date, "active", nombre, apellidos, trato, lang, whatsapp, fuente]);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Devuelve { active: [{email,nombre,apellidos,trato}], unsub: [email] } en JSON.
// Protegido por ?token=. unsub son bajas (para restar incluso a los del respaldo).
function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({ error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var values = sheet.getDataRange().getValues();
  var active = [], unsub = [];
  for (var i = 1; i < values.length; i++) {
    var email = String(values[i][0]).trim();
    if (!email) continue;
    var estado = String(values[i][2] || "active").trim().toLowerCase();
    if (estado === "unsub") {
      unsub.push(email);
    } else {
      active.push({
        email:     email,
        nombre:    String(values[i][3] || "").trim(),
        apellidos: String(values[i][4] || "").trim(),
        trato:     String(values[i][5] || "").trim(),
        lang:      String(values[i][6] || "").trim().toLowerCase(),
        whatsapp:  String(values[i][7] || "").trim(),
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ active: active, unsub: unsub }))
    .setMimeType(ContentService.MimeType.JSON);
}
