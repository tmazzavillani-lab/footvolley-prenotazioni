(function () {
  var $ = function (id) { return document.getElementById(id); };
  var API = (window.FV_API_URL || '').trim();

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } }

  var TOKEN = lsGet('fv-token');
  if (!TOKEN) { TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36); lsSet('fv-token', TOKEN); }
  // ?atleta mostra l'app come la vede un ragazzo, senza toccare il PIN salvato
  var VISTA_ATLETA = /(^|[?&])atleta(=|&|$)/.test(location.search);
  // Il PIN resta solo finché la scheda è aperta (sessionStorage) e scade dopo 30 minuti di inattività
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { } }
  lsSet('fv-pin', null); // vecchie versioni lo salvavano per sempre
  var PIN = VISTA_ATLETA ? null : ssGet('fv-pin'), ultimaAttivita = Date.now(), areaVisibile = !!ssGet('fv-area');
  ['click', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { ultimaAttivita = Date.now(); }, true); });
  var state = null, curDate = null, busy = false, adminCfg = null; cacheSerate = {};

  function nowRome() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace('T', ' ');
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function eur(v) { return '€' + (Math.round(v * 100) / 100).toLocaleString('it-IT'); }
  var METODI = { satispay: 'Satispay', contanti: 'Contanti', bonifico: 'Bonifico' };
  var METODI_ADMIN = { satispay: 'Satispay', contanti: 'Contanti', bonifico: 'Bonifico', prova: 'Prova gratuita' };
  function myName() { return fvClean($('nome').value); }

  var PRIMA_SERATA = '2026-10-07'; // prima serata con le prenotazioni online: prima non si mostra nulla
  // Prossimi 4 mercoledì (oggi incluso fino alle 21), più `back` mercoledì passati
  function wednesdays(back) {
    var now = nowRome(), today = new Date(now.slice(0, 10) + 'T12:00:00'), out = [];
    var d = new Date(today); d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
    if (iso(d) === now.slice(0, 10) && now.slice(11) >= '21:00') d.setDate(d.getDate() + 7);
    d.setDate(d.getDate() - 7 * (back || 0));
    for (var i = 0; i < 4 + (back || 0); i++) { if (iso(d) >= PRIMA_SERATA) out.push(iso(d)); d.setDate(d.getDate() + 7); }
    return out;
  }
  function dateLabel(s, opts) { return new Date(s + 'T12:00:00').toLocaleDateString('it-IT', opts); }

  // --- modalità prova: stesso motore, dati nel browser ---
  var demoStore = {
    load: function () { try { return JSON.parse(lsGet('fv-demo')) || {}; } catch (e) { return {}; } },
    save: function (db) { lsSet('fv-demo', JSON.stringify(db)); },
    getConfig: function () { return this.load().config || null; },
    setConfig: function (c) { var db = this.load(); db.config = c; this.save(db); },
    adminPin: function () { return '1234'; },
    demo: true,
    sendMail: function () { },
    list: function (k) { return (this.load()[k] || []).slice(); },
    add: function (k, o) { var db = this.load(); (db[k] = db[k] || []).push(o); this.save(db); },
    removeWhere: function (k, fn) { var db = this.load(); db[k] = (db[k] || []).filter(function (r) { return !fn(r); }); this.save(db); }
  };

  function api(p) {
    p.token = TOKEN;
    if (PIN) p.pin = PIN;
    if (!API) {
      return new Promise(function (res, rej) {
        try { var r = fvRoute(JSON.parse(JSON.stringify(p)), demoStore, nowRome()); r.ok = true; res(r); } catch (e) { rej(e); }
      });
    }
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(p) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Errore'); return j; });
  }

  var toastT;
  function toast(msg, err) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 4000);
  }

  // Copia locale delle serate: all'apertura si caricano tutte insieme, cambiando mercoledì si vedono subito
  var cacheSerate = {}, inCorso = {};
  function chiedi(d) {
    if (!inCorso[d]) {
      inCorso[d] = api({ action: 'state', date: d, nome: myName() })
        .then(function (s) { cacheSerate[d] = s; delete inCorso[d]; return s; },
              function (e) { delete inCorso[d]; throw e; });
    }
    return inCorso[d];
  }
  function precarica() {
    wednesdays(state && state.admin ? 12 : 0).forEach(function (d) { if (d !== curDate && !cacheSerate[d]) chiedi(d).catch(function () { }); });
  }
  function load() {
    var d = curDate, primo = !Object.keys(cacheSerate).length;
    if (primo) setTimeout(precarica, 0);
    return chiedi(d).then(function (s) {
      if (d !== curDate) return;
      state = s;
      $('turni').classList.remove('attesa');
      if (s.admin && !adminCfg) adminCfg = JSON.parse(JSON.stringify({ prezzo: s.config.prezzo, posti: s.config.posti, fissi: s.config.fissi, satispay: s.config.satispay || '', speciali: s.config.speciali || {}, postiTurno: s.config.postiTurno || {} }));
      render();
    }).catch(function (e) {
      if (/PIN/.test(e.message) && PIN) { PIN = null; ssSet('fv-pin', null); adminCfg = null; cacheSerate = {}; return load(); }
      toast('Non riesco a caricare i turni: ' + e.message, true);
    });
  }

  function act(p, okMsg, then) {
    if (busy) return;
    busy = true; document.body.style.cursor = 'progress'; document.body.classList.add('busy');
    toast('Un attimo…');
    p.date = curDate;
    var ok = false;
    try { ottimista(p); render(); } catch (e) { }
    api(p).then(function (s) { state = s; cacheSerate[p.date] = s; render(); if (okMsg) toast(okMsg); ok = true; })
      .catch(function (e) { toast(e.message, true); load(); })
      .then(function () { busy = false; document.body.style.cursor = ''; document.body.classList.remove('busy'); if (ok && then) then(); });
  }

  // Mostra subito il risultato atteso; la risposta dello script poi lo conferma o lo corregge
  function ottimista(p) {
    if (!state || !p.turno && !p.id) return;
    var tk = p.turno, t = tk && state.turni[tk];
    var trova = function (lista, n) { return lista.filter(function (x) { return fvNorm(x.nome) === fvNorm(n); })[0]; };
    if (p.action === 'book' || p.action === 'add') {
      var r = trova(t.people, p.nome);
      if (r && r.riservato) { r.riservato = false; r.mine = p.action === 'book'; r.id = 'tmp'; }
      else if (!r) { t.people.push({ id: 'tmp', nome: p.nome, fisso: false, mine: p.action === 'book' }); t.count++; }
      t.assenti = t.assenti.filter(function (n) { return fvNorm(n) !== fvNorm(p.nome); });
    } else if (p.action === 'cancel') {
      FV_TURNI.forEach(function (T) {
        var tt = state.turni[T.k];
        tt.people.forEach(function (x, i) {
          if (x.id !== p.id) return;
          if (x.fisso && state.admin) { tt.people[i] = { nome: x.nome, fisso: true, riservato: true }; }
          else { tt.people.splice(i, 1); tt.count--; if (x.fisso) tt.assenti.push(x.nome); }
        });
      });
    } else if (p.action === 'absent') {
      t.people = t.people.filter(function (x) { if (fvNorm(x.nome) === fvNorm(p.nome)) { t.count--; return false; } return true; });
      t.assenti.push(p.nome);
    } else if (p.action === 'declare') {
      var d = trova(t.people, p.nome);
      if (d) { d.dichiarato = !p.undo; d.metodo = p.undo ? '' : p.metodo; }
    } else if (p.action === 'pay') {
      var g = trova(t.people, p.nome);
      if (g) { g.pagato = !!p.paid; if (p.paid) { g.metodo = p.metodo || g.metodo; g.dichiarato = false; } }
    }
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn, title) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; if (title) b.title = title; return b; }

  var datesAdmin = false;
  function renderDates() {
    var box = $('dates'), next = wednesdays()[0], sel = null; box.replaceChildren();
    datesAdmin = !!(state && state.admin);
    // L'istruttore vede anche le ultime 12 settimane per controllare i pagamenti
    wednesdays(datesAdmin ? 12 : 0).forEach(function (d) {
      var b = el('button', d < next ? 'past' : ''); b.type = 'button';
      b.setAttribute('aria-pressed', d === curDate);
      if (d === curDate) sel = b;
      b.append(el('small', null, d < next ? 'concluso' : 'mer'), document.createTextNode(dateLabel(d, { day: 'numeric', month: 'short' })));
      b.setAttribute('aria-label', dateLabel(d, { weekday: 'long', day: 'numeric', month: 'long' }));
      b.onclick = function () {
        if (d === curDate) return; curDate = d; renderDates();
        if (cacheSerate[d]) { state = cacheSerate[d]; render(); load(); }
        else { $('turni').classList.add('attesa'); load(); }
      };
      box.append(b);
    });
    box.classList.toggle('quattro', box.children.length <= 4);
    if (sel) box.scrollLeft = Math.max(0, sel.offsetLeft - box.offsetLeft - 8);
  }

  function render() {
    if (!state) return;
    if (!!state.admin !== datesAdmin) {
      if (!state.admin && curDate < wednesdays()[0]) { curDate = wednesdays()[0]; renderDates(); load(); return; }
      renderDates();
    }
    var admin = state.admin, cfg = state.config, me = myName(), now = nowRome();
    $('subline').textContent = FV_TURNI.map(function (T) { return T.l; }).join(' · ') + ' · ' + eur(cfg.prezzo) + ' a persona';
    var io = state.io, ver = $('verifica');
    ver.hidden = admin || !io || !me || fvNorm(io.nome) !== fvNorm(me);
    if (!ver.hidden) {
      ver.classList.toggle('ok', io.verificato);
      $('verStato').textContent = io.verificato ? '✓ Nome verificato su questo dispositivo' : io.registrato
        ? 'Questo nome è già verificato su un altro dispositivo: inserisci la stessa email per ricevere il codice.'
        : 'Per prenotarti verifica il tuo nome, una volta sola: ti mandiamo un codice via email.';
      $('verInviaForm').hidden = io.verificato;
      if (io.verificato) $('verCodiceForm').hidden = true;
    }
    $('annullata').hidden = !state.annullata;
    var pay = $('payBar');
    pay.hidden = !cfg.satispay || state.annullata;
    if (cfg.satispay) { pay.href = cfg.satispay; pay.textContent = 'Paga ' + eur(cfg.prezzo) + ' con Satispay'; }
    var keep = {}, foc = document.activeElement && document.activeElement.id;
    FV_TURNI.forEach(function (T) { var x = $('add-' + T.k); if (x) keep[T.k] = x.value; });
    var box = $('turni'); box.replaceChildren();
    var tot = 0, prove = 0, gratis = 0, previsto = 0, incassato = 0, perMetodo = { satispay: 0, contanti: 0, bonifico: 0 };
    var myTurn = null;
    if (me) FV_TURNI.forEach(function (T) { if (state.turni[T.k].people.some(function (x) { return !x.riservato && fvNorm(x.nome) === fvNorm(me); })) myTurn = myTurn || T; });
    FV_TURNI.forEach(function (T) {
      var t = state.turni[T.k], n = t.count, cap = t.posti || cfg.posti, started = fvStarted(curDate, T.k, now);
      tot += n;
      var card = el('article', 'turno');
      var head = el('div', 'thead');
      head.append(el('h3', null, T.l), el('span', 'count' + (n > cap ? ' over' : n === cap ? ' full' : ''), n + '/' + cap + (n >= cap ? ' · pieno' : '')));
      card.append(head);
      var bar = el('div', 'cap');
      for (var i = 0; i < Math.max(cap, n); i++) { var c = el('i'); if (i < n) c.className = t.people[i].fisso ? 'f' : 'x'; bar.append(c); }
      card.append(bar);

      var ul = el('ul', 'people'), inList = false, mioRiservato = false;
      t.people.forEach(function (p) {
        var nomeMio = !!me && fvNorm(p.nome) === fvNorm(me), isMe = p.mine || nomeMio;
        // il pulsante del turno segue il nome scritto in alto (dallo stesso dispositivo si può prenotare anche per un amico)
        if (nomeMio && p.riservato) mioRiservato = true; else if (nomeMio) inList = true;
        var prezzo = p.prezzo != null ? p.prezzo : cfg.prezzo, free = !!p.gratis;
        if (admin) {
          if (p.pagato && p.metodo === 'prova') prove++;
          else if (free) gratis++;
          else {
            previsto += prezzo;
            if (p.pagato) { incassato += prezzo; if (perMetodo[p.metodo] != null) perMetodo[p.metodo] += prezzo; }
          }
        }
        var daConf = !!p.riservato;
        var li = el('li', 'p' + (isMe ? ' mine' : ''));
        var vedoPag = admin || p.pagato !== undefined;
        var dot = el('span', 'dot' + (!vedoPag ? ' none' : p.pagato || free ? ' ok' : p.dichiarato ? ' wait' : ''));
        dot.title = free ? 'Gratis' : p.pagato ? 'Pagato' : p.dichiarato ? 'Pagamento da verificare' : 'Da pagare';
        dot.setAttribute('aria-label', dot.title);
        li.append(dot, el('span', 'n', p.nome), el('span', 'tag' + (p.fisso ? (daConf ? ' wait' : '') : ' x'), p.fisso ? (daConf ? 'posto riservato' : 'fisso ✓') : 'aggiunto'));
        if (admin && prezzo !== cfg.prezzo) li.append(el('span', 'tag prezzo', free ? 'gratis' : eur(prezzo)));
        if (admin) {
          if (free && !p.pagato) {
            li.append(el('span', 'paid ok', 'Non paga'));
          } else if (p.pagato) {
            li.append(btn('pay on', '✓ ' + (METODI_ADMIN[p.metodo] || 'Pagato'), function () {
              act({ action: 'pay', turno: T.k, nome: p.nome, paid: false });
            }, 'Tocca per togliere il pagato'));
          } else if (p.dichiarato) {
            li.append(el('span', 'paid wait', 'Dice: ' + (METODI[p.metodo] || '?')));
            li.append(btn('pay wait', 'Verifica', function () { act({ action: 'pay', turno: T.k, nome: p.nome, paid: true }, 'Pagamento di ' + p.nome + ' verificato'); }, 'Hai controllato: segna come pagato'));
          } else {
            Object.keys(METODI_ADMIN).forEach(function (m) {
              li.append(btn('pay', METODI_ADMIN[m], function () { act({ action: 'pay', turno: T.k, nome: p.nome, paid: true, metodo: m }); }, m === 'prova' ? 'Prova gratuita: non paga' : 'Pagato con ' + METODI_ADMIN[m]));
            });
          }
          if (daConf) li.append(btn('link back', 'Conferma', function () { act({ action: 'add', turno: T.k, nome: p.nome }, p.nome + ' confermato'); }));
          if (p.fisso && !p.riservato && p.id) li.append(btn('link back', 'Togli conferma', function () { act({ action: 'cancel', id: p.id }, p.nome + ' torna a posto riservato'); }, 'Annulla la conferma: torna posto riservato'));
          li.append(btn('link', p.fisso ? 'Assente' : 'Togli', function () {
            if (p.fisso) act({ action: 'absent', turno: T.k, nome: p.nome }, p.nome + ' segnato assente');
            else act({ action: 'cancel', id: p.id }, p.nome + ' tolto dal turno');
          }));
        } else {
          var mio = !!p.mine;
          if (!mio) { /* i pagamenti degli altri non si vedono */ }
          else if (free && !p.pagato) li.append(el('span', 'paid ok', 'Gratis'));
          else if (p.pagato) li.append(el('span', 'paid ok', p.metodo === 'prova' ? 'Prova gratuita' : 'Pagamento confermato'));
          else if (p.dichiarato) {
            li.append(el('span', 'paid wait', 'Pagato con ' + (METODI[p.metodo] || '?') + ' · in attesa di conferma'));
            if (mio) li.append(btn('link back', 'Correggi', function () { act({ action: 'declare', turno: T.k, nome: p.nome, undo: true }, 'Ok, puoi scegliere di nuovo il metodo'); }, 'Hai sbagliato metodo? Toglilo e riscegli'));
          } else if (mio && !state.annullata) {
            li.append(el('span', 'paid no', 'Da pagare' + (prezzo !== cfg.prezzo ? ' ' + eur(prezzo) : '')));
            var ask = el('span', 'payask'); ask.append(el('span', null, 'Ho pagato con:'));
            Object.keys(METODI).forEach(function (m) {
              ask.append(btn('pay', METODI[m], function () { act({ action: 'declare', turno: T.k, nome: p.nome, metodo: m }, 'Grazie! L’istruttore verificherà il pagamento'); }));
            });
            li.append(ask);
          }
        }
        if (!admin && !started && !state.annullata) {
          if (p.mine) li.append(btn('link', p.fisso ? 'Non vengo' : 'Annulla', function () { act({ action: 'cancel', id: p.id }, p.fisso ? 'Ok, il tuo posto si è liberato per questa sera' : 'Prenotazione annullata'); }));
        }
        ul.append(li);
      });
      for (var j = n; j < cap; j++) { var s = el('li', 'p slot'); s.append(el('span', 'n', 'Posto libero')); ul.append(s); }
      card.append(ul);

      [['Assenti', t.assenti], ['Non confermati entro le ' + state.oraConferma, t.nonConfermati || []]].forEach(function (g) {
        if (!g[1].length) return;
        var ab = el('div', 'absent'); ab.append(g[0] + ':');
        g[1].forEach(function (a) {
          ab.append(el('span', 'who', a));
          var mine = me && fvNorm(a) === fvNorm(me);
          if (admin) ab.append(btn('link back', 'Conferma', function () { act({ action: 'add', turno: T.k, nome: a }, a + ' confermato nel turno'); }, 'Rimettilo nel turno come confermato'));
        });
        card.append(ab);
      });

      if (admin) {
        var f = el('form', 'add'), inp = el('input'); inp.type = 'text'; inp.placeholder = 'Aggiungi un nome'; inp.id = 'add-' + T.k; inp.maxLength = 40;
        var sb = el('button', 'btn', 'Aggiungi'); sb.type = 'submit';
        var pl = el('label', 'prova'), pc = el('input'); pc.type = 'checkbox'; pc.id = 'prova-' + T.k; pl.append(pc, ' prova gratuita');
        f.append(inp, sb, pl);
        f.onsubmit = function (e) {
          e.preventDefault(); var v = fvClean(inp.value); if (!v) return;
          if (!pc.checked) { act({ action: 'add', turno: T.k, nome: v }, v + ' aggiunto'); return; }
          act({ action: 'add', turno: T.k, nome: v }, v + ' aggiunto in prova gratuita', function () { act({ action: 'pay', turno: T.k, nome: v, paid: true, metodo: 'prova' }); });
        };
        card.append(f);
      } else {
        var label = 'Prenota ' + T.l, dis = false;
        if (state.annullata) { label = 'Annullato'; dis = true; }
        else if (started) { label = 'Turno già iniziato'; dis = true; }
        else if (inList) { label = 'Sei in lista'; dis = true; }
        else if (mioRiservato) { label = 'Conferma il tuo posto'; }
        else if (myTurn) { label = 'Sei già nel turno ' + myTurn.l; dis = true; }
        else if (n >= cap) { label = 'Turno pieno'; dis = true; }
        var b = btn('btn primary', label, function () {
          var nm = myName();
          if (!nm) { toast('Scrivi prima nome e cognome in alto', true); $('nome').focus(); return; }
          if (state.io && fvNorm(state.io.nome) === fvNorm(nm) && !state.io.verificato) { toast('Prima verifica il tuo nome con l’email, qui in alto', true); $('verEmail').focus(); return; }
          if (nm.split(' ').filter(function (w) { return w.replace(/[^\p{L}]/gu, '').length >= 2; }).length < 2) { toast('Scrivi nome e cognome completi (es. Marco Rossi)', true); $('nome').focus(); return; }
          act({ action: 'book', turno: T.k, nome: nm }, 'Prenotato: ' + T.l + ', ' + dateLabel(curDate, { weekday: 'long', day: 'numeric', month: 'long' }));
        });
        b.disabled = dis;
        card.append(b);
        if (inList && cfg.satispay && !state.annullata) {
          var sp = el('a', 'btn pay-sp', 'Paga ' + eur(cfg.prezzo) + ' con Satispay');
          sp.href = cfg.satispay; sp.target = '_blank'; sp.rel = 'noopener';
          card.append(sp);
        }
      }
      box.append(card);
    });
    FV_TURNI.forEach(function (T) { var x = $('add-' + T.k); if (x && keep[T.k]) x.value = keep[T.k]; });
    if (foc && /^add-/.test(foc) && $(foc)) $(foc).focus();

    $('adminBox').hidden = VISTA_ATLETA || !(admin || areaVisibile);
    $('logout').hidden = !admin;
    $('login').hidden = admin;
    $('adminPanel').hidden = !admin;
    if (admin) {
      var extra = []; if (prove) extra.push(prove + ' in prova'); if (gratis) extra.push(gratis + ' gratis');
      $('tPres').textContent = tot + (extra.length ? ' (' + extra.join(', ') + ')' : '');
      $('tPrev').textContent = eur(previsto);
      $('tPaid').textContent = eur(incassato);
      $('tMetodi').textContent = Object.keys(METODI).map(function (m) { return METODI[m] + ' ' + eur(perMetodo[m]); }).join(' · ');
      $('tDue').textContent = eur(previsto - incassato);
      $('toggleDate').textContent = state.annullata ? 'Riattiva questa serata' : 'Annulla questa serata';
      renderFissi();
    }
  }

  function renderFissi() {
    if (!adminCfg) return;
    var box = $('fissi'), focus = document.activeElement && document.activeElement.id;
    box.replaceChildren();
    FV_TURNI.forEach(function (T) {
      var col = el('div', 'col'), list = adminCfg.fissi[T.k];
      col.append(el('h3', null, T.l + ' · ' + list.length + ' fissi'));
      var pl = el('label', 'postiturno'), pi = el('input'); pi.type = 'number'; pi.min = 1; pi.max = 30; pi.id = 'pt-' + T.k;
      pi.value = (adminCfg.postiTurno || {})[T.k] || adminCfg.posti;
      pi.onchange = function () { var v = parseInt(pi.value, 10); if (v > 0) { adminCfg.postiTurno = adminCfg.postiTurno || {}; adminCfg.postiTurno[T.k] = v; $('cfgNote').textContent = 'Modifiche da salvare'; $('cfgNote').className = 'note err'; } };
      pl.append('Posti ', pi); col.append(pl);
      var chips = el('div', 'chips');
      if (!list.length) chips.append(el('span', 'empty', 'Nessun fisso'));
      list.forEach(function (n) {
        var c = el('span', 'chip', n);
        var x = btn('', '×', function () { adminCfg.fissi[T.k] = list.filter(function (y) { return y !== n; }); renderFissi(); $('cfgNote').textContent = 'Modifiche da salvare'; $('cfgNote').className = 'note err'; });
        x.setAttribute('aria-label', 'Togli ' + n);
        c.append(x); chips.append(c);
      });
      col.append(chips);
      var f = el('form', 'add'), inp = el('input'); inp.type = 'text'; inp.placeholder = 'Nuovo fisso'; inp.id = 'fx-' + T.k; inp.maxLength = 40;
      var sb = el('button', 'btn', 'Aggiungi'); sb.type = 'submit';
      f.append(inp, sb);
      f.onsubmit = function (e) {
        e.preventDefault(); var v = fvClean(inp.value); if (!v || fvHas(list, v)) return;
        adminCfg.fissi[T.k] = list.concat(v); renderFissi(); $('fx-' + T.k).focus();
        $('cfgNote').textContent = 'Modifiche da salvare'; $('cfgNote').className = 'note err';
      };
      col.append(f); box.append(col);
    });
    if (focus && $(focus) && box.contains($(focus))) $(focus).focus();
    if (document.activeElement !== $('prezzo')) $('prezzo').value = adminCfg.prezzo;
    if (document.activeElement !== $('satispay')) $('satispay').value = adminCfg.satispay || '';
    if (document.activeElement !== $('speciali')) $('speciali').value = Object.keys(adminCfg.speciali || {}).map(function (n) { return n + ' = ' + (adminCfg.speciali[n] === 0 ? 'gratis' : adminCfg.speciali[n]); }).join('\n');
  }

  // --- eventi ---
  $('nome').value = lsGet('fv-nome') || '';
  var nomeT;
  $('nome').addEventListener('input', function () { lsSet('fv-nome', myName()); render(); clearTimeout(nomeT); nomeT = setTimeout(function () { cacheSerate = {}; load(); }, 700); });
  $('verInviaForm').onsubmit = function (e) {
    e.preventDefault();
    var em = $('verEmail').value.trim(); if (!em) return;
    toast('Invio il codice…');
    api({ action: 'verificaInvia', nome: myName(), email: em }).then(function (r) {
      $('verCodiceForm').hidden = false; $('verCodice').focus();
      toast('Codice inviato a ' + r.email + (r.codiceDemo ? ' (prova: ' + r.codiceDemo + ')' : '') + '. Controlla anche lo spam.');
    }).catch(function (err) { toast(err.message, true); });
  };
  $('verCodiceForm').onsubmit = function (e) {
    e.preventDefault();
    api({ action: 'verificaConferma', nome: myName(), codice: $('verCodice').value }).then(function (r) {
      $('verCodice').value = ''; $('verCodiceForm').hidden = true;
      toast('Nome verificato: ciao ' + r.nome + '!'); load();
    }).catch(function (err) { toast(err.message, true); });
  };
  $('atletiBtn').onclick = function () {
    api({ action: 'atleti' }).then(function (r) {
      var ul = $('atleti'); ul.replaceChildren();
      if (!r.atleti.length) ul.append(el('li', 'empty', 'Nessun atleta verificato per ora.'));
      r.atleti.forEach(function (a) {
        var li = el('li', 'p');
        li.append(el('span', 'n', a.nome), el('span', 'hint', a.email + (a.telefoni > 1 ? ' · ' + a.telefoni + ' telefoni' : '')));
        li.append(btn('link', 'Sblocca', function () {
          api({ action: 'sblocca', nome: a.nome }).then(function () { toast(a.nome + ' sbloccato'); $('atletiBtn').onclick(); }).catch(function (err) { toast(err.message, true); });
        }));
        ul.append(li);
      });
    }).catch(function (err) { toast(err.message, true); });
  };
  $('login').onsubmit = function (e) {
    e.preventDefault();
    var pin = $('pin').value.trim(); if (!pin) return;
    PIN = pin;
    api({ action: 'login' }).then(function () { ssSet('fv-pin', pin); $('pin').value = ''; adminCfg = null; cacheSerate = {}; return load(); })
      .catch(function (err) { PIN = null; toast(err.message, true); });
  };
  $('logout').onclick = function () { PIN = null; ssSet('fv-pin', null); areaVisibile = false; ssSet('fv-area', null); adminCfg = null; cacheSerate = {}; load(); };
  $('toggleDate').onclick = function () { act({ action: 'toggleDate', annullata: !state.annullata }, state.annullata ? 'Serata riattivata' : 'Serata annullata'); };
  $('prezzo').onchange = function () { var v = parseFloat(this.value); if (v >= 0) adminCfg.prezzo = v; };
  $('satispay').onchange = function () { adminCfg.satispay = this.value.trim(); };
  $('speciali').onchange = function () {
    var out = {}, bad = [];
    this.value.split(/\r?\n/).forEach(function (r) {
      if (!r.trim()) return;
      var m = r.split('=');
      var n = fvClean(m[0]), v = (m[1] || '').trim().toLowerCase().replace('€', '').replace(',', '.');
      var num = v === 'gratis' ? 0 : Number(v);
      if (!n || v === '' || !(num >= 0)) bad.push(r.trim()); else out[n] = num;
    });
    adminCfg.speciali = out;
    $('cfgNote').textContent = bad.length ? 'Righe non capite: ' + bad.join(', ') : 'Modifiche da salvare';
    $('cfgNote').className = 'note err';
  };
  $('saveCfg').onclick = function () {
    var note = $('cfgNote');
    api({ action: 'setConfig', prezzo: adminCfg.prezzo, posti: adminCfg.posti, fissi: adminCfg.fissi, satispay: adminCfg.satispay, speciali: adminCfg.speciali, postiTurno: adminCfg.postiTurno })
      .then(function (r) { adminCfg = JSON.parse(JSON.stringify(r.config)); note.textContent = 'Salvato'; note.className = 'note'; return load(); })
      .catch(function (e) { note.textContent = e.message; note.className = 'note err'; });
  };

  $('demo').hidden = !!API;

  // Guida aperta alla prima visita, poi chiusa
  if (!lsGet('fv-guida')) { $('guida').open = true; lsSet('fv-guida', '1'); }
  if (VISTA_ATLETA) { $('adminBox').hidden = true; $('vistaAtleta').hidden = false; }
  // Area istruttore nascosta: si apre toccando il logo 5 volte di fila o con il link …/#tg-staff
  function apriArea() {
    areaVisibile = true; ssSet('fv-area', '1');
    $('adminBox').hidden = VISTA_ATLETA;
    if (!VISTA_ATLETA) { $('adminBox').scrollIntoView({ behavior: 'smooth' }); setTimeout(function () { $('pin').focus(); }, 400); }
  }
  function chiudiArea() {
    areaVisibile = false; ssSet('fv-area', null);
    if (PIN) { PIN = null; ssSet('fv-pin', null); adminCfg = null; cacheSerate = {}; load(); }
    $('adminBox').hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  var tocchiLogo = 0, tocchiT;
  $('logo').addEventListener('click', function () {
    tocchiLogo++; clearTimeout(tocchiT); tocchiT = setTimeout(function () { tocchiLogo = 0; }, 2000);
    if (tocchiLogo >= 5) { tocchiLogo = 0; if ($('adminBox').hidden) apriArea(); else chiudiArea(); }
  });
  if (location.hash === '#tg-staff') { apriArea(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }
  var IBAN = (window.FV_IBAN || '').trim();
  if (IBAN) {
    $('iban').textContent = IBAN;
    $('copyIban').onclick = function () {
      var done = function () { toast('IBAN copiato'); };
      try { navigator.clipboard.writeText(IBAN).then(done, function () { selIban(); }); } catch (e) { selIban(); }
    };
  } else $('payInfo').hidden = true;
  function selIban() { var r = document.createRange(); r.selectNodeContents($('iban')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('IBAN selezionato: copialo'); }
  curDate = wednesdays()[0];
  renderDates();
  load();
  setInterval(function () { if (!busy && document.visibilityState === 'visible') load(); }, 30000);
  setInterval(function () {
    if (PIN && Date.now() - ultimaAttivita > 30 * 60000) { PIN = null; ssSet('fv-pin', null); areaVisibile = false; ssSet('fv-area', null); adminCfg = null; cacheSerate = {}; toast('Uscito dall’area istruttore per inattività'); load(); }
  }, 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !busy) load(); });
})();
