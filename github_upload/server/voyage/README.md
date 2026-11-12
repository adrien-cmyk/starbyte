# voyage — voyages fixés par le serveur (étape 4 de la migration de la carte)

Le téléphone demande un voyage : le monde de départ, le port franc d'arrivée, la catégorie du tanker (T1 à T3),
l'itinéraire choisi (vol libre direct, ou par les corridors connus) et l'id de sa mission. Cette fonction calcule
**elle-même** le chemin, les horaires et le carburant avec le générateur de l'univers et le réseau de corridors
(règles E1, E3 et E7), et les écrit dans `public.voyages`. Le téléphone n'envoie jamais une durée ni un coût.

Au début, seuls les tankers du compte pilote (Hadrien) partis depuis la nouvelle carte vers un port du réseau passent
par ici. Tant que la fonction n'est pas déployée, le jeu le dit et le tanker part avec les horaires d'aujourd'hui.

## Fichiers (à déployer ensemble, mêmes noms)

| Fichier | Rôle |
|---|---|
| `index.ts` | la fonction : session du joueur, monde de départ vérifié au registre, écriture avec la clé de service |
| `voyage_core.js` | **copie générée** : générateur de l'univers + réseau + règles (`tools/build-voyage.py`) |

Ne jamais modifier `voyage_core.js` à la main : éditer `src/voyage_rules.js` (ou l'Atlas), puis
`python3 tools/build-voyage.py`, puis `node tools/test_voyage.mjs`, puis redéployer.

## Installer (une fois)

1. **Supabase → SQL Editor** : coller `server/schema_mp_v54_voyages.sql` → *Run*.
2. **Edge Functions → Deploy a new function → Via editor** : nom `voyage` → créer les deux fichiers ci-dessus (même nom,
   même contenu) → *Deploy*. Laisser « Verify JWT » activé.
   - ou : copier le dossier dans `supabase/functions/voyage/` puis `supabase functions deploy voyage`.

## Vérifier

Edge Functions → `voyage` → **Test** → POST, corps `{"action":"selftest"}` → réponse attendue :
`{"net":"net-b132e211-r4097","plans":[{"k":"libre","len":3583,…},{"k":"cor","len":4278,…}]}`.

Puis, après un tanker lancé depuis la nouvelle carte :
```sql
select mission_id, origin, dest, tier, pick, net_version, departed_at, arrives_at, fuel, plan->>'nCor' as troncons
from public.voyages order by created_at desc limit 20;
```
