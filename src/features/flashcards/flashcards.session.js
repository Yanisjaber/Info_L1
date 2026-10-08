import { toast } from "../../core/components/toast.js";
import { saveResult } from "../../core/services/results.service.js";
import { bump, commit, state } from "../../core/services/store.js";
import { cardsState } from "./flashcards.store.js";
import { DAYS } from "./flashcards.utils.js";
import { rerender } from "../../routing/navigation.js";

export function rate(r) {
  const f = cardsState.FC.cards[cardsState.FC.i], cur = state.cards[f.id] || { box: 0, n: 0, ok: 0 };
  let box = r === "again" ? 1 : Math.min(5, Math.max(1, cur.box) + (r === "easy" ? 2 : 1));
  if (cur.box === 0 && r !== "again") box = r === "easy" ? 3 : 2;
  const entry = { box, n: cur.n + 1, ok: cur.ok + (r === "again" ? 0 : 1), due: r === "again" ? Date.now() : Date.now() + DAYS[box] * 864e5 };
  state.cards[f.id] = entry;
  saveResult("carte", f.id, entry).catch((err) => toast("Erreur : " + err.message));
  bump(1, "carte");
  if (r === "again") { if (!cardsState.FC.again.has(f.id)) { cardsState.FC.again.add(f.id); cardsState.FC.cards.push(f); } }
  else if (!cardsState.FC.again.has(f.id)) cardsState.FC.good++;
  cardsState.FC.i++; cardsState.FC.flip = false;
  commit(); rerender();
}
