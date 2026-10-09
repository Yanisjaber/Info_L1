// Calcul de la note finale d'une matière, à partir de la configuration saisie par l'utilisateur
// (colonne `grading` de la table matieres, éditable depuis la page Notes & CC et dans Compte → matière).
//
// Format de la configuration :
// {
//   items:  [ { id, label, weight, max?, parts? } ],                      // les épreuves
//   second: { id, label, weight?, required?, max?, pos? } | null,         // la 2e chance (une seule)
// }
// - weight : poids de l'épreuve (en %, ou n'importe quelle unité : seul le rapport compte).
// - max    : barème de la note saisie (20 par défaut) ; elle est ramenée sur 20 et reste toujours entre 0 et `max`.
// - parts  : [{ id, label }] — épreuve notée en plusieurs saisies dont on fait la moyenne
//            (ex. deux interros comptant ensemble pour un seul CC).
// - second : la note de 2e chance remplace, épreuve par épreuve, toute note plus faible (max(note, 2e chance)).
//            Si `required` (et `weight` > 0), elle compte aussi dans la moyenne avec son propre poids ; sinon elle est
//            facultative et sert seulement de remplacement.
// - pos    : nombre d'épreuves placées avant la 2e chance dans l'éditeur (à la fin si absent).
import { M } from "../../core/services/app-data.js";
import { fmt1 } from "../../core/utils/format.js";

const round1 = (x) => Math.round(x * 10) / 10;

// Note saisie → nombre, ou null si vide ou illisible.
const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = +v;
  return Number.isFinite(n) ? n : null;
};

// Une note reste toujours entre 0 et le « Sur » de l'épreuve.
export const clampScore = (n, max) => Math.min(max, Math.max(0, n));

// Une seule règle d'affichage d'une épreuve, partout dans l'app : le nom tel qu'il est écrit, puis son coef
// calculé depuis le poids (« 10 % », ou « facultative » sans coef). Rien n'est retiré du texte du nom.
export const shareText = (share) => (share === null ? "facultative" : `${fmt1(share)} %`);

// Place de la 2e chance parmi les lignes (0 = avant la première épreuve), bornée au nombre d'épreuves.
export const secondAt = ({ items, second }) => (second && Number.isInteger(second.pos) ? Math.min(Math.max(second.pos, 0), items.length) : items.length);

// Moyenne pondérée des couples [valeur, poids] dont la valeur est renseignée ; `poids` = somme des poids pris en compte.
function wavg(pairs) {
  const got = pairs.filter(([v]) => v !== null), w = got.reduce((s, [, p]) => s + p, 0);
  if (!got.length) return null;
  return { note: w ? got.reduce((s, [v, p]) => s + v * p, 0) / w : got.reduce((s, [v]) => s + v, 0) / got.length, poids: w };
}

// Transforme une configuration en calculateur { champs, shares, calc } ; null si inutilisable.
//   champs : [[id, nom, max?]] dans l'ordre des lignes de l'éditeur
//   shares : { id → part en %, ou null pour une 2e chance facultative }
//   groups : { id d'épreuve → ids des cases de saisie } (plusieurs cases pour une épreuve en moyenne de saisies)
//   calc(v) : { note, complet, poids? } pour les notes saisies `v` ({ id → valeur }), ou null s'il n'y en a aucune
export function compileGrading(g) {
  if (!g || !Array.isArray(g.items)) return null;
  // Chaque identifiant n'est pris qu'une fois : un doublon ou un identifiant manquant est ignoré.
  const seen = new Set(), take = (id) => !!id && !seen.has(id) && !!seen.add(id);
  const items = [];
  for (const it of g.items.filter(Boolean)) {
    if (!take(it.id)) continue;
    const parts = Array.isArray(it.parts) ? it.parts.filter((q) => q && take(q.id)) : [];
    items.push({ id: it.id, label: String(it.label ?? ""), w: Math.max(0, +it.weight || 0), max: +it.max > 0 ? +it.max : 20, parts: parts.length > 1 ? parts : null });
  }
  if (!items.length) return null;
  const s = g.second && take(g.second.id) ? g.second : null;
  const sw = s ? Math.max(0, +s.weight || 0) : 0;
  const sec = s && { id: s.id, label: String(s.label ?? ""), required: !!s.required && sw > 0, w: s.required ? sw : 0, max: +s.max > 0 ? +s.max : 20 };

  const field = (f, max) => (max === 20 ? [f.id, f.label] : [f.id, f.label, max]);
  const subs = (it) => it.parts || [it]; // les saisies d'une épreuve
  const secAt = secondAt({ items, second: s });
  const champs = [];
  items.forEach((it, i) => {
    if (sec && i === secAt) champs.push(field(sec, sec.max));
    subs(it).forEach((f) => champs.push(field(f, it.max)));
  });
  if (sec && secAt >= items.length) champs.push(field(sec, sec.max));

  const groups = {};
  items.forEach((it) => { groups[it.id] = subs(it).map((f) => f.id); });
  if (sec) groups[sec.id] = [sec.id];

  const totalW = items.reduce((t, it) => t + it.w, 0) + (sec ? sec.w : 0) || 1;
  const share = (w) => round1((w / totalW) * 100);
  const shares = {};
  items.forEach((it) => subs(it).forEach((f) => { shares[f.id] = share(it.w / subs(it).length); }));
  if (sec) shares[sec.id] = sec.required ? share(sec.w) : null;

  function calc(v = {}) {
    // Note lue dans `v`, bornée entre 0 et son « Sur », puis ramenée sur 20 ; null si vide.
    const read = (id, max) => { const n = num(v[id]); return n === null ? null : max === 20 ? clampScore(n, max) : (clampScore(n, max) / max) * 20; };
    const xs = items.map((it) => {
      if (!it.parts) return read(it.id, it.max);
      const p = it.parts.map((q) => read(q.id, it.max));
      return p.every((x) => x !== null) ? p.reduce((t, x) => t + x, 0) / p.length : null;
    });
    const S = sec ? read(sec.id, sec.max) : null;
    // La 2e chance remplace toute note plus faible.
    const up = (x) => (x === null || S === null ? x : Math.max(x, S));

    if (xs.every((x) => x !== null) && (!sec || !sec.required || S !== null)) {
      const pairs = items.map((it, i) => [up(xs[i]), it.w]);
      if (sec && sec.required) pairs.push([S, sec.w]);
      return { note: wavg(pairs).note, complet: true };
    }
    // Estimation partielle : moyenne pondérée de tout ce qui est saisi, 2e chance comprise.
    // `poids` = part du total déjà saisie, en %.
    const pairs = items.flatMap((it, i) => (it.parts ? it.parts.map((q) => [up(read(q.id, it.max)), it.w / it.parts.length]) : [[up(xs[i]), it.w]]));
    if (sec && sec.required) pairs.push([S, sec.w]);
    const e = wavg(pairs);
    return e ? { note: e.note, complet: false, poids: round1((e.poids / totalW) * 100) } : null;
  }

  return { champs, shares, groups, calc };
}

// Calculateur d'une matière (mémorisé tant que sa configuration ne change pas).
const cache = new WeakMap();
export function calcFor(mid) {
  const m = M(mid);
  if (!m || !m.grading) return null;
  if (!cache.has(m.grading)) cache.set(m.grading, compileGrading(m.grading));
  return cache.get(m.grading);
}
