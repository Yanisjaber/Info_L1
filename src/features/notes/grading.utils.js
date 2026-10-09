// Manipulation de la configuration du calculateur (colonne `grading`, voir grades.js) sans toucher au DOM.
// Sert à créer, modifier ou retirer une épreuve depuis un autre écran (échéances du calendrier, EDT) :
// toutes les fonctions rendent une NOUVELLE configuration, sans modifier celle qu'on leur donne.
import { secondAt } from "./grades.js";

export const MAX_LABEL = 80;  // caractères d'un nom d'épreuve
export const MAX_VALUE = 1e6; // poids et « Sur » : au-delà, les calculs perdent leur sens

// Nombre fini strictement positif et pas démesuré.
export const sane = (x) => Number.isFinite(x) && x > 0 && x <= MAX_VALUE;

// Tous les identifiants déjà pris dans une configuration (épreuves, saisies d'une moyenne, 2e chance).
const idsOf = (g) => new Set([...(g?.items || []).flatMap((it) => [it.id, ...(it.parts || []).map((p) => p.id)]), g?.second?.id].filter(Boolean));

// Identifiant neuf, jamais réutilisé : une épreuve retirée puis une autre ajoutée ne doivent pas se partager la même note.
let seq = 0;
export function newEpreuveId(base, used) {
  let id;
  do id = base + Date.now().toString(36) + (seq++).toString(36); while (used.has(id));
  used.add(id);
  return id;
}

// Les épreuves d'une configuration dans l'ordre de l'éditeur (la 2e chance à sa place) : [{ id, label, weight, max, second }].
export function listEpreuves(g) {
  const items = (g?.items || []).map((it) => ({ id: it.id, label: it.label, weight: +it.weight || 0, max: +it.max > 0 ? +it.max : 20, second: false }));
  if (g?.second) items.splice(secondAt({ items: g.items || [], second: g.second }), 0, { id: g.second.id, label: g.second.label, weight: +g.second.weight || 0, max: +g.second.max > 0 ? +g.second.max : 20, second: true });
  return items;
}

export const epreuveOf = (g, id) => listEpreuves(g).find((e) => e.id === id) || null;

// Épreuves qui n'ont pas encore d'échéance (`linked` : ensemble des identifiants déjà pris).
export const freeEpreuves = (g, linked) => listEpreuves(g).filter((e) => !linked.has(e.id));

// Crée l'épreuve, ou met à jour celle d'identifiant `id` (nom, poids, « Sur », 2e chance ou non).
// Lève une Error au message lisible si la saisie est invalide ou si la matière a déjà une autre 2e chance.
// Rend { grading, id }.
export function upsertEpreuve(g, { id, label, weight, max, second }) {
  label = String(label ?? "").trim().slice(0, MAX_LABEL);
  weight = Number(weight); max = Number(max);
  if (!label) throw new Error("Donne un nom à l'épreuve");
  if (!sane(weight)) throw new Error("Indique le poids de l'épreuve, en % (entre 0 et 1 000 000)");
  if (!sane(max)) throw new Error("Indique la note maximale de l'épreuve (le « Sur »)");

  const items = [...(g?.items || [])];
  let sec = g?.second || null;
  const used = idsOf(g);
  let at = items.length, old = null;                      // `at` : place de l'épreuve parmi les lignes
  const i = id ? items.findIndex((it) => it.id === id) : -1;
  if (i >= 0) { old = items[i]; at = i; items.splice(i, 1); }
  else if (id && sec && sec.id === id) { old = sec; at = secondAt({ items, second: sec }); sec = null; }
  const finalId = id && old ? id : newEpreuveId(second ? "sc" : "e", used);

  if (second) {
    if (sec) throw new Error(`Cette matière a déjà une 2e chance : « ${sec.label} ». Une seule est possible.`);
    sec = { ...(old && old.id === finalId && !old.parts ? old : {}), id: finalId, label, required: true, weight, pos: Math.min(at, items.length) };
    delete sec.max; if (max !== 20) sec.max = max;
  } else {
    const it = { ...(old && old.id === finalId ? old : {}), id: finalId, label, weight };
    delete it.pos; delete it.required; delete it.max; if (max !== 20) it.max = max;
    items.splice(Math.min(at, items.length), 0, it);
  }
  const out = { items };
  if (sec) out.second = sec;
  return { grading: out, id: finalId };
}

// Retire l'épreuve. Rend la nouvelle configuration, ou null s'il ne reste plus d'épreuve normale.
export function removeEpreuve(g, id) {
  const all = g?.items || [], items = all.filter((it) => it.id !== id);
  if (!items.length) return null;
  const out = { items };
  if (g.second && g.second.id !== id) {
    // La 2e chance garde la même place par rapport aux autres épreuves : on retire 1 si l'épreuve retirée était avant elle.
    const pos = secondAt({ items: all, second: g.second }), gone = all.findIndex((it) => it.id === id);
    out.second = { ...g.second, pos: gone >= 0 && gone < pos ? pos - 1 : pos };
  }
  return out;
}
