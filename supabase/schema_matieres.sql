-- ============================================================
--  Révisions L1 — matières & séances (contenu des cours), par utilisateur
--  À coller dans SQL Editor (après setup.sql), puis « Run ».
--  Chaque utilisateur a ses propres matières et séances ; RLS garantit
--  que personne ne voit les données d'un autre compte.
-- ============================================================

-- Périodes (semestre, année...) : permet de suivre plusieurs semestres/niveaux dans le
-- temps sans que tout s'accumule dans un seul menu. Une matière rattachée à une période
-- « terminée » sort du menu principal mais reste consultable depuis les archives.
create table if not exists public.periodes (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,
  nom        text        not null default '',
  statut     text        not null default 'actif' check (statut in ('actif','termine')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.matieres (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,
  nom        text        not null default '',
  court      text        not null default '',
  ue         text        not null default '',
  couleur    text        not null default '#1F3A5F',
  description text       not null default '',
  cc         text        not null default '',
  pdf_cc     text,
  ects       int         not null default 0 check (ects >= 0),
  periode    text,
  eval       jsonb       not null default '{"n":15,"minutes":15}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
-- Colonnes ajoutées après la création initiale de la table : sans effet si déjà présentes.
alter table public.matieres add column if not exists ects int not null default 0 check (ects >= 0);
alter table public.matieres add column if not exists periode text;
alter table public.matieres drop constraint if exists matieres_periode_fkey;
-- Pas de "on delete set null" ici : sur une clé composée (user_id, periode), Postgres
-- mettrait aussi user_id à NULL, ce qui viole sa contrainte NOT NULL. On détache donc les
-- matières manuellement (UPDATE periode = NULL) avant de supprimer une période, côté code.
alter table public.matieres add constraint matieres_periode_fkey foreign key (user_id, periode) references public.periodes(user_id, id);

create table if not exists public.seances (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  mid        text        not null,
  id         text        not null,
  type       text        not null default 'CM' check (type in ('CM','TD','TP')),
  numero     int         not null default 1,
  date       date,
  titre      text        not null default '',
  resume     text        not null default '',
  contenu    text        not null default '',
  pdf_url    text,
  created_at timestamptz not null default now(),
  primary key (user_id, mid, id),
  foreign key (user_id, mid) references public.matieres(user_id, id) on delete cascade
);

-- QCM, cartes (flashcards) et exercices : entraînement par matière, par utilisateur.
create table if not exists public.qcm_items (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         uuid        not null default gen_random_uuid(),
  matiere    text        not null,
  seance     text,
  type       text        not null default 'unique' check (type in ('unique','multiple')),
  q          text        not null default '',
  choix      jsonb       not null default '[]'::jsonb,
  rep        jsonb       not null default '[]'::jsonb,
  expl       text        not null default '',
  niveau     int         not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, matiere) references public.matieres(user_id, id) on delete cascade
);

create table if not exists public.flashcards (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         uuid        not null default gen_random_uuid(),
  matiere    text        not null,
  seance     text,
  recto      text        not null default '',
  verso      text        not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, matiere) references public.matieres(user_id, id) on delete cascade
);

create table if not exists public.exercices (
  user_id      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id           uuid        not null default gen_random_uuid(),
  matiere      text        not null,
  seance       text,
  titre        text        not null default '',
  difficulte   int         not null default 1,
  enonce       text        not null default '',
  indice       text        not null default '',
  corrige      text        not null default '',
  type         text        not null default 'redaction' check (type in ('redaction','code','texte')),
  code_starter text        not null default '',
  code_tests   text        not null default '',
  reponse      text        not null default '',
  created_at   timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, matiere) references public.matieres(user_id, id) on delete cascade
);
-- Colonnes ajoutées après la création initiale : sans effet si déjà présentes.
alter table public.exercices add column if not exists type text not null default 'redaction';
alter table public.exercices drop constraint if exists exercices_type_check;
alter table public.exercices add constraint exercices_type_check check (type in ('redaction','code','texte'));
alter table public.exercices add column if not exists code_starter text not null default '';
alter table public.exercices add column if not exists code_tests text not null default '';
-- « texte » : exercice à réponse courte, corrigé automatiquement par comparaison à `reponse`
-- (plusieurs formes acceptées possibles, séparées par « | », ex. « 6|6.0|six »).
alter table public.exercices add column if not exists reponse text not null default '';

-- Calendrier des CC (contrôles continus, examens), par utilisateur.
create table if not exists public.cc_events (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         uuid        not null default gen_random_uuid(),
  matiere    text        not null,
  titre      text        not null default '',
  date       date        not null,
  poids      text        not null default '',
  type       text        not null default 'CC',
  statut     text        not null default '',
  detail     text        not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, matiere) references public.matieres(user_id, id) on delete cascade
);

create table if not exists public.edt_events (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         uuid        not null default gen_random_uuid(),
  d          date        not null,
  s          time        not null,
  e          time        not null,
  t          text        not null default 'Cours',
  m          text,
  r          text,
  p          text,
  g          text,
  n          text,
  allday     boolean     not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint edt_events_m_fkey foreign key (user_id, m) references public.matieres(user_id, id)
);
-- Idem que pour matieres.periode : pas de "on delete set null" possible proprement sur une
-- clé composée (cf. plus haut) ; on corrige la contrainte si la table existait déjà avec
-- l'ancienne version (nom auto-généré par Postgres pour une FK inline non nommée).
alter table public.edt_events drop constraint if exists edt_events_user_id_m_fkey;
alter table public.edt_events drop constraint if exists edt_events_m_fkey;
alter table public.edt_events add constraint edt_events_m_fkey foreign key (user_id, m) references public.matieres(user_id, id);

