# 🚀 Publier Starbyte V0.5 sur GitHub Pages — Guide pas à pas

Temps total estimé : **10 minutes**.

## Prérequis

- [ ] Un compte GitHub (gratuit) — https://github.com/signup si besoin
- [ ] L'archive `starbyte-v0.5.zip` que je t'ai donnée

## Étape 1 — Créer le repo (2 min)

1. Va sur https://github.com/new
2. Repository name : **`starbyte`** (en minuscules, important)
3. Description : `Starbyte V0.5 beta`
4. Sélectionne **Public** (obligatoire pour GitHub Pages gratuit)
5. Coche **"Add a README file"** (un placeholder, on l'écrasera)
6. Clique **"Create repository"**

## Étape 2 — Uploader les fichiers (3 min)

Méthode rapide via l'interface web (pas besoin de Git en ligne de commande) :

1. Dans ton repo, clique **"uploading an existing file"** (lien bleu sous le titre)
2. Décompresse `starbyte-v0.5.zip` sur ton ordinateur
3. **Glisse-dépose tout le contenu du dossier** (PAS le dossier lui-même — les fichiers et sous-dossiers) :
   - `index.html`
   - `README.md`
   - `TESTERS_GUIDE.md`
   - dossier `tiles/` (avec tout son contenu)
4. En bas, message de commit : `Starbyte V0.5 — initial release`
5. Clique **"Commit changes"**

⚠️ **Vérification** : Tu dois voir dans la racine du repo :
```
📄 README.md
📄 TESTERS_GUIDE.md
📄 index.html
📁 tiles
```

Si tu vois un dossier `starbyte_v0.5_bundle/` à la place, tu as uploadé le dossier entier au lieu de son contenu → recommence en glissant le **contenu** seulement.

## Étape 3 — Activer GitHub Pages (2 min)

1. Dans ton repo, clique **Settings** (onglet tout en haut à droite)
2. Dans le menu de gauche, clique **Pages**
3. Sous **"Build and deployment"** > **Source** : choisis **"Deploy from a branch"**
4. Sous **"Branch"** : choisis **`main`** et **`/ (root)`**
5. Clique **Save**

GitHub affiche un message : *"Your site is being built..."*

## Étape 4 — Récupérer ton URL (1 min)

1. Reste sur la page **Settings > Pages**
2. Attends ~1-2 minutes (GitHub déploie)
3. Rafraîchis la page
4. Tu vois maintenant :

```
🌐 Your site is live at https://[ton-username].github.io/starbyte/
```

**Copie cette URL.** C'est elle que tu envoies à tes 10 amis.

## Étape 5 — Mettre à jour les liens dans le projet (2 min)

Pour que les README pointent bien vers ta vraie URL :

1. Dans ton repo, clique sur `README.md`
2. Clique l'icône **crayon ✏️** (Edit this file) en haut à droite
3. Remplace `[ton-username]` par ton vrai username GitHub
4. Clique **"Commit changes"** > **"Commit directly to main"**
5. Refais la même chose pour `TESTERS_GUIDE.md`

## Étape 6 — Tester (1 min)

1. Ouvre ton URL `https://[ton-username].github.io/starbyte/`
2. Vérifie que le jeu se charge bien
3. Teste sur ton iPhone aussi

## 🎉 C'est en ligne

Tu peux maintenant envoyer le `TESTERS_GUIDE.md` à tes 10 amis avec ton URL.

---

## Mises à jour futures

Quand on aura V0.6, V1.0 etc, le process sera :

1. Je te donnerai un nouveau `index.html`
2. Tu vas sur ton repo, tu cliques sur `index.html`, puis sur l'icône crayon
3. Tu remplaces le contenu par le nouveau
4. Tu commit

GitHub redéploie automatiquement en ~1 min. Tes 10 amis ont la nouvelle version sans changer de lien.

---

## Si ça plante

| Problème | Solution |
|---|---|
| URL renvoie 404 | Attends 5 min, GitHub Pages met parfois du temps. Si toujours 404 après 10 min : vérifie que tu as bien `index.html` à la racine (pas dans un sous-dossier) |
| Le jeu se charge mais les images de tiles sont cassées | Vérifie que le dossier `tiles/` est bien uploadé avec ses sous-dossiers `energie/` et `laboratoire/` |
| "Page Build failed" dans Settings > Pages | Re-upload `index.html` (parfois GitHub flag un faux positif) |

---

*Guide rédigé pour Adrien · Starbyte V0.5 · Mai 2026*
