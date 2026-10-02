# Ravenna Footvolley · Prenotazioni

Mini app per prenotare gli allenamenti del mercoledì sera (18–19, 19–20, 20–21, max 6 per turno, €16).
T&G Academy a.s.d. – affiliata CSEN.

- **Ragazzi**: aprono il link, scrivono il nome, toccano "Prenota". Nessun account. Possono annullare
  la propria prenotazione dallo stesso telefono; i fissi possono segnare "Non vengo".
- **Istruttore** (in fondo alla pagina, con PIN): gestisce i fissi, segna i pagamenti, aggiunge o
  toglie persone, annulla una serata, vede incassato e da incassare.
- **Satispay**: se in Area istruttore inserisci il tuo link di pagamento Satispay, chi è in lista vede
  il pulsante "Paga €16 con Satispay".
- **Pagamenti**: li segna solo l'istruttore. Controlli la Colletta Satispay e premi "Segna pagato"
  accanto al nome: tutti vedono "✓ Pagato".
- Le prenotazioni finiscono in un **Google Sheet** tuo (fogli *Prenotazioni*, *Assenze*, *Pagamenti*).

Finché `config.js` non contiene l'URL dello script, l'app gira in **modalità prova** (dati solo sul
dispositivo, PIN di prova `1234`).

## Collegare il Google Sheet (una volta sola, ~10 minuti)

1. Crea un nuovo Google Sheet (es. "Footvolley prenotazioni").
2. Menu **Estensioni → Apps Script**.
3. Cancella il contenuto di `Code.gs` e incolla tutto il file [`apps-script/Code.gs`](apps-script/Code.gs).
4. **Impostazioni progetto** (rotellina) → in fondo **Proprietà script** → aggiungi
   `ADMIN_PIN` con il PIN che vuoi usare (es. 4–6 cifre). Nella stessa pagina imposta il fuso orario
   *(GMT+01:00) Europe/Rome*.
5. Torna nell'editor, scegli la funzione `setup` e premi **Esegui**: Google chiede l'autorizzazione
   (è il tuo script sul tuo foglio) → consenti. Nel foglio compaiono le schede.
6. **Esegui il deployment → Nuovo deployment** → tipo **App web**:
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**
   → **Esegui il deployment** e copia l'**URL dell'app web** (finisce con `/exec`).
7. Su GitHub apri `config.js` → matita → incolla l'URL tra gli apici:
   `window.FV_API_URL = 'https://script.google.com/macros/s/…/exec';` → **Commit changes**.
   Dopo un minuto l'app usa il foglio vero.

Se modifichi lo script in futuro: **Esegui il deployment → Gestisci deployment → modifica → Nuova
versione**, così l'URL resta lo stesso.

## File

| File | Cosa fa |
|---|---|
| `index.html`, `style.css`, `app.js` | L'app (GitHub Pages) |
| `core.js` | Regole di prenotazione (posti, doppioni, annulli), usate sia dall'app in prova sia dallo script |
| `apps-script/adapter.js` | Collegamento al Google Sheet |
| `apps-script/Code.gs` | File da incollare in Apps Script, generato con `sh build-gs.sh` |
| `config.js` | URL dello script |

## Stato

- 2026-10-01: prima versione. Testata la logica (posti, doppioni, annullo, PIN, turni passati) e
  l'app in modalità prova. Pubblicata su https://tmazzavillani-lab.github.io/footvolley-prenotazioni/
