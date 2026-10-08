-- To-do list : tâche libre avec date d'échéance, à cocher. Rejouable. À exécuter après schema_matieres.sql.

create table if not exists public.todos (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         uuid        not null default gen_random_uuid(),
  texte      text        not null default '',
  date       date        not null,
  done       boolean     not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
-- Sécurité : chaque utilisateur n'accède qu'à ses propres tâches.
alter table public.todos enable row level security;

drop policy if exists "todos_select_own" on public.todos;
drop policy if exists "todos_insert_own" on public.todos;
drop policy if exists "todos_update_own" on public.todos;
drop policy if exists "todos_delete_own" on public.todos;
create policy "todos_select_own" on public.todos for select to authenticated using (auth.uid() = user_id);
create policy "todos_insert_own" on public.todos for insert to authenticated with check (auth.uid() = user_id);
create policy "todos_update_own" on public.todos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todos_delete_own" on public.todos for delete to authenticated using (auth.uid() = user_id);

-- Aucun accès anonyme.
revoke all on public.todos from anon;
grant select, insert, update, delete on public.todos to authenticated;
