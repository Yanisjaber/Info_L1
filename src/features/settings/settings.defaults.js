// Valeurs de repli, utilisées UNIQUEMENT tant que la table `user_settings` n'a pas de ligne pour
// l'utilisateur (ou n'existe pas encore). Neutres : aucun nom d'établissement, de matière ni de
// semestre. Les vraies valeurs de chaque utilisateur vivent en base (Compte → Réglages).
//
// Forme d'une configuration :
// {
//   passMark, passLabel          // note de validation (/20) et libellé du badge « validé »
//   slug                         // préfixe des fichiers exportés (progression-<slug>.json, calendrier-CC-<slug>.ics)
//   edtFootnote                  // texte sous l'emploi du temps ; « {source} » = origine des créneaux
//   seanceTypes: [{ id, label, edt }]   // types de séance ; `edt` = type de créneau d'EDT correspondant
//   edtTypes:    [{ id, label?, quiet?, off? }] // types de créneau d'EDT ; `quiet` = absent de « prochains cours » ; `off` = jour sans cours (pas de matière)
//   ics: { types: [{ pattern, type }], cc }  // règles de détection à l'import .ics (expressions régulières)
// }
export const DEFAULT_SETTINGS = {
  passMark: 10,
  passLabel: "validé",
  slug: "revise",
  edtFootnote: "Source : emploi du temps {source}. Les horaires peuvent changer : vérifie-les auprès de ton établissement en cas de doute.",
  seanceTypes: [
    { id: "CM", label: "Cours magistraux", edt: "Cours" },
    { id: "TD", label: "Travaux dirigés", edt: "TD" },
    { id: "TP", label: "Travaux pratiques", edt: "TP" },
  ],
  edtTypes: [
    { id: "Cours" },
    { id: "TD" },
    { id: "TP" },
    { id: "Réunion", quiet: true },
    { id: "Férié", label: "Jour férié", off: true },
    { id: "Fermeture", label: "Fermeture", off: true },
  ],
  ics: {
    types: [
      { pattern: "\\bR[EÉ]UNION\\b", type: "Réunion" },
      { pattern: "\\bTD\\b", type: "TD" },
      { pattern: "\\bTP\\b", type: "TP" },
      { pattern: "\\b(F[EÉ]RI[EÉ]|FERMETURE)\\b", type: "Férié" },
    ],
    cc: "\\b(CC\\d*|EXAMEN|PARTIEL|CONTR[OÔ]LE|DEVOIR SURVEILL[EÉ]|DS|TEST)\\b",
  },
};
