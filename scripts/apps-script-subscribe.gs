// Google Apps Script — "El Pre" subscriber webhook.
//
// Setup:
// 1. Create a new Google Sheet. Add a header row: "Email" | "Fecha".
// 2. In the Sheet, go to Extensions > Apps Script.
// 3. Replace the default Code.gs content with this file's content.
// 4. Deploy > New deployment > type "Web app".
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy the deployment URL and set it as SHEETS_WEBHOOK_URL in Vercel
//    (Project Settings > Environment Variables), then redeploy.

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  var email = String(data.email || "").trim();
  var date  = String(data.date  || new Date().toISOString());

  if (!email) {
    return ContentService.createTextOutput(JSON.stringify({ error: "missing email" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([email, date]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
