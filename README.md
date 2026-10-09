# Révisions L1 Informatique — Semestre 1

Site de révision (cours réécrits, QCM avec correction, éval blanche chronométrée, flashcards à répétition espacée,
exercices corrigés, calendrier des CC, calculateur de notes, recherche). Statique : aucun serveur à gérer.

- **6 matières** : Algorithmique 1, Bas, Devenir étudiant, Math1-bases2, Math1-calc1, Science du numérique
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
4. Colle-les dans `src/core/config.js` :
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

Le contenu (matières, séances, QCM, flashcards, exercices, emploi du temps, échéances de CC) vit dans Supabase : tout se modifie depuis le site (Compte, pages d'administration, import .ics de l'EDT). Il n'y a plus de fichiers de données dans le dépôt. Les PDF et les images des cours sont dans ton stockage Supabase (voir section 7).

## 5. Calculateur de notes (configurable par matière)

La page « Notes & CC » n'a plus de formules écrites dans le code : chaque matière porte sa propre configuration (épreuves, poids, barème, note de 2e chance), stockée dans la colonne `grading` de la table `matieres`.

1. **Une fois**, dans Supabase → **SQL Editor**, exécute `supabase/schema_grading.sql`. Il ajoute la colonne et reprend les 6 formules du semestre (Algo 1, Bas, Math1-bases2, Math1-calc1, Science du numérique, Devenir étudiant). Tu peux le relancer sans risque : il ne remplace pas une configuration déjà saisie.
2. Pour une nouvelle matière : **Compte → la matière → « Calcul de la note »**. Une ligne par épreuve avec son poids, éventuellement « Note sur » (barème ≠ 20) et « Moyenne de » (plusieurs notes qui comptent pour une seule épreuve), puis le type de 2e chance : aucune, facultative (remplace une note plus faible) ou obligatoire (compte aussi dans la moyenne).

Tant que le script SQL n'est pas exécuté, le site fonctionne comme avant, mais sans calculateur.

## 6. Réglages par utilisateur (rien d'institutionnel dans le code)

Tout ce qui change d'un utilisateur, d'un établissement ou d'un cursus à l'autre est stocké dans la table `user_settings` (une ligne par compte) et s'édite dans **Compte → Réglages** : types de séance (CM/TD/TP ou autres, avec leur libellé), types de créneau de l'emploi du temps et correspondance avec les types de séance, règles de détection de l'import .ics (mots-clés → type, motif d'un CC/examen), note de validation et son libellé, texte sous l'emploi du temps, préfixe des fichiers exportés.

