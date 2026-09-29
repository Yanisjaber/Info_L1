# Révisions L1 Informatique — Semestre 1

Site de révision (cours réécrits, QCM avec correction, éval blanche chronométrée, flashcards à répétition espacée,
exercices corrigés, calendrier des CC, calculateur de notes, recherche). Statique : aucun serveur à gérer.

- **6 matières** : Algorithmique 1, Bas, Devenir étudiant, Math1 Bases 2, Math1 Calc 1, Science du numérique
- **35 séances** de cours · **390 QCM** · **412 flashcards** · **112 exercices** · **20 échéances** de CC
- Progression sauvegardée dans le navigateur, et synchronisée entre appareils si tu actives Supabase (facultatif)

## 1. Tester en local (30 secondes)

Le site charge des fichiers JSON : il ne marche pas en double-cliquant sur `index.html`. Depuis ce dossier :

```bash
python3 -m http.server 8000
```
puis ouvre http://localhost:8000

## 2. (Facultatif) Synchroniser sur tous tes appareils avec Supabase

1. Crée un compte gratuit sur https://supabase.com, puis **New project** (choisis une région proche, ex. Paris ; note le mot de passe de la base, tu n'en auras pas besoin ensuite).
2. Dans le projet : **SQL Editor → New query**, colle le contenu de `supabase/setup.sql`, clique **Run**. Ça crée la table `progress` avec la sécurité par ligne.
3. **Project Settings → API** : copie **Project URL** et la clé **anon public**.
4. Colle-les dans `js/config.js` :
   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJ...";
   ```
   La clé *anon* est faite pour être publique ; ce sont les règles RLS du script SQL qui protègent tes données. **Ne mets jamais la clé `service_role`.**
5. **Authentication → Providers → Email** : garde « Email » activé. Pour aller vite, tu peux désactiver « Confirm email » ; sinon tu cliqueras une fois sur le lien de confirmation reçu.
6. **Authentication → URL Configuration** : mets ton adresse GitHub Pages (étape 3) dans **Site URL** (pour le « lien magique »).
7. Sur le site : **Compte** (en bas à gauche) → entre ton email + un mot de passe → **Créer le compte**, puis **Se connecter**. Ta progression est envoyée automatiquement ; sur un autre appareil, connecte-toi et elle apparaît.

## 3. Publier sur GitHub Pages

1. Crée un dépôt GitHub (ex. `revisions-l1`), public ou privé (Pages sur dépôt privé demande un plan payant : reste en public, le contenu n'a rien de sensible — la progression, elle, est dans Supabase/ton navigateur).
2. Envoie **tout le contenu de ce dossier** à la racine du dépôt :
   ```bash
   git init && git add . && git commit -m "Site de révisions"
   git branch -M main
   git remote add origin https://github.com/TON-COMPTE/revisions-l1.git
   git push -u origin main
   ```
   (ou glisse-dépose les fichiers via « Add file → Upload files » sur github.com).
3. Dépôt → **Settings → Pages** → *Build and deployment* : Source **Deploy from a branch**, branche **main**, dossier **/ (root)** → Save.
4. Après ~1 minute, le site est en ligne sur `https://TON-COMPTE.github.io/revisions-l1/`.

## 4. Mettre à jour le contenu

Chaque matière est un fichier `data/content/<matiere>.json` (QCM, flashcards, exercices) + un dossier `data/content/<matiere>/` (une page HTML par séance). Les PDF sont dans `pdf/`. Le calendrier est `data/calendrier.json` (dates des CC) : modifie-le quand une date est confirmée (Bas, Devenir étudiant, Algo CC2).
Pousse le changement sur GitHub : le site se met à jour tout seul.

## Structure

```
index.html            page unique (navigation par #/…)
css/style.css         thème clair/sombre, mobile
js/app.js             vues et logique (QCM, éval, cartes, calendrier…)
js/store.js           progression locale + synchro Supabase
js/grades.js          formules de calcul des notes de chaque UE
js/config.js          URL + clé Supabase (à remplir, facultatif)
data/                 matières, calendrier, contenu
pdf/                  fiches PDF originales
vendor/               KaTeX (formules) et supabase-js (embarqués, pas de CDN)
supabase/setup.sql    table + règles de sécurité
```

## Notes sur les données

- Les deux dates de Bas (3/11 et 8/12) ne sont pas encore rattachées à un CCI précis ; la date de CC2 d'Algo (19/11) est annoncée mais non confirmée dans la fiche MCCC. Le site les marque « à confirmer / provisoire ».
- Science du numérique : un seul CM pour l'instant (CM 2 à 6 à venir).
- Devenir étudiant : le TD 2 n'a pas de contenu exploitable.
