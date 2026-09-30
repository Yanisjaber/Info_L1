-- ============================================================
--  Espace de travail par séance : documents déposés (PDF, photos de slides…) et notes
--  personnelles libres, pour les séances sans fiche de cours rédigée (ou en plus de celle-ci).
--  À coller dans SQL Editor (après schema_matieres.sql), puis « Run ».
-- ============================================================

-- Bucket de stockage privé (pas d'accès public direct — RLS ci-dessous par utilisateur).
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;

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
alter table public.seance_docs enable row level security;
-- Notes manuscrites : données vectorielles (traits rejouables) en plus du PNG aplati stocké dans
-- Storage (le PNG reste la version "aperçu/export" ; `strokes` permet de rouvrir une page pour la
-- modifier trait par trait, sans jamais recharger l'image). Colonnes ajoutées après coup, sans
-- effet si déjà présentes.
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

-- Fichiers rangés sous <user_id>/<mid>/<sid>/<nom> dans le bucket "docs" : chacun ne peut
-- voir/déposer/modifier/effacer que ses propres fichiers (premier dossier du chemin = son
-- user_id). La policy update est nécessaire même pour un simple upload avec { upsert: true } :
-- Supabase Storage fait un vrai UPDATE en interne quand l'objet existe déjà.
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
