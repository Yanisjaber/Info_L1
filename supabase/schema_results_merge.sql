-- ============================================================
--  Fusion de `results` + `evals` en une seule table `results` (kind='qcm'/'carte'/
--  'exercice'/'eval') — même logique que la fusion qcm_items/flashcards/exercices → items.
--  Un eval est maintenant juste une ligne `results` de plus (item_id null, mid renseigné,
--  score20/dur/seances/items renseignés) ; `eval_id` référence désormais cette même table
--  (auto-référence) — supprimer la ligne eval cascade automatiquement sur les résultats
--  d'exercice encore liés, dans une seule table au lieu de deux.
--  À exécuter après schema_results.sql (qui a créé les tables `results`/`evals` d'origine).
--  Idempotent : si `results_old`/`evals_old` existent déjà (déjà exécuté), ne fait rien.
-- ============================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='evals')
     and not exists (select 1 from information_schema.tables where table_schema='public' and table_name='results_old') then

    alter table public.results rename to results_old;
    alter table public.evals rename to evals_old;

    create table public.results (
      user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
      id         uuid        not null default gen_random_uuid(),
      kind       text        not null check (kind in ('qcm','carte','exercice','eval')),
      item_id    uuid,
      eval_id    uuid,
      mid        text,
      -- QCM (+ n/ok réutilisés par 'eval' : nombre d'exercices / nombre réussis de la session)
      n          int,
      ok         int,
      last       boolean,
      -- Carte (flashcard)
      box        int,
      due        timestamptz,
      -- Exercice
      mark       text check (mark in ('ok','redo')),
      -- Eval (score de session)
      score20    numeric,
      dur        int,
      seances    jsonb,
      items      jsonb,
      updated_at timestamptz not null default now(),
      primary key (user_id, id),
      foreign key (user_id, item_id) references public.items(user_id, id) on delete cascade,
      foreign key (user_id, eval_id) references public.results(user_id, id) on delete cascade,
      foreign key (user_id, mid) references public.matieres(user_id, id) on delete cascade
    );
    create unique index results_item_uniq on public.results(user_id, item_id) where item_id is not null;

    -- Les lignes eval gardent leur id d'origine (evals_old.id) : les eval_id déjà posés sur
    -- results_old restent valides tels quels, aucune remise à jour nécessaire.
    insert into public.results (user_id, id, kind, mid, n, ok, score20, dur, seances, items, updated_at)
      select user_id, id, 'eval', mid, n, ok, score20, dur, seances, items, created_at from public.evals_old;

    insert into public.results (user_id, id, kind, item_id, eval_id, n, ok, last, updated_at)
      select user_id, gen_random_uuid(), 'qcm', item_id, eval_id, n, ok, last, updated_at from public.results_old where kind = 'qcm';
    insert into public.results (user_id, id, kind, item_id, eval_id, box, n, ok, due, updated_at)
      select user_id, gen_random_uuid(), 'carte', item_id, eval_id, box, n, ok, due, updated_at from public.results_old where kind = 'carte';
    insert into public.results (user_id, id, kind, item_id, eval_id, mark, updated_at)
      select user_id, gen_random_uuid(), 'exercice', item_id, eval_id, mark, updated_at from public.results_old where kind = 'exercice';

    alter table public.results enable row level security;
    create policy "results_select_own" on public.results for select to authenticated using (auth.uid() = user_id);
    create policy "results_insert_own" on public.results for insert to authenticated with check (auth.uid() = user_id);
    create policy "results_update_own" on public.results for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy "results_delete_own" on public.results for delete to authenticated using (auth.uid() = user_id);
    revoke all on public.results from anon;
    grant select, insert, update, delete on public.results to authenticated;

  end if;
end $$;
