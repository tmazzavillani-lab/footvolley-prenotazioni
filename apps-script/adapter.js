// --- Collegamento a Google Sheets (web app) ---
// Impostazioni progetto > Proprietà script: ADMIN_PIN = il tuo PIN istruttore.

function doGet(e) { return fvOut_(fvHandle_((e && e.parameter) || {})); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { }
  return fvOut_(fvHandle_(p));
}

function fvHandle_(p) {
  var lock = null;
  try {
    if (p.action && p.action !== 'state') { lock = LockService.getScriptLock(); lock.waitLock(15000); }
    var now = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd HH:mm');
    var r = fvRoute(p, FvSheetStore, now);
    r.ok = true;
    return r;
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function fvOut_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

var FV_HEAD = { P: ['id', 'data', 'turno', 'nome', 'token', 'creato'], A: ['data', 'turno', 'nome'], G: ['data', 'turno', 'nome'] };
var FV_SHEET = { P: 'Prenotazioni', A: 'Assenze', G: 'Pagamenti' };

function fvSheet_(k) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(FV_SHEET[k]);
  if (!sh) {
    sh = ss.insertSheet(FV_SHEET[k]);
    sh.getRange('A:F').setNumberFormat('@');
    sh.appendRow(FV_HEAD[k]);
    sh.setFrozenRows(1);
  }
  return sh;
}

var FvSheetStore = {
  getConfig: function () {
    var s = PropertiesService.getScriptProperties().getProperty('CONFIG');
    return s ? JSON.parse(s) : null;
  },
  setConfig: function (c) { PropertiesService.getScriptProperties().setProperty('CONFIG', JSON.stringify(c)); },
  adminPin: function () { return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN'); },
  list: function (k) {
    var v = fvSheet_(k).getDataRange().getDisplayValues(), h = FV_HEAD[k];
    return v.slice(1).map(function (row) { var o = {}; h.forEach(function (c, i) { o[c] = row[i]; }); return o; });
  },
  add: function (k, o) {
    fvSheet_(k).appendRow(FV_HEAD[k].map(function (c) { return String(o[c] == null ? '' : o[c]); }));
  },
  removeWhere: function (k, fn) {
    var sh = fvSheet_(k), rows = this.list(k);
    for (var i = rows.length - 1; i >= 0; i--) if (fn(rows[i])) sh.deleteRow(i + 2);
  }
};

// Esegui una volta dall'editor per creare i fogli e autorizzare lo script.
function setup() {
  ['P', 'A', 'G'].forEach(fvSheet_);
  if (!FvSheetStore.adminPin()) Logger.log('Ricorda: imposta ADMIN_PIN nelle Proprietà script.');
}
