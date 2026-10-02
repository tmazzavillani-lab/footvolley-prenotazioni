// Logica delle prenotazioni, condivisa tra l'app (modalità prova) e Google Apps Script.
// Se la modifichi, rigenera apps-script/Code.gs con: sh build-gs.sh
var FV_TURNI = [{ k: 't18', h: '18', l: '18–19' }, { k: 't19', h: '19', l: '19–20' }, { k: 't20', h: '20', l: '20–21' }];

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
    satispay: /^https:\/\/[^\s<>\x22\x27]+$/.test(String(c.satispay || '').trim()) ? String(c.satispay).trim().slice(0, 300) : ''
  };
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
  return { prezzo: cfg.prezzo, posti: cfg.posti, satispay: cfg.satispay, fissi: f };
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

var FV_METODI = ['satispay', 'contanti', 'bonifico'];
var FV_ORA_CONFERMA = '14:00'; // i fissi confermano entro il mercoledì a quest'ora, poi il posto si libera

// Ogni fisso viene collegato al primo telefono che conferma o segna "Non vengo"; poi solo quel telefono (o l'istruttore)
function fvTelefono(st, nome) { return st.list('K').filter(function (r) { return fvNorm(r.nome) === fvNorm(nome); })[0]; }
function fvCheckTelefono(st, nome, token, nowStr) {
  var t = fvTelefono(st, nome);
  if (t && t.token !== token) throw new Error(nome + ' è collegato a un altro telefono: chiedi all’istruttore');
  if (!t && token) st.add('K', { nome: nome, token: token, creato: nowStr });
}
function fvScaduta(d, nowStr) { return nowStr >= d + ' ' + FV_ORA_CONFERMA; }