- 2026-10-02: pulsante di pagamento Satispay (link configurabile dall'Area istruttore). 
- 2026-10-02: stato pagamento accanto a ogni nome ("Ho pagato" del ragazzo + conferma istruttore,
  foglio *Pagamenti dichiarati*). 
- 2026-10-02: collegato il Google Sheet "Footvolley prenotazioni" (script standalone con proprietà
  SHEET_ID e ADMIN_PIN). Provati sul backend vero: prenotazione, "Ho pagato", annullo (solo dallo
  stesso telefono). Da fare: inserire i fissi e il link Satispay dall'Area istruttore, prova dal telefono.
- 2026-10-02: tolto "Ho pagato" dei ragazzi: i pagamenti li segna solo l'istruttore (Colletta Satispay).
- 2026-10-02: l'istruttore (con PIN) vede anche le ultime 12 serate concluse per controllare e segnare i pagamenti.
- 2026-10-02: i fissi contano solo dalla data di inserimento (storico dal/al in CONFIG); se tolti restano nelle serate passate. Script Apps aggiornato.
- 2026-10-02: un nome può stare in un solo turno per serata (anche per l'istruttore).
- 2026-10-02: lo storico istruttore parte dal 7 ottobre 2026 (prima serata).
- Quando si modificano style.css/app.js/core.js/config.js, aumentare ?v=N in index.html (cache di GitHub Pages: 10 minuti).
- 2026-10-02: richiesto nome e cognome completi per prenotare (ricordato dal telefono).
- 2026-10-02: pulsante "Paga con Satispay" sempre visibile agli atleti in alto (oltre a quello sotto il proprio turno).
- 2026-10-02 (script v3): fissi confermano entro mercoledì 14:00 (foglio *Conferme fissi*), poi il posto si libera; pagamenti con metodo Satispay/Contanti/Bonifico (colonna *metodo*); IBAN e info contanti/bonifico per gli atleti.
- 2026-10-02: pulsante "Manda la lista nel gruppo WhatsApp" visibile solo all'istruttore.
- 2026-10-02 (script v4): ogni fisso è collegato al primo telefono che conferma/segna assenza (foglio *Telefoni fissi*); per cambiarlo cancellare la riga nel foglio.
- 2026-10-02: tolto il pulsante di condivisione WhatsApp.
- 2026-10-02: pallino pagamento accanto a ogni nome (verde pagato, rosso da pagare); vista atleta con ?atleta (pulsante "Vedi come atleta").
- 2026-10-02: sezione "Come funziona" (fissi / non fissi / pagamento), aperta alla prima visita.
- 2026-10-02 (script v5): i ragazzi segnano "Ho pagato con" (Satispay/Contanti/Bonifico) -> giallo; l'istruttore preme Verifica -> verde. Metodo "Prova gratuita" solo istruttore (escluso dagli incassi), anche come spunta quando aggiunge un nome.
- 2026-10-02 (script v6): prezzi concordati per persona (Area istruttore, "Nome Cognome = 10" o "= gratis"); visibili solo all'istruttore e al diretto interessato; chi è gratis risulta in regola agli altri; incassi calcolati sul prezzo di ciascuno.
- 2026-10-02 (script v7): i pagamenti (stato, metodo, gratis, prezzo) li vedono solo l'interessato e l'istruttore; lo script non li manda agli altri telefoni.
- 2026-10-02 (script v8): i fissi si prenotano come tutti. Il loro nome resta "posto riservato" fino a mer 14:00; confermano con "Conferma il tuo posto" (prenotazione legata al telefono). Tolti conferme separate e collegamento telefono (fogli *Conferme fissi* e *Telefoni fissi* non più usati).
- 2026-10-02: promemoria settimanale per i fissi (promemoria.ics e link Google Calendar, mercoledì 9:00) nella guida.
- 2026-10-02: istruttore: "Togli conferma" sui fissi confermati (tornano posto riservato).
- 2026-10-02 (script v9): turno 17-18 (4 posti di default), posti per turno modificabili dall'Area istruttore; script più veloce (ogni foglio letto una volta per richiesta); riscontro immediato "Un attimo…" nell'app.
- 2026-10-02: aggiornamento immediato dell'interfaccia al tocco (poi confermato dallo script).
- 2026-10-02 (script v10): i prezzi concordati tornano all'Area istruttore (prima il riquadro si svuotava dopo il ricaricamento). Scritte pagamento atleta: Da pagare / Pagato con X · in attesa di conferma / Pagamento confermato.
- 2026-10-02 (script v11): verifica del nome con codice via email (foglio *Atleti verificati*), obbligatoria per prenotarsi/confermare; istruttore: elenco atleti verificati e Sblocca. Tolto il promemoria calendario. Lo script invia email dal Gmail dell'istruttore (MailApp, autorizzato).
- 2026-10-02: istruzioni di registrazione con email nella guida; mercoledì precaricati per passare dall'uno all'altro senza attesa.
- 2026-10-02 (script v12): sicurezza area istruttore: PIN solo per la sessione (sessionStorage, cancellato chiudendo la scheda) e uscita automatica dopo 30 min di inattività; campo PIN non salvabile dal browser; blocco 15 min dopo 5 PIN sbagliati (CacheService). Messaggi "dispositivo" invece di "telefono".
- 2026-10-02: Area istruttore nascosta: si apre toccando il logo 5 volte o con il link .../#tg-staff; si richiude con Esci o per inattività.
- 2026-10-02: 5 tocchi sul logo anche per richiudere l'area (ed esce). Aggiornamento automatico: index.html confronta FV_VERSIONE con versione.txt e ricarica se c'è una versione nuova (anche nel browser di WhatsApp). AD OGNI MODIFICA: aumentare insieme versione.txt, FV_VERSIONE e ?v=N in index.html.
