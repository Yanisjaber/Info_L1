-- Lie une échéance de CC à son épreuve dans le calculateur de notes (identifiant de l'épreuve, ex. 'c2'). Rejouable.
-- À exécuter après schema_matieres.sql et schema_grading.sql.
-- Aucune clé étrangère : l'épreuve vit dans le JSON matieres.grading, pas dans une table. Si l'épreuve disparaît,
-- l'échéance reste, simplement sans lien (l'application le gère).

alter table public.cc_events add column if not exists epreuve text;
