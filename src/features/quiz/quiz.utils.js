import { D, sKey } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { shuffle } from "../../core/utils/format.js";

export const isRef = (q) => q.choix.some((c) => /(toutes? les|aucune? (des|de ces)|les deux|ci-dessus|ci-dessous|\b[A-D] et [A-D]\b|réponses? [a-d1-4]\b|réponses? précédentes?)/i.test(c));

export function poolQ({ mids, sids, niv, statut }) {
  return D.Q.filter((q) => mids.includes(q.mid) && (!sids.size || sids.has(sKey(q.mid, q.seance))) && niv.has(q.niveau) && (!statut || (statut === "wrong" ? state.qcm[q.id]?.last === false : state.qcm[q.id]?.last === true)));
}

export function balanced(pool, n) {
  const g = {}; shuffle(pool).forEach((q) => (g[q.seance] = g[q.seance] || []).push(q));
  const lists = Object.values(g), out = [];
  while (out.length < n && lists.some((l) => l.length)) for (const l of lists) if (l.length && out.length < n) out.push(l.shift());
  return shuffle(out);
}

export const okQ = (x) => x.ans.size === x.q.rep.length && x.q.rep.every((r) => x.ans.has(r));
