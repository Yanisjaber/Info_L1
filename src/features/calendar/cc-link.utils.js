// Rapprochement d'une échéance CC avec une épreuve du calculateur d'après son titre (pour les échéances créées avant
// l'existence du lien par identifiant). Calcul pur : aucune écriture, c'est l'appelant qui enregistre le lien.
import { listEpreuves } from "../notes/grading.utils.js";

// norm : minuscules sans accents (même règle que la recherche).
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nm = (x) => norm(x).replace(/\s+/g, " ").trim();
// Le code d'une échéance ("CC1", "CCI2", "Note 3"…) n'est pas toujours suivi d'un tiret dans le titre saisi à la main
// ("CC1 Système" vs "CC1 — QCM 1") : on extrait lettres+chiffre en tête de chaîne plutôt que de dépendre d'un séparateur,
// et on ramène "CCI" (libellés du calculateur) à "CC" (libellés des échéances) pour que les deux conventions se rejoignent.
const codeMatch = (s) => nm(s).match(/^([a-zéèêàù]+)\s?(\d+(?:\.\d+)?)?/);
const codeOf = (m) => (m ? m[1].replace(/^cci/, "cc") + (m[2] || "") : "");

// Parmi `labeled` ([{ label, … }]), ceux dont le code est celui du titre ; s'il y en a plusieurs (Algo CC1 — QCM 1 / QCM 2),
// on départage avec le reste du titre. Rend la liste des candidats (0, 1 ou plusieurs).
export function matchByTitle(titre, labeled) {
  const tm = codeMatch(titre), code = codeOf(tm);
  if (!code) return [];
  const tail = tm ? nm(titre).slice(tm[0].length).trim() : "";
  let cands = labeled.filter((x) => codeOf(codeMatch(String(x.label).split(/\s[-–—]\s|\s\(/)[0])) === code);
  if (cands.length > 1) cands = cands.filter((x) => tail && nm(x.label).includes(tail));
  return cands;
}

// Pour chaque échéance pas encore reliée : l'épreuve libre de sa matière qu'on reconnaît à coup sûr (un seul candidat,
// et pas déjà proposée à une autre échéance), sinon l'échéance est « à compléter ».
// `matieres` : [{ id, grading }] ; `evenements` : échéances (avec .epreuve). Rend { proposals: [{ ev, epreuve }], orphans: [ev] }.
export function linkProposals(evenements, matieres) {
  const proposals = [], orphans = [];
  for (const m of matieres) {
    const mine = evenements.filter((e) => e.matiere === m.id);
    const taken = new Set(mine.map((e) => e.epreuve).filter(Boolean));
    const free = listEpreuves(m.grading).filter((p) => !taken.has(p.id));
    for (const ev of mine.filter((e) => !e.epreuve).sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      const c = matchByTitle(ev.titre, free);
      if (c.length === 1) { proposals.push({ ev, epreuve: c[0] }); free.splice(free.indexOf(c[0]), 1); }
      else orphans.push(ev);
    }
  }
  return { proposals, orphans };
}
