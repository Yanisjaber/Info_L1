-- ============================================================
--  Lien explicite EDT ↔ séance : `edt_events.sid` remplace le matching heuristique
--  (même matière+type+date, voir seanceFor() dans js/app.js) par une vraie FK. Idem pour
--  seance_docs.sid, qui avait déjà la colonne mais pas la contrainte.
--  À coller dans SQL Editor après schema_matieres.sql. Idempotent.
-- ============================================================

alter table public.edt_events add column if not exists sid text;

-- Backfill des créneaux existants : pour chaque créneau Cours/TD/TP, cherche la séance de
-- même matière+type+date (numero le plus bas en cas d'ambiguïté — approximation raisonnable
-- pour une migration ponctuelle, un lien incorrect se corrige en rouvrant le créneau).
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

alter table public.edt_events drop constraint if exists edt_events_sid_fkey;
alter table public.edt_events add constraint edt_events_sid_fkey foreign key (user_id, m, sid) references public.seances(user_id, mid, id);

-- seance_docs avait déjà sid/mid mais aucune contrainte. Ajoutée NOT VALID : une note manuscrite
-- existante pointe vers une séance depuis supprimée (orphelin réel, pas une erreur de migration) —
-- NOT VALID n'empêche ni ne supprime cette ligne, mais valide toute nouvelle écriture désormais.
alter table public.seance_docs drop constraint if exists seance_docs_sid_fkey;
alter table public.seance_docs add constraint seance_docs_sid_fkey foreign key (user_id, mid, sid) references public.seances(user_id, mid, id) not valid;