1. **Une fois**, dans Supabase → **SQL Editor**, exécute `supabase/schema_settings.sql`. Il crée la table (avec ses règles de sécurité), retire la limite « CM, TD ou TP » sur les séances, et reprend pour les comptes existants les valeurs qui étaient auparavant écrites dans le code. Relançable sans risque.
2. Un nouveau compte (ou tant que le script n'est pas exécuté) utilise des valeurs de repli neutres définies dans `src/features/settings/settings.defaults.js` : CM/TD/TP, note de validation 10, aucun nom d'établissement.

Ce qui reste dans le code est propre à l'application, pas à l'utilisateur : barème des niveaux Elo, couleurs du thème, seuils de l'interface, clés de stockage local.

## 7. Fichiers (PDF, images) dans le stockage Supabase

Les PDF de séance, les fiches CC et les images des cours ne vivent plus dans le dépôt : ils sont envoyés dans ton espace privé Supabase (bucket `docs`, dossier à ton `user_id`, mêmes règles de sécurité que tes documents de séance, donc aucun script SQL à lancer). En base, un fichier est référencé par `storage:files/<dossier>/<nom>` et affiché via une URL signée (valable 7 jours, renouvelée à chaque chargement).

- **Ajouter un PDF** : champ « PDF » du formulaire d'une séance ou d'une matière. **Remplacer / retirer** : nouveau fichier ou case « retirer » (l'ancien est supprimé du stockage).
- **Ajouter une image dans un cours** : bouton « Insérer une image » sous l'éditeur de la séance ; la balise `<img>` est insérée à l'endroit du curseur.
- **Ancien dépôt** : les anciens dossiers `pdf/` et `assets/` ont été migrés puis supprimés du dépôt (ils restent dans l'historique git). Si une vieille référence (`pdf/…`, `assets/…`) traîne en base, le fichier ne s'affichera plus : ré-uploade-le depuis le formulaire.

## 8. Bibliothèques externes (`vendor/`)

Code écrit par d'autres, copié tel quel dans le dépôt pour que le site marche sans dépendre d'un CDN. Les noms de dossiers sont ceux des bibliothèques : ne pas les renommer ni modifier leurs fichiers (elles retrouvent leurs polices et leurs fichiers internes par ces chemins).

| Dossier | Ce que c'est | Taille | Obligatoire ? |
|---|---|---|---|
| `vendor/katex/` | **KaTeX** : affiche les formules de maths (`\(A \cup B\)` devient la vraie notation). Utilisé dans les cours, QCM, cartes et exercices. | ~0,6 Mo | Oui en pratique : sans lui les formules s'affichent en texte brut. |
| `vendor/supabase.js` | Client **Supabase** : connexion au compte, lecture/écriture en base, stockage de fichiers. | ~0,2 Mo | Oui pour tout ce qui est synchronisé (en mode local, la progression reste dans le navigateur). |
| `vendor/pyodide/` | **Pyodide** : un Python complet compilé en WebAssembly (`pyodide.asm.js` + `pyodide.asm.wasm` = l'interpréteur, `pyodide.js` = le chargeur). Sert uniquement à exécuter le code des exercices de type « code ». Chargé seulement à la première exécution. | ~14 Mo | Non. Sans lui tout marche sauf l'exécution des exercices de code. À garder ou supprimer en entier, jamais en partie. |

## Structure

L'app est découpée **par fonctionnalité** (« Feature-Driven Architecture ») : chaque dossier de `src/features/` contient tout ce qui concerne un sujet (page, composants, calculs, accès Supabase, actions des boutons). Le code est le même que la version à fichier unique, juste rangé autrement : aucun changement de comportement.

```
index.html                    page unique (navigation par #/…), charge src/app.js
public/
  css/style.css               thème clair/sombre, mobile
  icons/                      icônes de l'app (icon-180.png = écran d'accueil du téléphone)
src/
  app.js                      point d'entrée : branche les actions puis démarre (boot)
  core/                       briques partagées par toutes les fonctionnalités
    config.js                 URL + clé Supabase
    utils/                    dom.js ($, esc…), format.js (dates, %), math.js (KaTeX)
    components/               icons, toast, dialog (confirmation), shell (menu + barre), date-picker, ring, tag…
    services/                 store.js (progression locale + synchro), supabase.client.js, app-data.js (données
                              en mémoire), data-loader.js (chargement), stats.js, theme.js, actions.js
                              (dispatch des clics data-a), items.service.js, results.service.js
  routing/                    router.js (route → page), navigation.js (rerender…), router.store.js
  features/
    auth/                     page Compte, connexion, export/import/effacement
    dashboard/                accueil
    matieres/                 liste, page matière, administration matières/périodes
    seances/                  page d'une séance (cours), administration d'une séance
    documents/                documents déposés + éditeur d'écriture manuscrite
    quiz/ flashcards/ eval/ exercices/    entraînement (page, session, composants, admin)
    elo/                      score de maîtrise + préparation d'un CC
    edt/                      emploi du temps, import .ics, créneaux
    calendar/                 calendrier des CC, échéances
    todos/ notes/ search/     to-do list, notes & calculateur (grades.js = moteur, grading-editor.js = éditeur), recherche
    files/                    PDF et images : envoi dans le stockage, URLs signées
    settings/                 réglages par utilisateur (chargement, éditeur, valeurs de repli, accesseurs)
    admin/                    utilitaires communs aux formulaires d'administration
vendor/                       bibliothèques externes embarquées : KaTeX, supabase-js, Pyodide (voir section 8)
supabase/                     scripts SQL (tables + règles de sécurité)
```

Convention de nommage dans un dossier de fonctionnalité : `*.page.js` (écran), `*.components.js` (morceaux d'interface), `*.utils.js` (calculs purs), `*.service.js` (accès Supabase), `*.session.js` (déroulé d'une session QCM / éval / cartes), `*.store.js` (état partagé modifiable), `*.actions.js` (ce que font les boutons `data-a="…"` de la fonctionnalité).

**Ajouter un bouton** : poser `data-a="monaction"` dans le HTML, puis déclarer `monaction: async (t, e) => { … }` dans la section `click` du `*.actions.js` de la fonctionnalité. **Ajouter une page** : créer son `*.page.js` et ajouter une ligne dans `src/routing/router.js`.

## Notes sur les données

- Les dates de Bas (3/11 et 8/12) sont confirmées par l'EDT mais pas encore rattachées à un numéro de CCI ; Algo CC2 (19/11) est confirmé par l'EDT.
- Science du numérique : un seul CM pour l'instant (CM 2 à 6 à venir).
- Devenir étudiant : le TD 2 n'a pas de contenu exploitable.
