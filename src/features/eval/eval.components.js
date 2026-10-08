import { D } from "../../core/services/app-data.js";
import { esc } from "../../core/utils/dom.js";
import { expectedAnswers } from "../exercices/exercices.utils.js";

// Options du menu "Portée" : un CC n'apparaît que s'il a des séances au programme renseignées
// (sinon rien à cibler dessus) — même source que ccReadiness.
export function ccOptionsHtml(mid, selId = "") {
  const ccs = D.cal.evenements.filter((e) => e.matiere === mid && e.seances?.length);
  return `<label><input type="radio" name="cc" value="" ${selId ? "" : "checked"}><span>Toute la matière</span></label>${ccs.map((c) => `<label><input type="radio" name="cc" value="${esc(c.id)}" ${c.id === selId ? "checked" : ""}><span>${esc(c.titre)}</span></label>`).join("")}`;
}

export function evalTicketHtml(mid, mins, ccSel = "") {
  return `<div class="tb" id="etk">
      <button type="button" class="tbbtn" data-edit="dur"><span class="ic">⏱️</span><span class="v" id="tk-dur"></span>
        <div class="pop" data-panel="dur"><div class="field" style="min-width:150px;gap:4px"><label class="tiny muted">Durée (minutes)</label><input type="number" name="t" min="10" max="180" step="5" value="${mins}"></div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="niv"><span class="ic">📶</span><span class="v" id="tk-eniv"></span>
        <div class="pop" data-panel="niv"><div class="poplist">
          <label><input type="radio" name="niv" value="1"><span>Base</span></label>
          <label><input type="radio" name="niv" value="2" checked><span>Moyen</span></label>
          <label><input type="radio" name="niv" value="3"><span>Difficile</span></label>
        </div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="cc"><span class="ic">🎯</span>Portée : <span class="v" id="tk-cc"></span>
        <div class="pop" data-panel="cc"><div class="poplist" id="cc-list">${ccOptionsHtml(mid, ccSel)}</div></div>
      </button>
    </div>`;
}

export function texteReviewHtml(e, snap) {
  const answers = expectedAnswers(e), n = Math.max(1, answers.length);
  const values = snap.values || [], oks = snap.oks || [];
  return Array.from({ length: n }, (_, i) => `<div class="item"${i ? ' style="margin-top:6px"' : ""}><span class="chip ${oks[i] ? "ok" : "ko"}">${oks[i] ? "✓" : "✗"}</span><div class="sp">${esc(values[i] || "(vide)")}</div></div>`).join("");
}
