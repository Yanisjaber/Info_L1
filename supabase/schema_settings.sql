-- Réglages par utilisateur : types de séance, vocabulaire de l'EDT, règles d'import .ics, note de validation, noms d'export.
-- Rejouable. Sans ligne pour un utilisateur, l'app utilise des valeurs neutres.

create table if not exists public.user_settings (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  config     jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Sécurité : chaque utilisateur n'accède qu'à ses propres réglages.
alter table public.user_settings enable row level security;
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select to authenticated using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings for insert to authenticated with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_settings_delete_own" on public.user_settings for delete to authenticated using (auth.uid() = user_id);

-- Lève la limite CM/TD/TP : les types de séance se configurent désormais dans les réglages.
alter table public.seances drop constraint if exists seances_type_check;

-- Crée les réglages des comptes existants avec les valeurs qui étaient auparavant écrites dans le code.
insert into public.user_settings (user_id, config)
select id, $j${
  "passMark": 10,
  "passLabel": "UE validée",
  "slug": "l1s1",
  "edtFootnote": "Source : emploi du temps UPS ({source}). Les horaires peuvent changer : vérifie sur l'ENT en cas de doute.",
  "seanceTypes": [
    {
      "id": "CM",
      "label": "Cours magistraux",
      "edt": "Cours"
    },
    {
      "id": "TD",
      "label": "Travaux dirigés",
      "edt": "TD"
    },
    {
      "id": "TP",
      "label": "Travaux pratiques",
      "edt": "TP"
    }
  ],
  "edtTypes": [
    {
      "id": "Cours"
    },
    {
      "id": "TD"
    },
    {
      "id": "TP"
    },
    {
      "id": "Réunion",
      "quiet": true
    },
    {
      "id": "Férié",
      "label": "Jour férié",
      "off": true
    },
    {
      "id": "Fermeture",
      "label": "Université fermée",
      "off": true
    }
  ],
  "ics": {
    "types": [
      {
        "pattern": "\\bR[EÉ]UNION\\b",
        "type": "Réunion"
      },
      {
        "pattern": "\\bTD\\b",
        "type": "TD"
      },
      {
        "pattern": "\\bTP\\b",
        "type": "TP"
      },
      {
        "pattern": "\\b(F[EÉ]RI[EÉ]|FERMETURE)\\b",
        "type": "Férié"
      }
    ],
    "cc": "\\b(CC\\d*|EXAMEN|PARTIEL|CONTR[OÔ]LE|DEVOIR SURVEILL[EÉ]|DS|TEST)\\b"
  }
}$j$::jsonb from auth.users
on conflict (user_id) do nothing;
