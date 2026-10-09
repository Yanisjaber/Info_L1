import { icon } from "../../core/components/icons.js";
import { D, M, activeMatieres } from "../../core/services/app-data.js";
import { commit, setEntry, state } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { fmt1, fmtDate, fmtNote } from "../../core/utils/format.js";
import { SET } from "../settings/settings.js";
import { calcFor, clampScore, shareText } from "./grades.js";

// Couleur du segment d'une épreuve : vert si la note (ramenée sur 20) atteint la moyenne de validation, rouge sinon, rien si vide.
const tone = (val, max) => (val === "" ? "" : (+val / max) * 20 >= SET().passMark ? "ok" : "ko");

// Un segment par épreuve : sa largeur suit son coef, son nom est écrit tel quel, puis la note, puis le coef.
function segHtml(mid, [k, label, mx], share, v, epreuve) {
  const max = mx || 20, val = v[k] ?? "";
  // Date de l'échéance reliée à cette épreuve ; sinon un bouton pour lui en donner une (le formulaire s'ouvre avec l'épreuve choisie).
  const ev = D.cal.evenements.find((x) => x.matiere === mid && x.epreuve === epreuve);
  const date = ev ? `<a class="nt-date" href="#/cal" title="Voir dans le calendrier">${esc(fmtDate(ev.date))}</a>` : `<button type="button" class="nt-date" data-a="addccdate" data-m="${esc(mid)}" data-e="${esc(epreuve)}">+ Date</button>`;
  return `<label class="nt-seg ${tone(val, max)}" style="flex:${Math.max(share || 6, 6)} 1 0"><small>${esc(label)}</small><input type="number" inputmode="decimal" min="0" max="${max}" step="0.05" data-k="${k}" value="${esc(val)}" placeholder="—" aria-label="${esc(label)}"><em>${share === undefined ? "" : shareText(share)}</em>${date}</label>`;
}

// `inline` : la carte porte son propre état et sa moyenne (onglet « CC & notes » d'une matière) ; sinon la page
// Notes les affiche dans l'en-tête de la matière.
export function notesCard(mid, { inline = true } = {}) {
  const K = calcFor(mid), v = state.notes[mid]?.v || {};
  if (!K) return "";
  const owner = {}; // case de saisie → épreuve à laquelle elle appartient
  Object.entries(K.groups || {}).forEach(([ep, ids]) => ids.forEach((k) => { owner[k] = ep; }));
  return `<div class="nt-frise" data-m="${esc(mid)}">
    ${inline ? `<div class="nt-inline"><span class="nt-status" data-m="${esc(mid)}"></span><span class="nt-avg" data-m="${esc(mid)}"></span></div>` : ""}
    <div class="nt-strip">${K.champs.map((c) => segHtml(mid, c, K.shares?.[c[0]], v, owner[c[0]])).join("")}</div></div>`;
}

// État et moyenne d'une matière pour les notes saisies `v`.
function result(mid, v) {
  const r = calcFor(mid).calc(v), pass = r && r.note >= SET().passMark;
  const [txt, cls] = !r ? ["À saisir", "gr"] : r.complet ? (pass ? [SET().passLabel, "ok"] : ["Sous la moyenne", "ko"]) : [`Estimation · ${fmt1(r.poids)} % saisi`, "wa"];
  return { chip: `<span class="chip ${cls}">${esc(txt)}</span>`, avg: r ? `<span style="color:${pass ? "var(--ok)" : "var(--ko)"}">${fmtNote(r.note)}</span><small> /20</small>` : `<span class="muted">—</span>` };
}

// État et moyenne d'une matière, déjà remplis, pour les afficher ailleurs que sur la page Notes (liste des matières,
// en-tête d'une matière). Ils portent les mêmes classes que sur la page Notes : s'ils sont dans la page où l'on saisit
// les notes, ils se mettent à jour en direct. Vide si la matière n'a pas de calculateur.
export function gradeBadge(mid) {
  if (!calcFor(mid)) return "";
  const { chip, avg } = result(mid, state.notes[mid]?.v || {});
  return `<div class="nt-meta"><span class="nt-status" data-m="${esc(mid)}">${chip}</span><span class="nt-avg" data-m="${esc(mid)}">${avg}</span></div>`;
}

