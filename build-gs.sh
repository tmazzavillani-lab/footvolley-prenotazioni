#!/bin/sh
# Rigenera apps-script/Code.gs (da incollare in Google Apps Script) unendo core.js e l'adattatore Sheets.
cd "$(dirname "$0")"
{ echo "// FILE GENERATO da build-gs.sh: modifica core.js o apps-script/adapter.js, non questo."; cat core.js; echo; cat apps-script/adapter.js; } > apps-script/Code.gs
echo "Creato apps-script/Code.gs"
