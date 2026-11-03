# Tests de confidentialité

Vérifient automatiquement une partie des preuves demandées par l'audit de confidentialité.

- `test_consentement.js` : Google Analytics sur le vrai site (arrivée, refus, accord, retrait), services tiers, et jeu sans Google Analytics. Lecture seule : les envois de mesure et Supabase sont bloqués.
- `test_anthropic.js` : champs envoyés à Anthropic par le filtre des logos, l'assistant et le jeu, avec un faux service local. Aucune clé, aucun appel réel.

**Lancer :** GitHub → Actions → « Audit de confidentialité » → Run workflow. Il tourne aussi chaque lundi. Le résumé s'affiche sur la page du passage, et le relevé daté se télécharge dans ses « Artifacts » (conservé 90 jours : archiver ceux qui servent de preuve).

**En local :**

```sh
npm i --no-save playwright esbuild && npx playwright install chromium
node tools/confidentialite/test_anthropic.js
node tools/confidentialite/test_consentement.js
```

Statuts : ✅ conforme, ⚠️ point connu à suivre (ne fait pas échouer), ❌ écart à corriger.

**Le dépôt est public :** ces journaux aussi. Ne jamais y afficher de donnée de joueur, de clé ni de cookie complet.

Ces tests ne jugent ni la base légale ni la clarté des textes, et ils ne remplacent pas le registre : `claude/starbyte_registre_rgpd.md`.