function paint(el, mid, v) {
  const { chip, avg } = result(mid, v), sel = `[data-m="${CSS.escape(mid)}"]`;
  $$(`.nt-status${sel}`, el).forEach((x) => { x.innerHTML = chip; });
  $$(`.nt-avg${sel}`, el).forEach((x) => { x.innerHTML = avg; });
}

// Bandeau du haut : moyenne des matières qui ont au moins une note, et nombre de matières validées.
function heroHtml() {
  const rs = D.matieres.filter((m) => calcFor(m.id)).map((m) => calcFor(m.id).calc(state.notes[m.id]?.v || {}));
  const got = rs.filter(Boolean), mean = got.length ? got.reduce((s, r) => s + r.note, 0) / got.length : null;
  const ok = rs.filter((r) => r && r.complet && r.note >= SET().passMark).length;
  return `<div><div class="nt-hero-k">Moyenne générale · matières notées</div><div class="nt-hero-big">${mean === null ? "—" : fmtNote(mean)}<small> /20</small></div></div>
    <div class="nt-hero-ue"><b>${ok}</b> / ${rs.length}<span>${esc(SET().passLabel)}</span></div>`;
}

// Crayon à côté du nom d'une matière : ouvre la pop-up de son calculateur (action « editgrading »).
function pencilHtml(m) {
  return `<button type="button" class="btn sm ghost" data-a="editgrading" data-m="${esc(m.id)}" aria-label="Modifier le calculateur de ${esc(m.nom)}" title="Modifier le calculateur">${icon("edit")}</button>`;
}

// Une note reste toujours entre 0 et le « Sur » de l'épreuve (sur 30 : pas plus de 30, sur 20 : pas plus de 20).
// Retourne true si la valeur a dû être ramenée dans ces limites.
function clampNote(input) {
  if (input.value === "") return false;
  const max = +input.max || 20, n = +input.value, ok = clampScore(n, max);
  if (n === ok) return false;
  input.value = ok;
  return true;
}

export function bindNotes(el) {
  const hero = () => { const h = $("#nt-hero", el); if (h) h.innerHTML = heroHtml(); };
  $$(".nt-frise", el).forEach((card) => {
    const mid = card.dataset.m;
    const cur = () => Object.fromEntries($$("input", card).map((i) => [i.dataset.k, i.value]));
    const tones = () => $$(".nt-seg", card).forEach((s) => { const i = $("input", s); s.classList.remove("ok", "ko"); const t = tone(i.value, +i.max || 20); if (t) s.classList.add(t); });
    const save = () => { const v = cur(); paint(el, mid, v); tones(); setEntry("notes", mid, { v }); commit(); hero(); };
    // Une note déjà enregistrée au-dessus de son « Sur » (ancienne saisie) est ramenée au maximum dès l'ouverture.
    const fixed = $$("input", card).map(clampNote).some(Boolean);
    paint(el, mid, cur());
    if (fixed) { tones(); save(); }
    card.addEventListener("input", (e) => { clampNote(e.target); save(); });
  });
  hero();
}

export function notes() {
  // Les matières qui ont un calculateur, plus les matières actives qui n'en ont pas encore (pour pouvoir le créer).
  const actives = new Set(activeMatieres().map((m) => m.id));
  const list = D.matieres.filter((m) => calcFor(m.id) || actives.has(m.id));
  const head = (m, has) => `<div class="nt-head"><h2><i class="dot" style="--c:${esc(m.couleur)}"></i>${esc(m.nom)}</h2>${has ? `<span class="nt-status" data-m="${esc(m.id)}"></span>` : ""}${pencilHtml(m)}${has ? `<span class="nt-avg" data-m="${esc(m.id)}"></span>` : ""}</div>`;
  const noCalc = (m) => `<div class="card"><p class="small muted" style="margin:0 0 10px">Pas encore de calculateur pour cette matière.</p><button type="button" class="btn pri sm" data-a="editgrading" data-m="${esc(m.id)}">Créer le calculateur</button></div>`;
  return { html: `<h1>Notes &amp; CC</h1>
    ${list.some((m) => calcFor(m.id)) ? `<div class="nt-hero" id="nt-hero">${heroHtml()}</div>` : ""}
    ${list.map((m) => { const has = !!calcFor(m.id); return head(m, has) + (has ? notesCard(m.id, { inline: false }) : noCalc(m)); }).join("") || '<div class="empty">Aucune matière pour l\'instant. Ajoute-en une dans <a href="#/compte">Compte</a>, puis crée son calculateur ici.</div>'}`, after: bindNotes };
}
