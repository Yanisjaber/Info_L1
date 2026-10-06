-- ============================================================
--  Un exercice "texte" n'avait qu'une seule réponse attendue (`reponse`) même quand l'énoncé posait
--  plusieurs sous-questions — en pratique une seule était vérifiable, les autres restaient non
--  validables, ce qui bloquait la progression Elo sur ces exercices. `reponses` (tableau, une
--  entrée par sous-question) remplace ça ; `reponse` reste en lecture seule pour les exercices
--  jamais réédités depuis (l'appli y retombe si `reponses` est vide — aucune migration nécessaire).
--  Idempotent — sûr à rejouer. À coller dans SQL Editor après schema_matieres.sql.
-- ============================================================

alter table public.exercices add column if not exists reponses text[];
