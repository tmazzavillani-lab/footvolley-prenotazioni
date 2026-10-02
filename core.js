// Logica delle prenotazioni, condivisa tra l'app (modalità prova) e Google Apps Script.
// Se la modifichi, rigenera apps-script/Code.gs con: sh build-gs.sh
var FV_TURNI = [{ k: 't18', h: '18', l: '18–19' }, { k: 't19', h: '19', l: '19–20' }, { k: 't20', h: '20', l: '20–21' }];

function fvNorm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function fvClean(s) { return String(s || '').replace(/[<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 40); }
function fvHas(arr, n) { return arr.some(function (x) { return fvNorm(x) === fvNorm(n); }); }
function fvIsWed(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T12:00:00Z').getUTCDay() === 3; }
function fvTurno(k) { return FV_TURNI.filter(function (t) { return t.k === k; })[0]; }
function fvStarted(d, k, nowStr) { return nowStr >= d + ' ' + fvTurno(k).h + ':00'; }
function fvId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function fvFixConfig(c) {
  c = c || {};
  var f = c.fissi || {}, out = {
    prezzo: typeof c.prezzo === 'number' && c.prezzo >= 0 ? c.prezzo : 16,
    posti: c.posti >= 1 && c.posti <= 30 ? Math.round(c.posti) : 6,
    fissi: {},
    annullate: Array.isArray(c.annullate) ? c.annullate.filter(fvIsWed) : [],
    satispay: /^https:\/\/[^\s<>"']+$/.test(String(c.satispay || '').trim()) ? String(c.satispay).trim().slice(0, 300) : ''
  };
  FV_TURNI.forEach(function (t) {
    var list = [];
    (Array.isArray(f[t.k]) ? f[t.k] : []).forEach(function (n) { n = fvClean(n); if (n && !fvHas(list, n)) list.push(n); });
    out.fissi[t.k] = list.slice(0, 30);
  });
  return out;
}

function fvState(cfg, st, d, token, admin) {
  var P = st.list('P').filter(function (r) { return r.data === d; });
  var A = st.list('A').filter(function (r) { return r.data === d; });
  var G = st.list('G').filter(function (r) { return r.data === d; });
  var D = st.list('D').filter(function (r) { return r.data === d; });
  var turni = {};
  FV_TURNI.forEach(function (T) {
    var k = T.k, fx = cfg.fissi[k] || [];
    var ass = A.filter(function (r) { return r.turno === k; }).map(function (r) { return r.nome; });
    var people = fx.filter(function (n) { return !fvHas(ass, n); }).map(function (n) { return { nome: n, fisso: true }; })
      .concat(P.filter(function (r) { return r.turno === k; }).map(function (r) {
        return { id: r.id, nome: r.nome, fisso: false, mine: !!token && r.token === token };
      }));
    people.forEach(function (x) {
      var same = function (g) { return g.turno === k && fvNorm(g.nome) === fvNorm(x.nome); };
      x.pagato = G.some(same);
      x.dichiarato = !x.pagato && D.some(same);
    });
    turni[k] = { people: people, assenti: fx.filter(function (n) { return fvHas(ass, n); }), count: people.length };
  });
  var res = {
    date: d, annullata: cfg.annullate.indexOf(d) >= 0, admin: admin, turni: turni,
    config: { prezzo: cfg.prezzo, posti: cfg.posti, satispay: cfg.satispay }
  };
  if (admin) res.config.fissi = cfg.fissi;
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
    var nc = fvFixConfig({ prezzo: Number(p.prezzo), posti: Number(p.posti), fissi: p.fissi, annullate: cfg.annullate, satispay: p.satispay });
    if (p.satispay && !nc.satispay) throw new Error('Il link Satispay deve iniziare con https://');
    st.setConfig(nc);
    return { config: nc };
  }
  var d = String(p.date || '');
  if (!fvIsWed(d)) throw new Error('Data non valida');
  var token = String(p.token || '');
  if (a === 'state') return fvState(cfg, st, d, token, admin);

  var k = p.turno, nome = fvClean(p.nome);
  var needTurno = ['book', 'absent', 'add', 'pay', 'declare'].indexOf(a) >= 0;
  if (needTurno && !fvTurno(k)) throw new Error('Turno non valido');
  var cur = needTurno ? fvState(cfg, st, d, token, admin).turni[k] : null;
  var isFisso = needTurno && fvHas(cfg.fissi[k], nome);
  var annullata = cfg.annullate.indexOf(d) >= 0;

  if (a === 'book' || a === 'add') {
    if (a === 'add' && !admin) throw new Error('Serve il PIN istruttore');
    if (!nome) throw new Error('Scrivi il tuo nome');
    if (!admin) {
      if (annullata) throw new Error('Allenamento annullato');
      if (fvStarted(d, k, nowStr)) throw new Error('Il turno è già iniziato');
    }
    if (cur.people.some(function (x) { return fvNorm(x.nome) === fvNorm(nome); })) throw new Error(nome + ' è già nella lista');
    if (!admin && cur.count >= cfg.posti) throw new Error('Turno pieno');
    if (isFisso) st.removeWhere('A', function (r) { return r.data === d && r.turno === k && fvNorm(r.nome) === fvNorm(nome); });
    else st.add('P', { id: fvId(), data: d, turno: k, nome: nome, token: admin ? '' : token, creato: nowStr });
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
  } else if (a === 'absent') {
    if (!isFisso) throw new Error(nome + ' non è fisso in questo turno');
    if (!admin && fvStarted(d, k, nowStr)) throw new Error('Il turno è già iniziato');
    var match = function (r) { return r.data === d && r.turno === k && fvNorm(r.nome) === fvNorm(nome); };
    if (p.back) {
      if (!admin && cur.count >= cfg.posti) throw new Error('Turno pieno');
      st.removeWhere('A', match);
    } else {
      st.removeWhere('A', match);
      st.add('A', { data: d, turno: k, nome: nome });
      st.removeWhere('G', match);
      st.removeWhere('D', match);
    }
  } else if (a === 'pay') {
    if (!admin) throw new Error('Serve il PIN istruttore');
    var m2 = function (r) { return r.data === d && r.turno === k && fvNorm(r.nome) === fvNorm(nome); };
    st.removeWhere('G', m2);
    st.removeWhere('D', m2);
    if (p.paid) st.add('G', { data: d, turno: k, nome: nome });
  } else if (a === 'declare') {
    var who = cur.people.filter(function (x) { return fvNorm(x.nome) === fvNorm(nome); })[0];
    if (!who) throw new Error(nome + ' non è in questo turno');
    if (who.pagato) throw new Error('Pagamento già confermato');
    var m3 = function (r) { return r.data === d && r.turno === k && fvNorm(r.nome) === fvNorm(nome); };
    st.removeWhere('D', m3);
    if (!p.undo) st.add('D', { data: d, turno: k, nome: who.nome, creato: nowStr });
  } else if (a === 'toggleDate') {
    if (!admin) throw new Error('Serve il PIN istruttore');
    cfg.annullate = cfg.annullate.filter(function (x) { return x !== d; });
    if (p.annullata) cfg.annullate.push(d);
    st.setConfig(cfg);
  } else {
    throw new Error('Azione sconosciuta');
  }
  return fvState(fvFixConfig(st.getConfig()), st, d, token, admin);
}
