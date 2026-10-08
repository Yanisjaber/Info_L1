-- ============================================================
--  Fix régression de la fusion results (schema_results_merge.sql, 2026-10-07) : l'upsert
--  PostgREST de saveResult() envoie `ON CONFLICT (user_id,item_id) DO UPDATE` sans clause WHERE,
--  mais results_item_uniq est un index UNIQUE PARTIEL (`WHERE item_id IS NOT NULL`) — Postgres
--  n'autorise l'inférence ON CONFLICT sur un index partiel que si la clause ON CONFLICT répète
--  elle-même le WHERE, ce que PostgREST ne sait pas générer. Résultat en prod depuis hier : TOUT
--  upsert qcm/carte/exercice échouait avec "no unique or exclusion constraint matching the ON
--  CONFLICT specification" — plus aucune réponse QCM/carte/exercice ne se sauvegardait,
--  silencieusement (saveResult throw, avalé par le .catch(toast) de recordQ/autoMark/etc.).
--  Le WHERE partiel n'était de toute façon pas nécessaire : un index unique NON partiel sur
--  (user_id, item_id) laisse déjà passer plusieurs lignes 'eval' à item_id NULL sans conflit,
--  NULL n'étant jamais égal à NULL pour l'unicité — donc le simplifier en index plein résout le
--  problème sans rien changer au comportement des lignes eval.
--  Idempotent.
-- ============================================================
drop index if exists public.results_item_uniq;
create unique index if not exists results_item_uniq on public.results(user_id, item_id);
