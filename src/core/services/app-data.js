export const D = { matieres: [], periodes: [], cal: { evenements: [], remarques: [] }, edt: { events: [] }, content: {}, docSids: new Set(), Q: [], F: [], E: [], todos: [], idx: null, settings: null, files: {} };

export const M = (id) => D.matieres.find((m) => m.id === id);

export const C = (id) => D.content[id];

export const sKey = (mid, sid) => mid + "/" + sid;

export const seanceOf = (mid, sid) => C(mid).seances.find((s) => s.id === sid) || { type: "", numero: "" };

// Une matière sans période, ou rattachée à une période encore active, apparaît dans le menu
// principal. Une fois sa période marquée « terminée », elle bascule dans les archives sans
// disparaître : on peut toujours l'ouvrir, réviser ses QCM/cartes, etc.
const isActive = (m) => !m.periode || D.periodes.find((p) => p.id === m.periode)?.statut !== "termine";

export const activeMatieres = () => D.matieres.filter(isActive);

export const archivedMatieres = () => D.matieres.filter((m) => !isActive(m));

export function periodeLabel() {
  const noms = [...new Set(D.periodes.filter((p) => p.statut === "actif").map((p) => p.nom))];
  return noms.length === 1 ? noms[0] : "Révise";
}
