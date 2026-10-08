import { D, sKey } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { shuffle } from "../../core/utils/format.js";

export const DAYS = [0, 1, 3, 7, 14, 30];

export function poolF({ mids, sids, mode, cnt }) {
  const now = Date.now();
  let L = D.F.filter((f) => mids.includes(f.mid) && (!sids.size || sids.has(sKey(f.mid, f.seance))));
  const due = L.filter((f) => state.cards[f.id] && state.cards[f.id].due <= now);
  const fresh = L.filter((f) => !state.cards[f.id]);
  if (mode === "due") return shuffle(due).concat(shuffle(fresh)).slice(0, cnt || 9999);
  if (mode === "new") return shuffle(fresh).slice(0, cnt || 9999);
  return shuffle(L).slice(0, cnt || 9999);
}

export const CARDMODE_LABEL = { due: "à revoir + nouvelles", new: "nouvelles seulement", all: "toutes" };

export const hasFlash = (c, s) => c.flashcards.some((f) => f.seance === s.id);
