// KambuChia: the shared "I've paid" ticks, kept in a Google Sheet.
// Setup (once): new Google Sheet → Extensions → Apps Script → paste this file → Deploy →
// New deployment → Web app, Execute as: Me, Who has access: Anyone → copy the /exec URL into
// TICKS_URL in data.js. Each tick or untick appends a row: key, paid, kr, time (the last row wins).
const KEY = /^[a-z0-9-]{1,40}\|[a-z0-9]{1,20}\|[a-z0-9]{1,20}$/;

function sheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; }

function state_() {
  const sh = sheet_(), n = sh.getLastRow(), out = {};
  if (n) sh.getRange(1, 1, n, 4).getValues().forEach(r => {
    if (KEY.test(r[0])) out[r[0]] = { paid: r[1] === true || r[1] === 'TRUE', kr: Number(r[2]) || 0, at: String(r[3]) };
  });
  return out;
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_(state_()); }

function doPost(e) {
  let b = {};
  try { b = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ error: 'bad json' }); }
  if (!KEY.test(b.key || '')) return json_({ error: 'bad key' });
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try { sheet_().appendRow([b.key, !!b.paid, Number(b.kr) || 0, new Date().toISOString()]); } finally { lock.releaseLock(); }
  return json_(state_());
}