function fvState(cfg, st, d, token, admin, nowStr) {
  var day = function (r) { return r.data === d; };
  var P = st.list('P').filter(day), A = st.list('A').filter(day), G = st.list('G').filter(day), C = st.list('C').filter(day);
  var K = st.list('K'), scaduta = fvScaduta(d, nowStr), turni = {};
  FV_TURNI.forEach(function (T) {
    var k = T.k, fx = fvFissiAl(cfg, k, d);
    var inT = function (rows) { return rows.filter(function (r) { return r.turno === k; }).map(function (r) { return r.nome; }); };
    var ass = inT(A), conf = inT(C), nonConf = [];
    var people = [];
    fx.forEach(function (n) {
      if (fvHas(ass, n)) return;
      var ok = fvHas(conf, n);
      if (!ok && scaduta) { nonConf.push(n); return; }
      var tel = K.filter(function (r) { return fvNorm(r.nome) === fvNorm(n); })[0];
      people.push({ nome: n, fisso: true, confermato: ok, telefono: tel ? (tel.token === token ? 'mio' : 'altro') : '' });
    });
    people = people.concat(P.filter(function (r) { return r.turno === k; }).map(function (r) {
      return { id: r.id, nome: r.nome, fisso: false, mine: !!token && r.token === token };
    }));
    people.forEach(function (x) {
      var g = G.filter(function (r) { return r.turno === k && fvNorm(r.nome) === fvNorm(x.nome); })[0];
      x.pagato = !!g;
      if (g && admin) x.metodo = g.metodo || '';
    });
    turni[k] = { people: people, assenti: fx.filter(function (n) { return fvHas(ass, n); }), nonConfermati: nonConf, count: people.length };
  });
  var res = {
    date: d, annullata: cfg.annullate.indexOf(d) >= 0, admin: admin, turni: turni, scaduta: scaduta, oraConferma: FV_ORA_CONFERMA,
    config: { prezzo: cfg.prezzo, posti: cfg.posti, satispay: cfg.satispay }
  };
  if (admin) res.config.fissi = fvPublicConfig(cfg).fissi;
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
    var nc = fvFixConfig({ prezzo: Number(p.prezzo), posti: Number(p.posti), fissi: nf, annullate: cfg.annullate, satispay: p.satispay });
    if (p.satispay && !nc.satispay) throw new Error('Il link Satispay deve iniziare con https://');
    st.setConfig(nc);
    return { config: fvPublicConfig(nc) };
  }
  var d = String(p.date || '');
  if (!fvIsWed(d)) throw new Error('Data non valida');
  var token = String(p.token || '');
  if (a === 'state') return fvState(cfg, st, d, token, admin, nowStr);

  var k = p.turno, nome = fvClean(p.nome);
  var needTurno = ['book', 'absent', 'add', 'pay', 'confirm'].indexOf(a) >= 0;
  if (needTurno && !fvTurno(k)) throw new Error('Turno non valido');
  var full = needTurno ? fvState(cfg, st, d, token, admin, nowStr) : null, cur = full ? full.turni[k] : null;
  var isFisso = needTurno && fvHas(fvFissiAl(cfg, k, d), nome);
  var annullata = cfg.annullate.indexOf(d) >= 0;
  var match = function (r) { return r.data === d && r.turno === k && fvNorm(r.nome) === fvNorm(nome); };
  var inList = function (n) { return cur.people.some(function (x) { return fvNorm(x.nome) === fvNorm(n); }); };

  if (a === 'book' || a === 'add' || a === 'confirm') {
    if (a !== 'book' && a !== 'confirm' && !admin) throw new Error('Serve il PIN istruttore');
    if (!nome) throw new Error('Scrivi il tuo nome');
    if (a === 'confirm' && !isFisso) throw new Error(nome + ' non è fisso in questo turno');
    if (!admin) {
      if (annullata) throw new Error('Allenamento annullato');
      if (fvStarted(d, k, nowStr)) throw new Error('Il turno è già iniziato');
    }
    var gia = cur.people.filter(function (x) { return fvNorm(x.nome) === fvNorm(nome); })[0];
    if (gia && !(gia.fisso && !gia.confermato)) throw new Error(nome + ' è già nella lista');
    FV_TURNI.forEach(function (T) {
      if (T.k !== k && full.turni[T.k].people.some(function (x) { return fvNorm(x.nome) === fvNorm(nome); })) throw new Error(nome + ' è già prenotato nel turno ' + T.l);
    });
    if (!admin && !gia && cur.count >= cfg.posti) throw new Error('Turno pieno');
    if (isFisso) {
      if (!admin) fvCheckTelefono(st, nome, token, nowStr);
      st.removeWhere('A', match);
      st.removeWhere('C', match);
      st.add('C', { data: d, turno: k, nome: nome, creato: nowStr });
    } else {
      st.add('P', { id: fvId(), data: d, turno: k, nome: nome, token: admin ? '' : token, creato: nowStr });
    }
  } else if (a === 'cancel') {
    var row = st.list('P').filter(function (r) { return r.id === p.id && r.data === d; })[0];
    if (!row) throw new Error('Prenotazione non trovata');
    if (!admin) {
      if (!token || row.token !== token) throw new Error('Puoi annullare solo le prenotazioni fatte da questo telefono');
      if (fvStarted(d, row.turno, nowStr)) throw new Error('Il turno è già iniziato');
    }
    st.removeWhere('P', function (r) { return r.id === row.id; });
    st.removeWhere('G', function (r) { return r.data === d && r.turno === row.turno && fvNorm(r.nome) === fvNorm(row.nome); });
  } else if (a === 'absent') {
    if (!isFisso) throw new Error(nome + ' non è fisso in questo turno');
    if (!admin && fvStarted(d, k, nowStr)) throw new Error('Il turno è già iniziato');
    if (!admin) fvCheckTelefono(st, nome, token, nowStr);
    st.removeWhere('A', match);
    st.removeWhere('C', match);
    st.add('A', { data: d, turno: k, nome: nome });
    st.removeWhere('G', match);
  } else if (a === 'pay') {
    if (!admin) throw new Error('Serve il PIN istruttore');
    if (!inList(nome)) throw new Error(nome + ' non è in questo turno');
    st.removeWhere('G', match);
    if (p.paid) st.add('G', { data: d, turno: k, nome: nome, metodo: FV_METODI.indexOf(p.metodo) >= 0 ? p.metodo : '' });
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
