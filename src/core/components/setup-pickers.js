import { C, D, M, sKey } from "../services/app-data.js";
import { esc } from "../utils/dom.js";
import { plural } from "../utils/format.js";
import { typeColumns } from "../../features/settings/settings.js";

// Colonnes CM/TD/TP (même regroupement que l'onglet Exercices) plutôt qu'un flux unique mêlant les
// types dans l'ordre chronologique — et pas de case "Toutes" séparée : aucune coche sélectionne déjà
// tout (cf. message au-dessus du popover), une case en plus pour dire la même chose n'ajoutait que
// de la confusion.
export function seanceChips(mids, selS, hasFn = (c, s) => c.qcm.some((q) => q.seance === s.id)) {
  return mids.map((mid) => {
    const c = C(mid), seances = c.seances.filter((s) => hasFn(c, s));
    const cols = typeColumns(seances);
    return `<div class="small muted" style="margin:10px 0 6px"><i class="dot" style="--c:${M(mid).couleur};display:inline-block"></i> ${esc(M(mid).court)}</div>
      <div class="row" style="align-items:flex-start;gap:16px">${cols.map((col) => `<div style="flex:1;min-width:0">
        <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">${esc(col[0].type)}</div>
        <div class="poplist">${col.map((s) => `<label><input type="checkbox" name="s" value="${sKey(mid, s.id)}" ${selS.has(sKey(mid, s.id)) ? "checked" : ""}><span>${esc(s.type)} ${s.numero}</span></label>`).join("")}</div>
      </div>`).join("")}</div>`;
  }).join("");
}

export const NIV_LABEL = { 1: "Base", 2: "Moyen", 3: "Difficile" };

// Cartes matière à cocher : un ".mcard2" par matière, checkbox natif caché derrière toute la carte
// (voir .mcard2 en CSS) pour pouvoir en cocher plusieurs — combiner des matières dans un même QCM.
export function matCardsHtml(selM, countFn = (m) => D.Q.filter((qq) => qq.mid === m.id).length, noun = "question") {
  return `<div class="mgrid2">${D.matieres.map((m) => `<label class="mcard2"><input type="checkbox" name="m" value="${m.id}" ${selM.has(m.id) ? "checked" : ""}><i class="dot" style="background:${m.couleur}"></i><b>${esc(m.court)}</b><span class="tiny muted">${plural(countFn(m), noun)}</span></label>`).join("")}</div>`;
}

// Cartes matière à choix unique (même ".mcard2" que le QCM, mais des radios : une éval blanche
// porte sur une seule matière à la fois).
export function matCardsHtmlSingle(mid) {
  return `<div class="mgrid2">${D.matieres.map((m) => `<label class="mcard2"><input type="radio" name="m" value="${m.id}" ${m.id === mid ? "checked" : ""}><i class="dot" style="background:${m.couleur}"></i><b>${esc(m.court)}</b><span class="tiny muted">${plural(D.E.filter((e) => e.mid === m.id).length, "exercice")}</span></label>`).join("")}</div>`;
}
