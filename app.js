(function () {
  var $ = function (id) { return document.getElementById(id); };
  var API = (window.FV_API_URL || '').trim();

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } }

  var TOKEN = lsGet('fv-token');
  if (!TOKEN) { TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36); lsSet('fv-token', TOKEN); }
  // ?atleta mostra l'app come la vede un ragazzo, senza toccare il PIN salvato
  var VISTA_ATLETA = /(^|[?&])atleta(=|&|$)/.test(location.search);
  var PIN = VISTA_ATLETA ? null : lsGet('fv-pin');
  var state = null, curDate = null, busy = false, adminCfg = null;

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

  function load() {
    var d = curDate;
    return api({ action: 'state', date: d }).then(function (s) {
      if (d !== curDate) return;
      state = s;
      if (s.admin && !adminCfg) adminCfg = JSON.parse(JSON.stringify({ prezzo: s.config.prezzo, posti: s.config.posti, fissi: s.config.fissi, satispay: s.config.satispay || '' }));
      render();
    }).catch(function (e) {
      if (/PIN/.test(e.message) && PIN) { PIN = null; lsSet('fv-pin', null); adminCfg = null; return load(); }
      toast('Non riesco a caricare i turni: ' + e.message, true);
    });
  }

  function act(p, okMsg, then) {
    if (busy) return;
    busy = true; document.body.style.cursor = 'progress';
    p.date = curDate;
    var ok = false;
    api(p).then(function (s) { state = s; render(); if (okMsg) toast(okMsg); ok = true; })
      .catch(function (e) { toast(e.message, true); load(); })
      .then(function () { busy = false; document.body.style.cursor = ''; if (ok && then) then(); });
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
      b.append(el('small', null, d < next ? 'concluso' : dateLabel(d, { weekday: 'long' })), document.createTextNode(dateLabel(d, { day: 'numeric', month: 'long' })));
      b.onclick = function () { if (d === curDate) return; curDate = d; renderDates(); $('turni').replaceChildren(el('p', 'empty', 'Caricamento dei turni…')); load(); };
      box.append(b);
    });
    if (sel) box.scrollLeft = Math.max(0, sel.offsetLeft - box.offsetLeft - 8);
  }

  function render() {
    if (!state) return;
    if (!!state.admin !== datesAdmin) {
      if (!state.admin && curDate < wednesdays()[0]) { curDate = wednesdays()[0]; renderDates(); load(); return; }
      renderDates();
    }
    var admin = state.admin, cfg = state.config, me = myName(), now = nowRome();
    $('subline').textContent = '18–19 · 19–20 · 20–21 · ' + eur(cfg.prezzo) + ' a persona · max ' + cfg.posti + ' per turno';
    $('annullata').hidden = !state.annullata;
    var pay = $('payBar');
    pay.hidden = !cfg.satispay || state.annullata;
    if (cfg.satispay) { pay.href = cfg.satispay; pay.textContent = 'Paga ' + eur(cfg.prezzo) + ' con Satispay'; }
    var keep = {}, foc = document.activeElement && document.activeElement.id;
    FV_TURNI.forEach(function (T) { var x = $('add-' + T.k); if (x) keep[T.k] = x.value; });
    var box = $('turni'); box.replaceChildren();
    var tot = 0, paid = 0, prove = 0, perMetodo = { satispay: 0, contanti: 0, bonifico: 0 };
    var myTurn = null;
    if (me) FV_TURNI.forEach(function (T) { if (state.turni[T.k].people.some(function (x) { return fvNorm(x.nome) === fvNorm(me); })) myTurn = myTurn || T; });
    FV_TURNI.forEach(function (T) {
      var t = state.turni[T.k], n = t.count, cap = cfg.posti, started = fvStarted(curDate, T.k, now);
      tot += n;
      var card = el('article', 'turno');
      var head = el('div', 'thead');
      head.append(el('h3', null, T.l), el('span', 'count' + (n > cap ? ' over' : n === cap ? ' full' : ''), n + '/' + cap + (n >= cap ? ' · pieno' : '')));
      card.append(head);
      var bar = el('div', 'cap');
      for (var i = 0; i < Math.max(cap, n); i++) { var c = el('i'); if (i < n) c.className = t.people[i].fisso ? 'f' : 'x'; bar.append(c); }
      card.append(bar);

      var ul = el('ul', 'people'), inList = false;
      t.people.forEach(function (p) {
        var isMe = p.mine || (me && fvNorm(p.nome) === fvNorm(me));
        if (isMe) inList = true;
        if (admin && p.pagato) { if (p.metodo === 'prova') prove++; else { paid++; if (perMetodo[p.metodo] != null) perMetodo[p.metodo]++; } }
        var daConf = p.fisso && !p.confermato;
        var li = el('li', 'p' + (isMe ? ' mine' : ''));
        var dot = el('span', 'dot' + (p.pagato ? ' ok' : p.dichiarato ? ' wait' : ''));
        dot.title = p.pagato ? 'Pagato' : p.dichiarato ? 'Pagamento da verificare' : 'Da pagare';
        dot.setAttribute('aria-label', dot.title);
        li.append(dot, el('span', 'n', p.nome), el('span', 'tag' + (p.fisso ? (daConf ? ' wait' : '') : ' x'), p.fisso ? (daConf ? 'da confermare' : 'fisso ✓') : 'aggiunto'));
        if (admin) {
          if (p.pagato) {
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
          if (daConf) li.append(btn('link back', 'Conferma', function () { act({ action: 'confirm', turno: T.k, nome: p.nome }, p.nome + ' confermato'); }));
          li.append(btn('link', p.fisso ? 'Assente' : 'Togli', function () {
            if (p.fisso) act({ action: 'absent', turno: T.k, nome: p.nome }, p.nome + ' segnato assente');
            else act({ action: 'cancel', id: p.id }, p.nome + ' tolto dal turno');
          }));
        } else {
          var mio = p.mine || (p.fisso && isMe && p.telefono !== 'altro');
          if (p.pagato) li.append(el('span', 'paid ok', p.metodo === 'prova' ? 'Prova gratuita' : 'Pagato'));
          else if (p.dichiarato) {
            li.append(el('span', 'paid wait', (METODI[p.metodo] || 'Pagato') + ' · da verificare'));
            if (mio) li.append(btn('link back', 'Correggi', function () { act({ action: 'declare', turno: T.k, nome: p.nome, undo: true }, 'Ok, puoi scegliere di nuovo il metodo'); }, 'Hai sbagliato metodo? Toglilo e riscegli'));
          } else if (mio && !state.annullata) {
            var ask = el('span', 'payask'); ask.append(el('span', null, 'Ho pagato con:'));
            Object.keys(METODI).forEach(function (m) {
              ask.append(btn('pay', METODI[m], function () { act({ action: 'declare', turno: T.k, nome: p.nome, metodo: m }, 'Grazie! L’istruttore verificherà il pagamento'); }));
            });
            li.append(ask);
          } else li.append(el('span', 'paid no', 'Da pagare'));
        }
        if (!admin && !started && !state.annullata) {
          if (p.mine) li.append(btn('link', 'Annulla', function () { act({ action: 'cancel', id: p.id }, 'Prenotazione annullata'); }));
          else if (p.fisso && isMe && p.telefono !== 'altro') {
            if (daConf) li.append(btn('pay wait', 'Confermo', function () { act({ action: 'confirm', turno: T.k, nome: p.nome }, 'Presenza confermata, a mercoledì!'); }));
            li.append(btn('link', 'Non vengo', function () { act({ action: 'absent', turno: T.k, nome: p.nome }, 'Ok, segnato che questa volta non vieni'); }));
          }
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
          if (admin || (mine && !started && !state.annullata && n < cap)) ab.append(btn('link back', admin ? 'Rimetti' : 'Ci sono', function () { act({ action: 'confirm', turno: T.k, nome: a }, a + ' nel turno'); }));
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
        else if (myTurn) { label = 'Sei già nel turno ' + myTurn.l; dis = true; }
        else if (n >= cap) { label = 'Turno pieno'; dis = true; }
        var b = btn('btn primary', label, function () {
          var nm = myName();
          if (!nm) { toast('Scrivi prima nome e cognome in alto', true); $('nome').focus(); return; }
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

    $('logout').hidden = !admin;
    $('login').hidden = admin;
    $('adminPanel').hidden = !admin;
    if (admin) {
      $('tPres').textContent = tot + (prove ? ' (' + prove + ' in prova)' : '');
      $('tPrev').textContent = eur((tot - prove) * cfg.prezzo);
      $('tPaid').textContent = eur(paid * cfg.prezzo);
      $('tMetodi').textContent = Object.keys(METODI).map(function (m) { return METODI[m] + ' ' + eur(perMetodo[m] * cfg.prezzo); }).join(' · ');
      $('tDue').textContent = eur((tot - prove - paid) * cfg.prezzo);
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
      col.append(el('h3', null, T.l + ' · ' + list.length));
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
    if (document.activeElement !== $('posti')) $('posti').value = adminCfg.posti;
    if (document.activeElement !== $('satispay')) $('satispay').value = adminCfg.satispay || '';
  }

  // --- eventi ---
  $('nome').value = lsGet('fv-nome') || '';
  $('nome').addEventListener('input', function () { lsSet('fv-nome', myName()); render(); });
  $('login').onsubmit = function (e) {
    e.preventDefault();
    var pin = $('pin').value.trim(); if (!pin) return;
    PIN = pin;
    api({ action: 'login' }).then(function () { lsSet('fv-pin', pin); $('pin').value = ''; adminCfg = null; return load(); })
      .catch(function (err) { PIN = null; toast(err.message, true); });
  };
  $('logout').onclick = function () { PIN = null; lsSet('fv-pin', null); adminCfg = null; load(); };
  $('toggleDate').onclick = function () { act({ action: 'toggleDate', annullata: !state.annullata }, state.annullata ? 'Serata riattivata' : 'Serata annullata'); };
  $('prezzo').onchange = function () { var v = parseFloat(this.value); if (v >= 0) adminCfg.prezzo = v; };
  $('posti').onchange = function () { var v = parseInt(this.value, 10); if (v > 0) adminCfg.posti = v; };
  $('satispay').onchange = function () { adminCfg.satispay = this.value.trim(); };
  $('saveCfg').onclick = function () {
    var note = $('cfgNote');
    api({ action: 'setConfig', prezzo: adminCfg.prezzo, posti: adminCfg.posti, fissi: adminCfg.fissi, satispay: adminCfg.satispay })
      .then(function (r) { adminCfg = JSON.parse(JSON.stringify(r.config)); note.textContent = 'Salvato'; note.className = 'note'; return load(); })
      .catch(function (e) { note.textContent = e.message; note.className = 'note err'; });
  };

  $('demo').hidden = !!API;
  // Guida aperta alla prima visita, poi chiusa
  if (!lsGet('fv-guida')) { $('guida').open = true; lsSet('fv-guida', '1'); }
  if (VISTA_ATLETA) { $('adminBox').hidden = true; $('vistaAtleta').hidden = false; }
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
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !busy) load(); });
})();
