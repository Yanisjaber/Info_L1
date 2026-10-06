-- ============================================================
--  Un CC n'est plus un type d'EDT à part : c'est un vrai créneau de cours
--  (Cours/TD/TP) qui contient en plus un contrôle continu. `cc` est juste un
--  drapeau sur ce créneau ; `t` redevient toujours un vrai type de cours pour
--  ceux qui en ont un. Migre les anciennes lignes t='CC' vers Cours+cc=true
--  (déduction par défaut la plus fréquente : le CC a lieu en amphi/CM).
--  Idempotent — sûr à rejouer. À coller dans SQL Editor après schema_matieres.sql.
-- ============================================================

alter table public.edt_events add column if not exists cc boolean not null default false;

update public.edt_events set t = 'Cours', cc = true where t = 'CC';

-- Lien explicite entre une échéance CC (cc_events, suivi de note) et le créneau EDT qui la
-- contient, au lieu de ne les rapprocher qu'en devinant par matière+date. Permet de garder les
-- deux coordonnés : déplacer/modifier le créneau EDT répercute la date sur l'échéance liée.
alter table public.cc_events add column if not exists edt_id uuid;
alter table public.cc_events drop constraint if exists cc_events_edt_id_fkey;
alter table public.cc_events add constraint cc_events_edt_id_fkey foreign key (user_id, edt_id) references public.edt_events(user_id, id) on delete set null;

-- Séances (CM/TD/TP) au programme d'un CC, pour calculer un score de préparation (Elo restreint à
-- ce périmètre plutôt qu'à toute la matière). Tableau d'ids de séances plutôt qu'une table de
-- jointure — Postgres ne sait pas poser de vraie clé étrangère sur un élément de tableau, donc
-- l'intégrité référentielle (une séance supprimée reste dans le tableau) est acceptée ici, sans
-- conséquence : côté appli, un id de séance qui n'existe plus est simplement ignoré au calcul.
alter table public.cc_events add column if not exists seances text[] not null default '{}';
