-- Résultats par item (QCM, cartes, exercices) et historique des éval blanches, dans de vraies tables.
-- Les deux tables sont ensuite fusionnées par schema_results_merge.sql. Création rejouable ; à exécuter après schema_items.sql.

-- Une ligne par éval blanche.
create table if not exists public.evals (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         uuid        not null default gen_random_uuid(),
  mid        text        not null,
  n          int         not null default 0,
  ok         int         not null default 0,
  score20    numeric     not null default 0,
  dur        int         not null default 0,
  seances    jsonb       not null default '{}'::jsonb,
  items      jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, mid) references public.matieres(user_id, id) on delete cascade
);

-- Dernier résultat de chaque item. Supprimer une éval supprime en cascade les résultats qui y sont liés.
create table if not exists public.results (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  item_id    uuid        not null,
  kind       text        not null check (kind in ('qcm','carte','exercice')),
  eval_id    uuid,
  -- QCM
  n          int,
  ok         int,
  last       boolean,
  -- Carte
  box        int,
  due        timestamptz,
  -- Exercice
  mark       text check (mark in ('ok','redo')),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  foreign key (user_id, item_id) references public.items(user_id, id) on delete cascade,
  foreign key (user_id, eval_id) references public.evals(user_id, id) on delete cascade
);

-- Sécurité : accès limité aux lignes de l'utilisateur.
alter table public.evals   enable row level security;
alter table public.results enable row level security;

drop policy if exists "evals_select_own" on public.evals;
drop policy if exists "evals_insert_own" on public.evals;
drop policy if exists "evals_update_own" on public.evals;
drop policy if exists "evals_delete_own" on public.evals;
create policy "evals_select_own" on public.evals for select to authenticated using (auth.uid() = user_id);
create policy "evals_insert_own" on public.evals for insert to authenticated with check (auth.uid() = user_id);
create policy "evals_update_own" on public.evals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "evals_delete_own" on public.evals for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "results_select_own" on public.results;
drop policy if exists "results_insert_own" on public.results;
drop policy if exists "results_update_own" on public.results;
drop policy if exists "results_delete_own" on public.results;
create policy "results_select_own" on public.results for select to authenticated using (auth.uid() = user_id);
create policy "results_insert_own" on public.results for insert to authenticated with check (auth.uid() = user_id);
create policy "results_update_own" on public.results for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "results_delete_own" on public.results for delete to authenticated using (auth.uid() = user_id);

-- Aucun accès anonyme.
revoke all on public.evals   from anon;
revoke all on public.results from anon;
grant select, insert, update, delete on public.evals   to authenticated;
grant select, insert, update, delete on public.results to authenticated;

-- Migration unique des anciens résultats stockés dans progress (clés qcm, cards, exos, evals).
-- Ignore les entrées sans item correspondant et les clés qui ne sont pas des uuid.
-- Ne s'exécute que si results et evals sont vides.
do $$
begin
  if not exists (select 1 from public.results) and not exists (select 1 from public.evals) then

    -- Les CTE materialized garantissent que le filtre uuid passe avant le cast ::uuid.
    with valid_qcm as materialized (
      select p.user_id, kv.key as item_id, kv.value
      from public.progress p cross join lateral jsonb_each(p.value) kv
      where p.key = 'qcm' and kv.key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )
    insert into public.results (user_id, item_id, kind, n, ok, last, updated_at)
      select v.user_id, v.item_id::uuid, 'qcm',
             coalesce((v.value->>'n')::int, 0), coalesce((v.value->>'ok')::int, 0), coalesce((v.value->>'last')::boolean, false),
             to_timestamp(coalesce((v.value->>'ts')::bigint, 0) / 1000.0)
      from valid_qcm v
      where exists (select 1 from public.items i where i.user_id = v.user_id and i.id = v.item_id::uuid);

    with valid_cards as materialized (
      select p.user_id, kv.key as item_id, kv.value
      from public.progress p cross join lateral jsonb_each(p.value) kv
      where p.key = 'cards' and kv.key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )
    insert into public.results (user_id, item_id, kind, box, n, ok, due, updated_at)
      select v.user_id, v.item_id::uuid, 'carte',
             coalesce((v.value->>'box')::int, 0), coalesce((v.value->>'n')::int, 0), coalesce((v.value->>'ok')::int, 0),
             to_timestamp(coalesce((v.value->>'due')::bigint, 0) / 1000.0), to_timestamp(coalesce((v.value->>'ts')::bigint, 0) / 1000.0)
      from valid_cards v
      where exists (select 1 from public.items i where i.user_id = v.user_id and i.id = v.item_id::uuid);

    with valid_exos as materialized (
      select p.user_id, kv.key as item_id, kv.value
      from public.progress p cross join lateral jsonb_each(p.value) kv
      where p.key = 'exos' and kv.key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )
    insert into public.results (user_id, item_id, kind, mark, updated_at)
      select v.user_id, v.item_id::uuid, 'exercice', v.value->>'v', to_timestamp(coalesce((v.value->>'ts')::bigint, 0) / 1000.0)
      from valid_exos v
      where (v.value->>'v') in ('ok','redo') and exists (select 1 from public.items i where i.user_id = v.user_id and i.id = v.item_id::uuid);

    insert into public.evals (user_id, id, mid, n, ok, score20, dur, seances, items, created_at)
      select p.user_id, gen_random_uuid(), kv.value->>'mid',
             coalesce((kv.value->>'n')::int, 0), coalesce((kv.value->>'ok')::int, 0), coalesce((kv.value->>'score20')::numeric, 0), coalesce((kv.value->>'dur')::int, 0),
             coalesce(kv.value->'seances', '{}'::jsonb), coalesce(kv.value->'items', '[]'::jsonb), to_timestamp(coalesce((kv.value->>'ts')::bigint, 0) / 1000.0)
      from public.progress p cross join lateral jsonb_each(p.value) kv
      where p.key = 'evals' and exists (select 1 from public.matieres m where m.user_id = p.user_id and m.id = kv.value->>'mid');

    delete from public.progress where key in ('qcm','cards','exos','evals');

  end if;
end $$;
