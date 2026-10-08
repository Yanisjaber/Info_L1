import { D, M } from "../../core/services/app-data.js";
import { commit, setEntry, state } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { fmt1 } from "../../core/utils/format.js";
import { SET } from "../settings/settings.js";
import { calcFor } from "./grades.js";

export function notesCard(mid) {
  const K = calcFor(mid), m = M(mid), v = state.notes[mid]?.v || {};
  return `<div class="card notes" data-m="${mid}" style="--acc:${m.couleur}"><p class="small muted" style="margin-top:0">${esc(K.formule)}</p>
    <div class="row">${K.champs.map(([k, l, mx]) => `<div class="field"><label for="n-${mid}-${k}">${esc(l)}</label><input id="n-${mid}-${k}" type="number" inputmode="decimal" min="0" max="${mx || 20}" step="0.25" data-k="${k}" value="${v[k] ?? ""}" placeholder="—"></div>`).join("")}</div>
    <div class="nres" style="margin-top:12px"></div></div>`;
}

function calcRes(mid, v) {
  const r = calcFor(mid).calc(v);
  if (!r) return `<span class="muted small">Saisis tes notes (/20) pour voir ta moyenne.</span>`;
  const pass = r.note >= SET().passMark;
  return `<div class="row"><div class="score" style="font-size:2rem;color:${pass ? "var(--ok)" : "var(--ko)"}">${fmt1(r.note)}<span class="muted" style="font-size:1rem"> / 20</span></div>
    <span class="chip ${r.complet ? (pass ? "ok" : "ko") : "wa"}">${r.complet ? (pass ? esc(SET().passLabel) : "sous la moyenne") : `estimation partielle (${r.poids} % du total saisi)`}</span></div>`;
}

export function bindNotes(el) {
  $$(".notes", el).forEach((card) => {
    const mid = card.dataset.m, out = $(".nres", card);
    const cur = () => Object.fromEntries($$("input", card).map((i) => [i.dataset.k, i.value]));
    out.innerHTML = calcRes(mid, cur());
    card.addEventListener("input", () => { const v = cur(); out.innerHTML = calcRes(mid, v); setEntry("notes", mid, { v }); commit(); });
  });
}

export function notes() {
  return { html: `<h1>Notes &amp; CC</h1><p class="muted">Entre tes notes au fil du semestre : le calcul suit exactement la formule de chaque UE (les deuxièmes chances remplacent les notes plus faibles). Tout est sauvegardé.</p>
    ${D.matieres.filter((m) => calcFor(m.id)).map((m) => `<h2 style="display:flex;gap:10px;align-items:center"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.nom)}</h2>${notesCard(m.id)}`).join("") || '<div class="empty">Aucun calculateur configuré. Ajoute les épreuves et leurs poids dans <a href="#/compte">Compte</a> → ta matière → « Calcul de la note ».</div>'}`, after: bindNotes };
}
