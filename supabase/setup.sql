-- ============================================================
--  Révisions L1 — schéma Supabase (à coller dans SQL Editor, puis « Run »)
--  Une seule table : ta progression (QCM, cartes, notes…) par utilisateur.
--  La sécurité par ligne (RLS) garantit que chacun ne voit QUE ses lignes,
--  même si la clé « anon » du site est publique.
-- ============================================================

create table if not exists public.progress (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  key        text        not null,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.progress enable row level security;

drop policy if exists "progress_select_own" on public.progress;
drop policy if exists "progress_insert_own" on public.progress;
drop policy if exists "progress_update_own" on public.progress;
drop policy if exists "progress_delete_own" on public.progress;

create policy "progress_select_own" on public.progress for select to authenticated using (auth.uid() = user_id);
create policy "progress_insert_own" on public.progress for insert to authenticated with check (auth.uid() = user_id);
create policy "progress_update_own" on public.progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "progress_delete_own" on public.progress for delete to authenticated using (auth.uid() = user_id);

-- Les utilisateurs non connectés n'ont aucun accès :
revoke all on public.progress from anon;
grant select, insert, update, delete on public.progress to authenticated;
