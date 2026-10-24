#!/bin/sh
# Crea un account sul database di produzione (Neon) e salva email e password generata
# in un file sul Desktop (la password non viene stampata a schermo).
# Uso, dalla cartella api/:  sh scripts/crea-utente-produzione.sh <email> <nome>
# Richiede la CLI vercel con accesso al progetto brokenbroker-api (cartella già collegata).
set -e
[ $# -ge 2 ] || { echo "Uso: sh scripts/crea-utente-produzione.sh <email> <nome>"; exit 1; }
[ -d node_modules ] || npm ci --omit=dev
USCITA="$HOME/Desktop/BrokenBroker-account.txt"
# POSTGRES_URL_NON_POOLING è il collegamento amministratore di Neon: fp_registra
# (la funzione che crea l'account con le categorie standard) funziona anche con quello.
vercel env run -- sh -c 'DATABASE_URL="$POSTGRES_URL_NON_POOLING" node scripts/crea-utente.ts "$@"' sh "$@" > "$USCITA"
chmod 600 "$USCITA"
echo "Account creato. Credenziali salvate in $USCITA (cancellalo dopo averle messe nel gestore password)."
