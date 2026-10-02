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
