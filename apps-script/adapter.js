// --- Collegamento a Google Sheets (web app) ---
// Impostazioni progetto > Proprietà script: ADMIN_PIN = il tuo PIN istruttore.
// Se lo script non è creato dal foglio (Estensioni > Apps Script), aggiungi anche SHEET_ID = ID del Google Sheet.

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

var FV_HEAD = { P: ['id', 'data', 'turno', 'nome', 'token', 'creato'], A: ['data', 'turno', 'nome'], G: ['data', 'turno', 'nome', 'metodo'], D: ['data', 'turno', 'nome', 'metodo', 'creato'], U: ['nome', 'email', 'token', 'verificato', 'codice', 'creato'] };
var FV_SHEET = { P: 'Prenotazioni', A: 'Assenze', G: 'Pagamenti', D: 'Pagamenti dichiarati', U: 'Atleti verificati' };
// Cache valida per una sola richiesta: ogni foglio e le proprietà si leggono una volta sola
var fvProps_ = null, fvSS_ = null, fvSh_ = {}, fvRows_ = {};

function fvProp_(name) {
  if (!fvProps_) fvProps_ = PropertiesService.getScriptProperties().getProperties();
  return fvProps_[name] || null;
}

function fvSheet_(k) {
  if (fvSh_[k]) return fvSh_[k];
  if (!fvSS_) { var id = fvProp_('SHEET_ID'); fvSS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
  var sh = fvSS_.getSheetByName(FV_SHEET[k]);
  if (!sh) {
    sh = fvSS_.insertSheet(FV_SHEET[k]);
    sh.getRange('A:F').setNumberFormat('@');
    sh.appendRow(FV_HEAD[k]);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < FV_HEAD[k].length) {
    sh.getRange(1, 1, 1, FV_HEAD[k].length).setValues([FV_HEAD[k]]);
    sh.getRange('A:F').setNumberFormat('@');
  }
  fvSh_[k] = sh;
  return sh;
}

var FvSheetStore = {
  getConfig: function () { var s = fvProp_('CONFIG'); return s ? JSON.parse(s) : null; },
  setConfig: function (c) {
    var s = JSON.stringify(c);
    PropertiesService.getScriptProperties().setProperty('CONFIG', s);
    if (fvProps_) fvProps_.CONFIG = s;
  },
  adminPin: function () { return fvProp_('ADMIN_PIN'); },
  sendMail: function (to, subject, body) { MailApp.sendEmail(to, subject, body, { name: 'Ravenna Footvolley' }); },
  list: function (k) {
    if (!fvRows_[k]) {
      var v = fvSheet_(k).getDataRange().getDisplayValues(), h = FV_HEAD[k];
      fvRows_[k] = v.slice(1).map(function (row) { var o = {}; h.forEach(function (c, i) { o[c] = row[i]; }); return o; });
    }
    return fvRows_[k].slice();
  },
  add: function (k, o) {
    var row = FV_HEAD[k].map(function (c) { return String(o[c] == null ? '' : o[c]); });
    fvSheet_(k).appendRow(row);
    if (fvRows_[k]) { var x = {}; FV_HEAD[k].forEach(function (c, i) { x[c] = row[i]; }); fvRows_[k].push(x); }
  },
  removeWhere: function (k, fn) {
    var rows = this.list(k), sh = null;
    for (var i = rows.length - 1; i >= 0; i--) if (fn(rows[i])) { sh = sh || fvSheet_(k); sh.deleteRow(i + 2); fvRows_[k].splice(i, 1); }
  }
};

// Esegui una volta dall'editor per creare i fogli e autorizzare lo script.
function setup() {
  ['P', 'A', 'G', 'D', 'U'].forEach(fvSheet_);
  Logger.log('Email rimaste oggi: ' + MailApp.getRemainingDailyQuota());
  if (!FvSheetStore.adminPin()) Logger.log('Ricorda: imposta ADMIN_PIN nelle Proprietà script.');
}
