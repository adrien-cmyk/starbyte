# m3-verify — rejeu serveur des parties de match-3 (Temps A + B)

Le jeu envoie chaque partie (graine, coups, choix, crédit annoncé) à `m3_report` (SQL v49). Cette fonction rejoue
les parties en attente du joueur qui l'appelle, avec **le même moteur que le jeu**, et note les écarts dans
`m3_sessions` et `mp_anomalies` (`m3_mismatch`). Au Temps A rien ne change en jeu : on observe.

Temps B (SQL v50, 08/11 soir) : chaque partie rejouée est aussi **réglée** dans le grand livre serveur (`sb_m3_settle`) :
le solde serveur du joueur reçoit le crédit rejoué, borné par ce que le jeu dit avoir réellement ajouté. Appelée avec
`{"seed": 123}`, la fonction renvoie en plus `session` (crédit serveur de cette graine) — c'est ce que le jeu attend
avant d'encaisser quand l'interrupteur `sb_settings.m3_credit_on` est à `true` (false aujourd'hui : dormant).

## Fichiers (à déployer ensemble, mêmes noms)

| Fichier | Rôle |
|---|---|
| `index.ts` | la fonction (session du joueur, écriture avec la clé de service, autotest) |
| `m3core.js` | **copie exacte** de `src/m3core.js` (moteur pur) — générée par `tools/build-modules.sh m3-verify` |
| `m3session.js` | **copie exacte** de `src/m3session.js` (règles de session, rejeu) — idem |

Ne jamais modifier ces copies à la main : éditer `src/`, puis `tools/build-modules.sh match3 && tools/build-modules.sh m3-verify`,
pour que le téléphone et le serveur jouent avec le même code.

## Déployer

Prérequis : `schema_mp_v49_match3_rapports.sql` puis `schema_mp_v50_grand_livre.sql` exécutés. Redéployer la fonction après v50 (nouvelle version d'index.ts).

- **Tableau de bord Supabase** → Edge Functions → *Deploy a new function* → *Via editor* → nom `m3-verify` → créer les
  trois fichiers ci-dessus (même nom, même contenu) → *Deploy*. Laisser « Verify JWT » activé.
- **ou** copier le dossier dans `supabase/functions/m3-verify/` puis `supabase functions deploy m3-verify`.

## Vérifier

Tableau de bord → Edge Functions → `m3-verify` → **Test** → POST, corps `{"action":"selftest"}` → réponse attendue :
`{"moves":…, "tier":…, "base":{…}, "replayIdentical":true}`.

Puis, après quelques parties jouées par les testeurs :
```sql
select pseudo, seed_src, tier, server_tier, claimed, server_credit, mismatch, error, created_at
from public.m3_sessions order by id desc limit 50;
select at, pseudo, detail from public.mp_anomalies where kind like 'm3_%' order by at desc;
```
`mismatch = false` partout chez les joueurs honnêtes : le rejeu est fiable, on peut passer au Temps B (créditer).
