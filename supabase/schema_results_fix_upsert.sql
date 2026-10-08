-- Corrige l'enregistrement des résultats : l'upsert (ON CONFLICT user_id, item_id) échouait sur l'index unique partiel.
-- Un index unique complet suffit : les évals ont item_id NULL et n'entrent jamais en conflit. Rejouable.

drop index if exists public.results_item_uniq;
create unique index if not exists results_item_uniq on public.results(user_id, item_id);
