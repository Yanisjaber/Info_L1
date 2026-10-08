-- Plusieurs réponses attendues par exercice texte (une par sous-question). Rejouable.
-- L'ancienne colonne reponse reste lue en repli quand reponses est vide.

alter table public.exercices add column if not exists reponses text[];
