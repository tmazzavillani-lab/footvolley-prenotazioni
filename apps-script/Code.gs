// FILE GENERATO da build-gs.sh: modifica core.js o apps-script/adapter.js, non questo.
// Logica delle prenotazioni, condivisa tra l'app (modalità prova) e Google Apps Script.
// Se la modifichi, rigenera apps-script/Code.gs con: sh build-gs.sh
var FV_TURNI = [{ k: 't17', h: '17', l: '17–18', p: 4 }, { k: 't18', h: '18', l: '18–19' }, { k: 't19', h: '19', l: '19–20' }, { k: 't20', h: '20', l: '20–21' }];

function fvNorm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function fvClean(s) { return String(s || '').replace(/[<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 40); }
function fvHas(arr, n) { return arr.some(function (x) { return fvNorm(x) === fvNorm(n); }); }
function fvIsWed(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T12:00:00Z').getUTCDay() === 3; }
function fvTurno(k) { return FV_TURNI.filter(function (t) { return t.k === k; })[0]; }
function fvStarted(d, k, nowStr) { return nowStr >= d + ' ' + fvTurno(k).h + ':00'; }
var FV_INIZIO = '2026-10-01'; // fissi inseriti prima dello storico contano da questa data
function fvIsDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')); }
function fvId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function fvFixConfig(c) {
  c = c || {};
  var f = c.fissi || {}, out = {
    prezzo: typeof c.prezzo === 'number' && c.prezzo >= 0 ? c.prezzo : 16,
    posti: c.posti >= 1 && c.posti <= 30 ? Math.round(c.posti) : 6,
    fissi: {},
    annullate: Array.isArray(c.annullate) ? c.annullate.filter(fvIsWed) : [],
    satispay: /^https:\/\/[^\s<>\x22\x27]+$/.test(String(c.satispay || '').trim()) ? String(c.satispay).trim().slice(0, 300) : '',
    speciali: {},
    postiTurno: {}
  };
  var pt = c.postiTurno && typeof c.postiTurno === 'object' ? c.postiTurno : {};
  FV_TURNI.forEach(function (t) { var v = Number(pt[t.k]); if (v >= 1 && v <= 30) out.postiTurno[t.k] = Math.round(v); });
  // prezzi concordati: { 'Nome Cognome': 10 }, 0 = gratis
  var sp = c.speciali && typeof c.speciali === 'object' ? c.speciali : {};
  Object.keys(sp).slice(0, 200).forEach(function (n) { var v = Number(sp[n]), nn = fvClean(n); if (nn && sp[n] !== '' && v >= 0 && v <= 999) out.speciali[nn] = Math.round(v * 100) / 100; });
  // fissi[k] = storico [{nome, dal, al?}]: conta nei mercoledì con dal <= data < al
  FV_TURNI.forEach(function (t) {
    var list = [];
    (Array.isArray(f[t.k]) ? f[t.k] : []).forEach(function (x) {
      var o = typeof x === 'string' ? { nome: x } : (x || {}), n = fvClean(o.nome);
      if (!n) return;
      var e = { nome: n, dal: fvIsDay(o.dal) ? o.dal : FV_INIZIO };
      if (fvIsDay(o.al)) e.al = o.al;
      if (!e.al && fvHas(fvFissiOggi(list), n)) return;
      list.push(e);
    });
    out.fissi[t.k] = list.slice(-100);
  });
  return out;
}

function fvFissiOggi(list) { return list.filter(function (e) { return !e.al; }).map(function (e) { return e.nome; }); }
function fvFissiAl(cfg, k, d) {
  var out = [];
  (cfg.fissi[k] || []).forEach(function (e) { if (e.dal <= d && (!e.al || d < e.al) && !fvHas(out, e.nome)) out.push(e.nome); });
  return out;
}
function fvPublicConfig(cfg) {
  var f = {};
  FV_TURNI.forEach(function (t) { f[t.k] = fvFissiOggi(cfg.fissi[t.k] || []); });
  var pt = {};
  FV_TURNI.forEach(function (t) { pt[t.k] = fvPosti(cfg, t.k); });
  return { prezzo: cfg.prezzo, posti: cfg.posti, satispay: cfg.satispay, fissi: f, speciali: cfg.speciali, postiTurno: pt };
}
function fvPosti(cfg, k) {
  var T = fvTurno(k);
  return (cfg.postiTurno && cfg.postiTurno[k]) || (T && T.p) || cfg.posti;
}
function fvPrezzo(cfg, nome) {
  var k = Object.keys(cfg.speciali).filter(function (n) { return fvNorm(n) === fvNorm(nome); })[0];
  return k != null ? cfg.speciali[k] : cfg.prezzo;
}
// Applica la nuova lista di fissi (nomi) allo storico: nuovi da oggi, tolti fino a oggi
function fvAggiornaFissi(storico, nomi, oggi) {
  var attivi = fvFissiOggi(storico), out = [];
  nomi = (Array.isArray(nomi) ? nomi : []).map(fvClean).filter(Boolean);
  storico.forEach(function (e) {
    if (!e.al && !fvHas(nomi, e.nome)) {
      if (e.dal >= oggi) return; // aggiunto e tolto senza mai contare
      e = { nome: e.nome, dal: e.dal, al: oggi };
    }
    out.push(e);
  });
  nomi.forEach(function (n) { if (!fvHas(attivi, n) && !fvHas(fvFissiOggi(out), n)) out.push({ nome: n, dal: oggi }); });
  return out;
}

var FV_METODI = ['satispay', 'contanti', 'bonifico', 'prova']; // prova = prova gratuita, la segna solo l'istruttore
var FV_ORA_CONFERMA = '14:00'; // il posto dei fissi resta riservato fino al mercoledì a quest'ora

function fvScaduta(d, nowStr) { return nowStr >= d + ' ' + FV_ORA_CONFERMA; }

// I fissi si prenotano come tutti: finché non lo fanno il loro posto è "riservato" (fino alle 14 del mercoledì)
function fvState(cfg, st, d, token, admin, nowStr) {
  var day = function (r) { return r.data === d; };
  var P = st.list('P').filter(day), A = st.list('A').filter(day), G = st.list('G').filter(day), D = st.list('D').filter(day);
  var scaduta = fvScaduta(d, nowStr), turni = {};
  FV_TURNI.forEach(function (T) {
    var k = T.k, fx = fvFissiAl(cfg, k, d);
    var ass = A.filter(function (r) { return r.turno === k; }).map(function (r) { return r.nome; });
    var Pk = P.filter(function (r) { return r.turno === k; });
    var nonConf = [], people = [];
    fx.forEach(function (n) {
      if (fvHas(ass, n) || Pk.some(function (r) { return fvNorm(r.nome) === fvNorm(n); })) return;
      if (scaduta) nonConf.push(n); else people.push({ nome: n, fisso: true, riservato: true });
    });
    people = people.concat(Pk.map(function (r) {
      return { id: r.id, nome: r.nome, fisso: fvHas(fx, r.nome), mine: !!token && r.token === token };
    }));
    people.forEach(function (x) {
      var same = function (r) { return r.turno === k && fvNorm(r.nome) === fvNorm(x.nome); };
      var g = G.filter(same)[0], dd = D.filter(same)[0], pz = fvPrezzo(cfg, x.nome);
      x.pagato = !!g;
      x.prezzo = pz;
      if (pz === 0) x.gratis = true;
      if (g) x.metodo = g.metodo || '';
      if (!g && dd) { x.dichiarato = true; x.metodo = dd.metodo || ''; }
      // i pagamenti di una persona li vedono solo lei e l'istruttore
      if (!(admin || x.mine)) { delete x.pagato; delete x.dichiarato; delete x.metodo; delete x.gratis; delete x.prezzo; }
    });
    turni[k] = { posti: fvPosti(cfg, k), people: people, assenti: fx.filter(function (n) { return fvHas(ass, n); }), nonConfermati: nonConf, count: people.length };
  });
  var res = {
    date: d, annullata: cfg.annullate.indexOf(d) >= 0, admin: admin, turni: turni, scaduta: scaduta, oraConferma: FV_ORA_CONFERMA,
    config: { prezzo: cfg.prezzo, posti: cfg.posti, satispay: cfg.satispay }
  };
  if (admin) { var pc = fvPublicConfig(cfg); res.config.fissi = pc.fissi; res.config.postiTurno = pc.postiTurno; res.config.speciali = pc.speciali; }
  return res;
}

// p: richiesta {action, date, turno, nome, id, token, pin, ...}; st: archivio; nowStr: "yyyy-MM-dd HH:mm" ora italiana
function fvRoute(p, st, nowStr) {
  var a = p.action, cfg = fvFixConfig(st.getConfig()), admin = false, pin = st.adminPin();
  if (p.pin) {
    if (!pin) throw new Error('PIN istruttore non impostato nello script');
    if (String(p.pin) !== String(pin)) throw new Error('PIN errato');
    admin = true;
  }
  if (a === 'login') return { admin: true };
  if (a === 'setConfig') {
    if (!admin) throw new Error('Serve il PIN istruttore');
    var oggi = nowStr.slice(0, 10), nf = {}, pf = p.fissi || {};
    FV_TURNI.forEach(function (t) { nf[t.k] = fvAggiornaFissi(cfg.fissi[t.k], pf[t.k], oggi); });
    var nc = fvFixConfig({ prezzo: Number(p.prezzo), posti: Number(p.posti), fissi: nf, annullate: cfg.annullate, satispay: p.satispay, speciali: p.speciali, postiTurno: p.postiTurno });
    if (p.satispay && !nc.satispay) throw new Error('Il link Satispay deve iniziare con https://');
    st.setConfig(nc);
    return { config: fvPublicConfig(nc) };
  }
  var d = String(p.date || '');
  if (!fvIsWed(d)) throw new Error('Data non valida');
  var token = String(p.token || '');
  if (a === 'state') return fvState(cfg, st, d, token, admin, nowStr);

  var k = p.turno, nome = fvClean(p.nome);
  var needTurno = ['book', 'absent', 'add', 'pay', 'declare'].indexOf(a) >= 0;
  if (needTurno && !fvTurno(k)) throw new Error('Turno non valido');
  var full = needTurno ? fvState(cfg, st, d, token, true, nowStr) : null, cur = full ? full.turni[k] : null;
  var isFisso = needTurno && fvHas(fvFissiAl(cfg, k, d), nome);
  var annullata = cfg.annullate.indexOf(d) >= 0;
  var match = function (r) { return r.data === d && r.turno === k && fvNorm(r.nome) === fvNorm(nome); };
  var trova = function (n) { return cur.people.filter(function (x) { return fvNorm(x.nome) === fvNorm(n); })[0]; };

  if (a === 'book' || a === 'add') {
    if (a === 'add' && !admin) throw new Error('Serve il PIN istruttore');
    if (!nome) throw new Error('Scrivi il tuo nome');
    if (!admin) {
      if (annullata) throw new Error('Allenamento annullato');
      if (fvStarted(d, k, nowStr)) throw new Error('Il turno è già iniziato');
    }
    var gia = trova(nome);
    if (gia && !gia.riservato) throw new Error(nome + ' è già nella lista');
    FV_TURNI.forEach(function (T) {
      if (T.k !== k && full.turni[T.k].people.some(function (x) { return fvNorm(x.nome) === fvNorm(nome); })) throw new Error(nome + ' è già prenotato nel turno ' + T.l);
    });
    if (!admin && !gia && cur.count >= fvPosti(cfg, k)) throw new Error('Turno pieno');
    if (isFisso) st.removeWhere('A', match);
    st.add('P', { id: fvId(), data: d, turno: k, nome: gia ? gia.nome : nome, token: admin ? '' : token, creato: nowStr });
  } else if (a === 'cancel') {
    var row = st.list('P').filter(function (r) { return r.id === p.id && r.data === d; })[0];
    if (!row) throw new Error('Prenotazione non trovata');
    if (!admin) {
      if (!token || row.token !== token) throw new Error('Puoi annullare solo le prenotazioni fatte da questo telefono');
      if (fvStarted(d, row.turno, nowStr)) throw new Error('Il turno è già iniziato');
    }
    st.removeWhere('P', function (r) { return r.id === row.id; });
    var mr = function (r) { return r.data === d && r.turno === row.turno && fvNorm(r.nome) === fvNorm(row.nome); };
    st.removeWhere('G', mr);
    st.removeWhere('D', mr);
    // un fisso che annulla da solo libera il suo posto per quella sera
    if (!admin && fvHas(fvFissiAl(cfg, row.turno, d), row.nome)) st.add('A', { data: d, turno: row.turno, nome: row.nome });
  } else if (a === 'absent') {
    if (!admin) throw new Error('Serve il PIN istruttore');
    if (!isFisso) throw new Error(nome + ' non è fisso in questo turno');
    st.removeWhere('P', match);
    st.removeWhere('A', match);
    st.add('A', { data: d, turno: k, nome: nome });
    st.removeWhere('G', match);
    st.removeWhere('D', match);
  } else if (a === 'pay') {
    if (!admin) throw new Error('Serve il PIN istruttore');
    if (!trova(nome)) throw new Error(nome + ' non è in questo turno');
    var dich = st.list('D').filter(match)[0], met = FV_METODI.indexOf(p.metodo) >= 0 ? p.metodo : (dich ? dich.metodo : '');
    st.removeWhere('G', match);
    st.removeWhere('D', match);
    if (p.paid) st.add('G', { data: d, turno: k, nome: nome, metodo: met });
  } else if (a === 'declare') {
    var who = trova(nome);
    if (!who) throw new Error(nome + ' non è in questo turno');
    if (who.pagato) throw new Error('Pagamento già verificato dall’istruttore');
    var suo = who.id && token && st.list('P').some(function (r) { return r.id === who.id && r.token === token; });
    if (!admin && !suo) throw new Error('Puoi segnare il pagamento solo dal telefono con cui ti sei prenotato');
    st.removeWhere('D', match);
    if (!p.undo) {
      if (FV_METODI.indexOf(p.metodo) < 0 || (p.metodo === 'prova' && !admin)) throw new Error('Scegli come hai pagato');
      st.add('D', { data: d, turno: k, nome: who.nome, metodo: p.metodo, creato: nowStr });
    }
  } else if (a === 'toggleDate') {
    if (!admin) throw new Error('Serve il PIN istruttore');
    cfg.annullate = cfg.annullate.filter(function (x) { return x !== d; });
    if (p.annullata) cfg.annullate.push(d);
    st.setConfig(cfg);
  } else {
    throw new Error('Azione sconosciuta');
  }
  return fvState(fvFixConfig(st.getConfig()), st, d, token, admin, nowStr);
}

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

var FV_HEAD = { P: ['id', 'data', 'turno', 'nome', 'token', 'creato'], A: ['data', 'turno', 'nome'], G: ['data', 'turno', 'nome', 'metodo'], D: ['data', 'turno', 'nome', 'metodo', 'creato'] };
var FV_SHEET = { P: 'Prenotazioni', A: 'Assenze', G: 'Pagamenti', D: 'Pagamenti dichiarati' };
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
  ['P', 'A', 'G', 'D'].forEach(fvSheet_);
  if (!FvSheetStore.adminPin()) Logger.log('Ricorda: imposta ADMIN_PIN nelle Proprietà script.');
}
