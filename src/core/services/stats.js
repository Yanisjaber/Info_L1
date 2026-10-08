import { C, sKey } from "./app-data.js";
import { dataState } from "./app-data.store.js";
import { state } from "./store.js";
import { pct } from "../utils/format.js";

export function stats(mid) {
  const c = C(mid), now = Date.now();
  const read = c.seances.filter((s) => state.read[sKey(mid, s.id)]?.v).length;
  const answered = c.qcm.filter((q) => state.qcm[q.id]);
  const right = c.qcm.filter((q) => state.qcm[q.id]?.last).length;
  const n = answered.reduce((a, q) => a + state.qcm[q.id].n, 0), ok = answered.reduce((a, q) => a + state.qcm[q.id].ok, 0);
  const seen = c.flashcards.filter((f) => state.cards[f.id]);
  const mastered = seen.filter((f) => state.cards[f.id].box >= 4).length;
  const due = seen.filter((f) => state.cards[f.id].due <= now).length;
  const exoOk = c.exercices.filter((e) => state.exos[e.id]?.v === "ok").length;
  const wrong = c.qcm.filter((q) => state.qcm[q.id] && state.qcm[q.id].last === false).length;
  const prog = Math.round((pct(read, c.seances.length) + pct(right, c.qcm.length) + pct(mastered, c.flashcards.length)) / 3);
  return { read, seances: c.seances.length, nq: c.qcm.length, answered: answered.length, right, acc: pct(ok, n), n, ok, nf: c.flashcards.length, seen: seen.length, mastered, due, wrong, ne: c.exercices.length, exoOk, prog };
}

export const totals = () => dataState.IDS.reduce((t, id) => { const s = stats(id); for (const k of ["read", "seances", "nq", "answered", "right", "n", "ok", "nf", "seen", "mastered", "due", "wrong"]) t[k] = (t[k] || 0) + s[k]; return t; }, { read: 0, seances: 0, nq: 0, answered: 0, right: 0, n: 0, ok: 0, nf: 0, seen: 0, mastered: 0, due: 0, wrong: 0 });
