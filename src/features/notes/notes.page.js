import { icon } from "../../core/components/icons.js";
import { D, M, activeMatieres } from "../../core/services/app-data.js";
import { commit, setEntry, state } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { fmt1 } from "../../core/utils/format.js";
import { SET } from "../settings/settings.js";
import { calcFor } from "./grades.js";

// Part de l'épreuve dans la note, affichée après son nom (sauf si le nom contient déjà un « % »).
function shareHtml(label, share) {
  if (/%/.test(label) || share === undefined || (share === null && /facultativ/i.test(label))) return "";
  return ` <span style="font-weight:400">· ${share === null ? "facultative" : `${String(share).replace(".", ",")} %`}</span>`;
}

export function notesCard(mid) {
  const K = calcFor(mid), m = M(mid), v = state.notes[mid]?.v || {};
  return `<div class="card notes" data-m="${mid}" style="--acc:${m.couleur}">
    <div class="row">${K.champs.map(([k, l, mx]) => `<div class="field"><label for="n-${mid}-${k}">${esc(l)}${shareHtml(l, K.shares?.[k])}</label><input id="n-${mid}-${k}" type="number" inputmode="decimal" min="0" max="${mx || 20}" step="0.25" data-k="${k}" value="${v[k] ?? ""}" placeholder="—"></div>`).join("")}</div>
    <div class="nres" style="margin-top:12px"></div></div>`;
}

function calcRes(mid, v) {
  const r = calcFor(mid).calc(v);
  if (!r) return `<span class="muted small">Saisis tes notes (/20) pour voir ta moyenne.</span>`;
  const pass = r.note >= SET().passMark;
  return `<div class="row"><div class="score" style="font-size:2rem;color:${pass ? "var(--ok)" : "var(--ko)"}">${fmt1(r.note)}<span class="muted" style="font-size:1rem"> / 20</span></div>
    <span class="chip ${r.complet ? (pass ? "ok" : "ko") : "wa"}">${r.complet ? (pass ? esc(SET().passLabel) : "sous la moyenne") : `estimation partielle (${r.poids} % du total saisi)`}</span></div>`;
}

// Crayon à droite du nom d'une matière : ouvre la pop-up de son calculateur (action « editgrading »).
function pencilHtml(m) {
  return `<button type="button" class="btn sm ghost" data-a="editgrading" data-m="${esc(m.id)}" aria-label="Modifier le calculateur de ${esc(m.nom)}" title="Modifier le calculateur">${icon("edit")}</button>`;
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
  // Les matières qui ont un calculateur, plus les matières actives qui n'en ont pas encore (pour pouvoir le créer).
  const actives = new Set(activeMatieres().map((m) => m.id));
  const list = D.matieres.filter((m) => calcFor(m.id) || actives.has(m.id));
  const noCalc = (m) => `<div class="card"><p class="small muted" style="margin:0 0 10px">Pas encore de calculateur pour cette matière.</p><button type="button" class="btn pri sm" data-a="editgrading" data-m="${esc(m.id)}">Créer le calculateur</button></div>`;
  return { html: `<h1>Notes &amp; CC</h1><p class="muted">Entre tes notes au fil du semestre : le calcul suit exactement la formule de chaque UE (les deuxièmes chances remplacent les notes plus faibles). Tout est sauvegardé. Le crayon, à droite du nom d'une matière, ouvre son calculateur : épreuves, coefficients, 2e chance.</p>
    ${list.map((m) => `<h2 class="row nowrap" style="gap:10px"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.nom)}<div class="sp"></div>${pencilHtml(m)}</h2>${calcFor(m.id) ? notesCard(m.id) : noCalc(m)}`).join("") || '<div class="empty">Aucune matière pour l\'instant. Ajoute-en une dans <a href="#/compte">Compte</a>, puis crée son calculateur ici.</div>'}`, after: bindNotes };
}
