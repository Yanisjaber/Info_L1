-- ============================================================
--  Marque les exercices (kind='exercice') réellement extraits d'un sujet de TD
--  fourni par l'utilisateur, par opposition aux exercices supplémentaires créés
--  par Claude (ex. conversion d'anciens QCM nécessitant du traçage de code lors
--  de l'audit du 2026-10-02). Par défaut false : rien n'est "officiel" tant que
--  l'audit ne l'a pas posé explicitement sur les items correspondants.
--  Idempotent.
-- ============================================================
alter table public.sujets add column if not exists officiel boolean not null default false;
