-- Distingue les exercices tirés d'un vrai sujet de TD (officiel) des exercices ajoutés en plus.
-- Faux par défaut. Rejouable.

alter table public.sujets add column if not exists officiel boolean not null default false;
