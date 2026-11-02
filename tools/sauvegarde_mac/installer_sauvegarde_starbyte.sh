#!/bin/bash
# Starbyte — copie automatique des parties sur ce Mac.
# Installe : bash installer_sauvegarde_starbyte.sh   (demande la clé secrète Supabase, rangée dans le Trousseau)
# Désinstalle : bash installer_sauvegarde_starbyte.sh --retirer   (les copies déjà faites restent)
set -u
LABEL="online.starbyte.sauvegarde"
HOME_APP="$HOME/Library/Application Support/StarbyteSauvegarde"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOSSIER="$HOME/Starbyte_sauvegardes"

if [ "${1:-}" = "--retirer" ]; then
  launchctl unload "$PLIST" 2>/dev/null
  rm -f "$PLIST"; rm -rf "$HOME_APP"
  security delete-generic-password -s "$LABEL" >/dev/null 2>&1
  echo "Copie automatique retirée. Tes copies restent dans $DOSSIER."
  exit 0
fi

echo "Colle la clé secrète Supabase (Project Settings → API Keys → Secret key). Rien ne s'affiche quand tu colles."
printf "Clé : "; read -rs CLE; echo
[ -n "$CLE" ] || { echo "Aucune clé saisie, rien n'est installé."; exit 1; }
security add-generic-password -U -s "$LABEL" -a starbyte -T /usr/bin/security -w "$CLE" || { echo "Impossible d'écrire dans le Trousseau."; exit 1; }
unset CLE

mkdir -p "$HOME_APP" "$DOSSIER" "$HOME/Library/LaunchAgents"; chmod 700 "$DOSSIER"
cat > "$HOME_APP/sauvegarde.sh" <<'SCRIPT'
#!/bin/bash
# Télécharge saves, mondes, colonies et achats, et les range dans ~/Starbyte_sauvegardes. Garde les 120 dernières copies (30 jours).
set -u
URL="https://elupnpdcblztpfywnhjl.supabase.co/rest/v1"
LABEL="online.starbyte.sauvegarde"
DOSSIER="$HOME/Starbyte_sauvegardes"
GARDER=120
TAILLE_PAGE=500
JOURNAL="$DOSSIER/journal.txt"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
dire() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$JOURNAL"; }
echec() { dire "ÉCHEC : $*"; osascript -e "display notification \"$*\" with title \"Sauvegarde Starbyte en échec\"" >/dev/null 2>&1; exit 1; }
CLE="$(security find-generic-password -s "$LABEL" -w 2>/dev/null)" || echec "clé introuvable dans le Trousseau"
[ -n "$CLE" ] || echec "clé vide"
# Les clés sb_secret ne sont pas des JWT : elles passent seulement par apikey.
case "$CLE" in sb_*) AUTH="X-Starbyte: 1" ;; *) AUTH="Authorization: Bearer $CLE" ;; esac
total_saves=0
telecharger() {  # table, obligatoire (1/0)
  local t="$1" obl="$2" off=0 n=0 total=""
  while :; do
    local code
    code=$(curl -sS --max-time 180 -D "$TMP/h" -o "$TMP/$t.$n.json" -w '%{http_code}' \
      -H "apikey: $CLE" -H "$AUTH" -H "Prefer: count=exact" \
      "$URL/$t?select=*&order=user_id&limit=$TAILLE_PAGE&offset=$off") || code=000
    case "$code" in
      200|206) ;;
      *) rm -f "$TMP/$t.$n.json"
         [ "$obl" = 1 ] && echec "$t : réponse HTTP $code"
         dire "$t ignorée (HTTP $code)"; return 0 ;;
    esac
    total=$(tr -d '\r' < "$TMP/h" | sed -n 's/^[Cc]ontent-[Rr]ange: .*\/\([0-9][0-9]*\)$/\1/p' | tail -1)
    [ -n "$total" ] || { [ "$obl" = 1 ] && echec "$t : total illisible"; total=0; }
    off=$((off + TAILLE_PAGE)); n=$((n + 1))
    [ "$off" -lt "$total" ] || break
  done
  [ "$t" = saves ] && total_saves="$total"
  return 0
}
telecharger saves 1
[ "$total_saves" -gt 0 ] || echec "aucune partie reçue : copie précédente conservée"
for t in worlds colonies bm_purchases bm_ship_paint bm_logos; do telecharger "$t" 0; done
NOM="starbyte_$(date '+%Y-%m-%d_%Hh%M').tar.gz"
tar -czf "$TMP/$NOM" -C "$TMP" $(cd "$TMP" && ls | grep '\.json$') || echec "archive impossible"
tar -tzf "$TMP/$NOM" >/dev/null 2>&1 || echec "archive illisible"
mv "$TMP/$NOM" "$DOSSIER/$NOM" || echec "écriture impossible dans $DOSSIER"
chmod 600 "$DOSSIER/$NOM"
ls -1t "$DOSSIER"/starbyte_*.tar.gz 2>/dev/null | tail -n +$((GARDER + 1)) | while IFS= read -r f; do rm -f "$f"; done
dire "OK : $NOM, $total_saves parties"
SCRIPT
chmod 700 "$HOME_APP/sauvegarde.sh"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HOME_APP/sauvegarde.sh</string></array>
  <key>StartInterval</key><integer>21600</integer>
  <key>RunAtLoad</key><false/>
</dict></plist>
PL

echo "Premier essai…"
if /bin/bash "$HOME_APP/sauvegarde.sh"; then
  launchctl unload "$PLIST" 2>/dev/null; launchctl load "$PLIST"
  echo "C'est en place : une copie toutes les 6 heures dans $DOSSIER (30 jours gardés)."
  ls -lh "$DOSSIER" | tail -2
else
  echo "Le premier essai a échoué, l'automatisme n'est pas activé :"
  tail -1 "$DOSSIER/journal.txt"
  exit 1
fi
