-- Documents et notes manuscrites déposés par séance, rangés dans le bucket privé "docs". Rejouable.
-- À exécuter après schema_matieres.sql.

-- Bucket privé : aucun accès public.
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;

-- Un document ou une note par ligne ; le fichier est dans le bucket (colonne path).
create table if not exists public.seance_docs (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         uuid        not null default gen_random_uuid(),
  mid        text        not null,
  sid        text        not null,
  nom        text        not null default '',
  path       text        not null,
  taille     bigint,
  type       text,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, mid) references public.matieres(user_id, id) on delete cascade
);
-- Sécurité : accès limité aux lignes de l'utilisateur.
alter table public.seance_docs enable row level security;
-- Notes manuscrites : traits rejouables (strokes) et fond de page (paper), en plus de l'image PNG.
alter table public.seance_docs add column if not exists strokes jsonb;
alter table public.seance_docs add column if not exists paper text;

drop policy if exists "seance_docs_select_own" on public.seance_docs;
drop policy if exists "seance_docs_insert_own" on public.seance_docs;
drop policy if exists "seance_docs_update_own" on public.seance_docs;
drop policy if exists "seance_docs_delete_own" on public.seance_docs;
create policy "seance_docs_select_own" on public.seance_docs for select to authenticated using (auth.uid() = user_id);
create policy "seance_docs_insert_own" on public.seance_docs for insert to authenticated with check (auth.uid() = user_id);
create policy "seance_docs_update_own" on public.seance_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seance_docs_delete_own" on public.seance_docs for delete to authenticated using (auth.uid() = user_id);

revoke all on public.seance_docs from anon;
grant select, insert, update, delete on public.seance_docs to authenticated;

-- Chacun n'accède qu'aux fichiers de son dossier <user_id>/… dans le bucket.
-- La règle update est nécessaire aussi pour un upload avec upsert.
drop policy if exists "docs_select_own" on storage.objects;
drop policy if exists "docs_insert_own" on storage.objects;
drop policy if exists "docs_update_own" on storage.objects;
drop policy if exists "docs_delete_own" on storage.objects;
create policy "docs_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
