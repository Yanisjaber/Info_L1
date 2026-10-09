// Calcul de la note finale d'une matière, à partir de la configuration saisie par l'utilisateur
// (colonne `grading` de la table matieres, éditable dans Compte → matière → « Calcul de la note »).
//
// Format de la configuration :
// {
//   items:  [ { id, label, weight, max?, parts? } ],   // les épreuves du semestre
//   second: { id, label, weight?, required? } | null,  // note de 2e chance, optionnelle
//   formule?: "texte affiché au-dessus du calculateur" // sinon générée automatiquement
// }
// - weight : poids de l'épreuve (en %, ou n'importe quelle unité : seul le rapport compte).
// - max    : barème de la note saisie (20 par défaut) ; elle est ramenée sur 20.
// - parts  : [{ id, label }] — épreuve notée en plusieurs saisies dont on fait la moyenne
//            (ex. deux interros comptant ensemble pour un seul CC).
// - second : la note de 2e chance remplace, épreuve par épreuve, toute note plus faible
//            (max(note, 2e chance)). Si `required`, elle compte aussi dans la moyenne avec son
//            propre poids ; sinon elle est facultative et sert seulement de remplacement.
import { M } from "../../core/services/app-data.js";

const num = (v) => (v === "" || v === null || v === undefined || isNaN(+v) ? null : +v);

// moyenne pondérée sur les champs renseignés
function wavg(pairs) {
  let s = 0, w = 0;
  pairs.forEach(([v, p]) => { if (v !== null) { s += v * p; w += p; } });
  return w ? { note: s / w, poids: w } : null;
}

const shortLabel = (l) => String(l || "").replace(/\s*\([^)]*%\)\s*$/, "").trim();
const pctText = (w, total) => `${Math.round((w / total) * 1000) / 10} %`.replace(".", ",");

// Une seule règle d'affichage d'une épreuve, partout dans l'app : le nom tel qu'il est écrit, puis son coef
// calculé depuis le poids (« 10 % », ou « facultative » sans coef). Rien n'est retiré du texte du nom.
export const shareText = (share) => (share === null ? "facultative" : `${String(share).replace(".", ",")} %`);

// Phrase décrivant la formule, générée depuis la configuration.
export function describeFormula(g) {
  if (!g || !Array.isArray(g.items) || !g.items.length) return "";
  const sec = g.second;
  const items = g.items;
  const secW = sec && sec.required ? +sec.weight || 0 : 0;
  const total = items.reduce((s, it) => s + (+it.weight || 0), 0) + secW || 1;
  const terms = items.map((it) => `${pctText(+it.weight || 0, total)} × ${sec ? `max(${shortLabel(it.label)}, ${shortLabel(sec.label)})` : shortLabel(it.label)}`);
  if (sec && sec.required) terms.push(`${pctText(secW, total)} × ${shortLabel(sec.label)}`);
  let s = `Note = ${terms.join(" + ")}`;
  if (sec && !sec.required) s += `  (${shortLabel(sec.label)} facultative : elle remplace une note plus faible)`;
  return s;
}

// Transforme une configuration en calculateur { titre, formule, champs, calc } ; null si inutilisable.
export function compileGrading(g, titre = "") {
  if (!g || !Array.isArray(g.items) || !g.items.length) return null;
  const items = g.items.map((it) => ({
    id: it.id, label: it.label, w: +it.weight || 0, max: +it.max || 20,
    parts: Array.isArray(it.parts) && it.parts.length > 1 ? it.parts : null,
  }));
  const sec = g.second ? { id: g.second.id, label: g.second.label, required: !!g.second.required, w: g.second.required ? +g.second.weight || 0 : 0, max: +g.second.max || 20 } : null;

  // Les champs suivent l'ordre des lignes de l'éditeur, la 2e chance comprise (sa place est `second.pos`, à la fin par défaut).
  const champs = [];
  const secAt = sec && Number.isInteger(g.second.pos) ? Math.min(Math.max(g.second.pos, 0), items.length) : items.length;
  items.forEach((it, i) => {
    if (sec && i === secAt) champs.push(sec.max === 20 ? [sec.id, sec.label] : [sec.id, sec.label, sec.max]);
    for (const f of it.parts || [{ id: it.id, label: it.label }]) champs.push(it.max === 20 ? [f.id, f.label] : [f.id, f.label, it.max]);
  });
  if (sec && secAt >= items.length) champs.push(sec.max === 20 ? [sec.id, sec.label] : [sec.id, sec.label, sec.max]);

  // Part de chaque champ dans la note (en %), pour l'afficher à côté de son nom ; null = 2e chance facultative.
  const totalW = items.reduce((s, it) => s + it.w, 0) + (sec && sec.required ? sec.w : 0) || 1;
  const pct = (w) => Math.round((w / totalW) * 1000) / 10;
  const shares = {};
  for (const it of items) for (const f of it.parts || [{ id: it.id }]) shares[f.id] = pct(it.w / (it.parts ? it.parts.length : 1));
  if (sec) shares[sec.id] = sec.required ? pct(sec.w) : null;

  const scale = (x, max) => (x === null || max === 20 ? x : (x / max) * 20);

  function calc(v) {
    const val = (k) => num(v[k]);
    const xs = items.map((it) => {
      if (it.parts) {
        const p = it.parts.map((q) => scale(val(q.id), it.max));
        return p.every((x) => x !== null) ? p.reduce((s, x) => s + x, 0) / p.length : null;
      }
      return scale(val(it.id), it.max);
    });
    const S = sec ? scale(val(sec.id), sec.max) : null;
    const complete = xs.every((x) => x !== null) && (!sec || !sec.required || S !== null);
    if (complete) {
      const f = S === null ? -Infinity : S;
      const terms = items.map((it, i) => ({ w: it.w, x: sec ? Math.max(xs[i], f) : xs[i] }));
      if (sec && sec.required) terms.push({ w: sec.w, x: S });
      const total = terms.reduce((s, t) => s + t.w, 0);
      const equal = terms.every((t) => t.w === terms[0].w);
      const note = equal ? terms.reduce((s, t) => s + t.x, 0) / terms.length : terms.reduce((s, t) => s + (t.w / total) * t.x, 0);
      return { note, complet: true };
    }
    // Estimation partielle : moyenne pondérée de tout ce qui est saisi, 2e chance comprise (elle remplace une note plus
    // faible et, si elle a un poids, compte avec ce poids). `poids` = part du total déjà saisie, en %.
    const up = (x) => (x === null || S === null ? x : Math.max(x, S));
    const pairs = items.flatMap((it, i) => (it.parts ? it.parts.map((q) => [up(scale(val(q.id), it.max)), it.w / it.parts.length]) : [[up(xs[i]), it.w]]));
    if (sec && sec.required) pairs.push([S, sec.w]);
    const e = wavg(pairs);
    return e ? { note: e.note, complet: false, poids: Math.round((e.poids / totalW) * 1000) / 10 } : null;
  }

  return { titre, formule: g.formule || describeFormula(g), champs, shares, calc };
}

// Calculateur d'une matière (mémorisé tant que sa configuration ne change pas).
const cache = new WeakMap();
export function calcFor(mid) {
  const m = M(mid);
  if (!m || !m.grading) return null;
  if (!cache.has(m.grading)) cache.set(m.grading, compileGrading(m.grading, m.nom));
  return cache.get(m.grading);
}
