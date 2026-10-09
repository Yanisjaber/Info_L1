import { appConfirm } from "../../core/components/dialog.js";
import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { D, M, activeMatieres } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { commit, setEntry, state } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { fmt1 } from "../../core/utils/format.js";
import { rerenderKeep } from "../../routing/navigation.js";
import { saveMatiere } from "../matieres/matieres.service.js";
import { SET } from "../settings/settings.js";
import { bindGradingEditor, gradingEditorHtml, readGradingEditor } from "./grading-editor.js";
import { calcFor } from "./grades.js";

export function notesCard(mid) {
  const K = calcFor(mid), m = M(mid), v = state.notes[mid]?.v || {};
  return `<div class="card notes" data-m="${mid}" style="--acc:${m.couleur}">
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

// Créer ou modifier le calculateur d'une matière : les mêmes champs que dans Compte (épreuves, poids,
// note sur, 2e chance), avec leur propre bouton Enregistrer. Caché derrière le crayon (action « togglegrading »),
// sauf tant qu'il n'y a pas de calculateur : il est alors ouvert d'office.
function gradingFormHtml(m) {
  const has = !!calcFor(m.id);
  const ed = gradingEditorHtml(m, { bare: true });
  const save = `<div class="row" style="margin-top:10px"><button class="btn pri" type="submit">Enregistrer le calculateur</button></div>`;
  return `<form class="gr-form" data-m="${esc(m.id)}" ${has ? "hidden" : ""}>${has ? "" : `<p class="small muted" style="margin:10px 0 0">Pas encore de calculateur pour cette matière : ajoute tes épreuves ci-dessous.</p>`}${ed.replace(/<\/details>$/, `${save}</details>`)}</form>`;
}

function pencilHtml(m) {
  return `<button type="button" class="btn sm ghost" data-a="togglegrading" data-m="${esc(m.id)}" aria-expanded="${calcFor(m.id) ? "false" : "true"}" aria-label="Modifier le calculateur de ${esc(m.nom)}" title="Modifier le calculateur">${icon("edit")}</button>`;
}

export function bindNotes(el) {
  $$(".notes", el).forEach((card) => {
    const mid = card.dataset.m, out = $(".nres", card);
    const cur = () => Object.fromEntries($$("input", card).map((i) => [i.dataset.k, i.value]));
    out.innerHTML = calcRes(mid, cur());
    card.addEventListener("input", () => { const v = cur(); out.innerHTML = calcRes(mid, v); setEntry("notes", mid, { v }); commit(); });
  });
  $$("form.gr-form", el).forEach((f) => {
    bindGradingEditor(f);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = M(f.dataset.m);
      let grading;
      try { grading = readGradingEditor(f); } catch (err) { return toast(err.message); }
      if (!grading && !m.grading) return toast("Ajoute au moins une épreuve avec un nom et un poids");
      if (!grading && !(await appConfirm("Aucune épreuve : le calculateur de cette matière sera supprimé. Continuer ?"))) return;
      try { await saveMatiere({ ...m, grading }); toast("Calculateur enregistré"); await loadData(); rerenderKeep(); }
      catch (err) { toast("Erreur : " + err.message); }
    });
  });
}

export function notes() {
  // Les matières qui ont un calculateur, plus les matières actives qui n'en ont pas encore (pour pouvoir le créer).
  const actives = new Set(activeMatieres().map((m) => m.id));
  const list = D.matieres.filter((m) => calcFor(m.id) || actives.has(m.id));
  return { html: `<h1>Notes &amp; CC</h1><p class="muted">Entre tes notes au fil du semestre : le calcul suit exactement la formule de chaque UE (les deuxièmes chances remplacent les notes plus faibles). Tout est sauvegardé. Sous chaque matière, tu peux créer ou modifier le calculateur : épreuves, coefficients, 2e chance.</p>
    ${list.map((m) => `<h2 style="display:flex;gap:10px;align-items:center">${pencilHtml(m)}<i class="dot" style="--c:${m.couleur}"></i>${esc(m.nom)}</h2>${calcFor(m.id) ? notesCard(m.id) : ""}${gradingFormHtml(m)}`).join("") || '<div class="empty">Aucune matière pour l\'instant. Ajoute-en une dans <a href="#/compte">Compte</a>, puis crée son calculateur ici.</div>'}`, after: bindNotes };
}
