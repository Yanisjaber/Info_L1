-- Un CC devient un drapeau (cc) sur un créneau de cours, au lieu d'un type d'EDT. Rejouable.
-- À exécuter après schema_matieres.sql.

alter table public.edt_events add column if not exists cc boolean not null default false;

-- Convertit les anciens créneaux de type CC en cours marqués cc.
update public.edt_events set t = 'Cours', cc = true where t = 'CC';

-- Lie une échéance de CC au créneau d'EDT qui la contient (sa date suit celle du créneau).
alter table public.cc_events add column if not exists edt_id uuid;
alter table public.cc_events drop constraint if exists cc_events_edt_id_fkey;
alter table public.cc_events add constraint cc_events_edt_id_fkey foreign key (user_id, edt_id) references public.edt_events(user_id, id) on delete set null;

-- Séances couvertes par le contrôle.
alter table public.cc_events add column if not exists seances text[] not null default '{}';
