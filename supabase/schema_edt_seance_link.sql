-- Lie chaque créneau d'EDT à sa séance par une clé étrangère (edt_events.sid). Rejouable.
-- À exécuter après schema_matieres.sql.

-- Colonne du lien vers la séance.
alter table public.edt_events add column if not exists sid text;

-- Rattache les créneaux existants à la séance de même matière, type et date (la plus petite en cas de doublon).
update public.edt_events e
set sid = sub.sid
from (
  select e2.user_id, e2.id as edt_id,
         (select s.id from public.seances s
          where s.user_id = e2.user_id and s.mid = e2.m and s.date = e2.d
            and s.type = case e2.t when 'Cours' then 'CM' when 'TD' then 'TD' when 'TP' then 'TP' else null end
          order by s.numero asc limit 1) as sid
  from public.edt_events e2
  where e2.m is not null and e2.t in ('Cours','TD','TP') and e2.sid is null
) sub
where e.id = sub.edt_id and e.user_id = sub.user_id and sub.sid is not null;

-- Clé étrangère créneau -> séance.
alter table public.edt_events drop constraint if exists edt_events_sid_fkey;
alter table public.edt_events add constraint edt_events_sid_fkey foreign key (user_id, m, sid) references public.seances(user_id, mid, id);

-- Même clé pour les documents de séance. NOT VALID garde les anciennes lignes orphelines mais contrôle les nouvelles.
alter table public.seance_docs drop constraint if exists seance_docs_sid_fkey;
alter table public.seance_docs add constraint seance_docs_sid_fkey foreign key (user_id, mid, sid) references public.seances(user_id, mid, id) not valid;
