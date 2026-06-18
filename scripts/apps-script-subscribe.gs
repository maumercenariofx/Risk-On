// Google Apps Script — "El Pre" subscriber webhook (alta, baja y lectura).
//
// Hoja: columnas  A: Email | B: Fecha | C: Estado   (Estado = "active" | "unsub")
//
// Setup / re-deploy:
// 1. En tu Google Sheet: Extensiones > Apps Script.
// 2. Pega este contenido completo (reemplaza el anterior).
// 3. Cambia TOKEN abajo por una cadena secreta tuya.
// 4. Implementar > Nueva implementación > tipo "Aplicación web".
//      - Ejecutar como: Yo
//      - Quién tiene acceso: Cualquiera
// 5. Copia la URL del Web App:
//      - SHEETS_WEBHOOK_URL  = esa URL                          (alta/baja, POST)
//      - SHEETS_LIST_URL     = esa URL + "?token=TU_TOKEN"      (lectura, GET)
//    Ponlas en Vercel (Project Settings > Environment Variables) y redeploy.

var TOKEN = "CAMBIA_ESTE_TOKEN";

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  var email = String(data.email || "").trim().toLowerCase();
  var date  = String(data.date  || new Date().toISOString());
  var action = String(data.action || "subscribe");

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
    else sheet.appendRow([email, date, "unsub"]);
  } else {
    if (rowIdx > 0) sheet.getRange(rowIdx, 3).setValue("active");
    else sheet.appendRow([email, date, "active"]);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Devuelve el arreglo JSON de correos activos. Protegido por ?token=
function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({ error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var values = sheet.getDataRange().getValues();
  var emails = [];
  for (var i = 1; i < values.length; i++) {
    var email = String(values[i][0]).trim();
    var estado = String(values[i][2] || "active").trim().toLowerCase();
    if (email && estado !== "unsub") emails.push(email);
  }
  return ContentService.createTextOutput(JSON.stringify(emails))
    .setMimeType(ContentService.MimeType.JSON);
}
