-- Table unique items qui remplace qcm_items, flashcards et exercices (colonne kind : qcm, carte ou exercice).
-- Création rejouable ; la migration finale ne s'applique qu'une fois. À exécuter après schema_matieres.sql.

create table if not exists public.items (
  user_id      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id           uuid        not null default gen_random_uuid(),
  kind         text        not null check (kind in ('qcm','carte','exercice')),
  mid          text        not null,
  sid          text,
  -- Sous-type du QCM (unique, multiple) ou de l'exercice (redaction, code, texte) ; vide pour une carte.
  type         text,
  -- QCM
  q            text,
  choix        jsonb,
  rep          jsonb,
  expl         text,
  niveau       int,
  -- Carte
  recto        text,
  verso        text,
  -- Exercice
  titre        text,
  difficulte   int,
  enonce       text,
  indice       text,
  corrige      text,
  code_starter text,
  code_tests   text,
  reponse      text,
  reponses     text[],
  created_at   timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, mid) references public.matieres(user_id, id) on delete cascade,
  foreign key (user_id, mid, sid) references public.seances(user_id, mid, id)
);
-- Le sous-type doit correspondre à la nature : QCM unique ou multiple, exercice redaction, code ou texte, carte sans type.
alter table public.items drop constraint if exists items_type_check;
alter table public.items add constraint items_type_check check (
  (kind = 'qcm' and type in ('unique','multiple'))
  or (kind = 'exercice' and type in ('redaction','code','texte'))
  or (kind = 'carte' and type is null)
);

-- Sécurité : chaque utilisateur n'accède qu'à ses propres lignes.
alter table public.items enable row level security;

drop policy if exists "items_select_own" on public.items;
drop policy if exists "items_insert_own" on public.items;
drop policy if exists "items_update_own" on public.items;
drop policy if exists "items_delete_own" on public.items;
create policy "items_select_own" on public.items for select to authenticated using (auth.uid() = user_id);
create policy "items_insert_own" on public.items for insert to authenticated with check (auth.uid() = user_id);
create policy "items_update_own" on public.items for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "items_delete_own" on public.items for delete to authenticated using (auth.uid() = user_id);

-- Aucun accès anonyme.
revoke all on public.items from anon;
grant select, insert, update, delete on public.items to authenticated;

-- Copie une fois les anciennes tables dans items, puis les renomme en *_old (gardées par sécurité).
-- Sans effet si elles n'existent plus.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='qcm_items') then
    insert into public.items (user_id,id,kind,mid,sid,type,q,choix,rep,expl,niveau,created_at)
      select user_id,id,'qcm',matiere,seance,type,q,choix,rep,expl,niveau,created_at from public.qcm_items;
    alter table public.qcm_items rename to qcm_items_old;
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='flashcards') then
    insert into public.items (user_id,id,kind,mid,sid,recto,verso,created_at)
      select user_id,id,'carte',matiere,seance,recto,verso,created_at from public.flashcards;
    alter table public.flashcards rename to flashcards_old;
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='exercices') then
    insert into public.items (user_id,id,kind,mid,sid,titre,difficulte,enonce,indice,corrige,type,code_starter,code_tests,reponse,reponses,created_at)
      select user_id,id,'exercice',matiere,seance,titre,difficulte,enonce,indice,corrige,type,code_starter,code_tests,reponse,reponses,created_at from public.exercices;
    alter table public.exercices rename to exercices_old;
  end if;
end $$;