alter table public.periodes  enable row level security;
alter table public.matieres  enable row level security;
alter table public.seances   enable row level security;
alter table public.edt_events enable row level security;
alter table public.cc_events enable row level security;
alter table public.qcm_items enable row level security;
alter table public.flashcards enable row level security;
alter table public.exercices enable row level security;

drop policy if exists "periodes_select_own" on public.periodes;
drop policy if exists "periodes_insert_own" on public.periodes;
drop policy if exists "periodes_update_own" on public.periodes;
drop policy if exists "periodes_delete_own" on public.periodes;
create policy "periodes_select_own" on public.periodes for select to authenticated using (auth.uid() = user_id);
create policy "periodes_insert_own" on public.periodes for insert to authenticated with check (auth.uid() = user_id);
create policy "periodes_update_own" on public.periodes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "periodes_delete_own" on public.periodes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "matieres_select_own" on public.matieres;
drop policy if exists "matieres_insert_own" on public.matieres;
drop policy if exists "matieres_update_own" on public.matieres;
drop policy if exists "matieres_delete_own" on public.matieres;
create policy "matieres_select_own" on public.matieres for select to authenticated using (auth.uid() = user_id);
create policy "matieres_insert_own" on public.matieres for insert to authenticated with check (auth.uid() = user_id);
create policy "matieres_update_own" on public.matieres for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "matieres_delete_own" on public.matieres for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "seances_select_own" on public.seances;
drop policy if exists "seances_insert_own" on public.seances;
drop policy if exists "seances_update_own" on public.seances;
drop policy if exists "seances_delete_own" on public.seances;
create policy "seances_select_own" on public.seances for select to authenticated using (auth.uid() = user_id);
create policy "seances_insert_own" on public.seances for insert to authenticated with check (auth.uid() = user_id);
create policy "seances_update_own" on public.seances for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seances_delete_own" on public.seances for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "edt_select_own" on public.edt_events;
drop policy if exists "edt_insert_own" on public.edt_events;
drop policy if exists "edt_update_own" on public.edt_events;
drop policy if exists "edt_delete_own" on public.edt_events;
create policy "edt_select_own" on public.edt_events for select to authenticated using (auth.uid() = user_id);
create policy "edt_insert_own" on public.edt_events for insert to authenticated with check (auth.uid() = user_id);
create policy "edt_update_own" on public.edt_events for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "edt_delete_own" on public.edt_events for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "cc_select_own" on public.cc_events;
drop policy if exists "cc_insert_own" on public.cc_events;
drop policy if exists "cc_update_own" on public.cc_events;
drop policy if exists "cc_delete_own" on public.cc_events;
create policy "cc_select_own" on public.cc_events for select to authenticated using (auth.uid() = user_id);
create policy "cc_insert_own" on public.cc_events for insert to authenticated with check (auth.uid() = user_id);
create policy "cc_update_own" on public.cc_events for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cc_delete_own" on public.cc_events for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "qcm_select_own" on public.qcm_items;
drop policy if exists "qcm_insert_own" on public.qcm_items;
drop policy if exists "qcm_update_own" on public.qcm_items;
drop policy if exists "qcm_delete_own" on public.qcm_items;
create policy "qcm_select_own" on public.qcm_items for select to authenticated using (auth.uid() = user_id);
create policy "qcm_insert_own" on public.qcm_items for insert to authenticated with check (auth.uid() = user_id);
create policy "qcm_update_own" on public.qcm_items for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "qcm_delete_own" on public.qcm_items for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "flashcards_select_own" on public.flashcards;
drop policy if exists "flashcards_insert_own" on public.flashcards;
drop policy if exists "flashcards_update_own" on public.flashcards;
drop policy if exists "flashcards_delete_own" on public.flashcards;
create policy "flashcards_select_own" on public.flashcards for select to authenticated using (auth.uid() = user_id);
create policy "flashcards_insert_own" on public.flashcards for insert to authenticated with check (auth.uid() = user_id);
create policy "flashcards_update_own" on public.flashcards for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "flashcards_delete_own" on public.flashcards for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "exercices_select_own" on public.exercices;
drop policy if exists "exercices_insert_own" on public.exercices;
drop policy if exists "exercices_update_own" on public.exercices;
drop policy if exists "exercices_delete_own" on public.exercices;
create policy "exercices_select_own" on public.exercices for select to authenticated using (auth.uid() = user_id);
create policy "exercices_insert_own" on public.exercices for insert to authenticated with check (auth.uid() = user_id);
create policy "exercices_update_own" on public.exercices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exercices_delete_own" on public.exercices for delete to authenticated using (auth.uid() = user_id);

revoke all on public.periodes  from anon;
revoke all on public.matieres  from anon;
revoke all on public.seances   from anon;
revoke all on public.edt_events from anon;
revoke all on public.cc_events from anon;
revoke all on public.qcm_items from anon;
revoke all on public.flashcards from anon;
revoke all on public.exercices from anon;
grant select, insert, update, delete on public.cc_events to authenticated;
grant select, insert, update, delete on public.periodes  to authenticated;
grant select, insert, update, delete on public.matieres  to authenticated;
grant select, insert, update, delete on public.seances   to authenticated;
grant select, insert, update, delete on public.edt_events to authenticated;
grant select, insert, update, delete on public.qcm_items to authenticated;
grant select, insert, update, delete on public.flashcards to authenticated;
grant select, insert, update, delete on public.exercices to authenticated;
