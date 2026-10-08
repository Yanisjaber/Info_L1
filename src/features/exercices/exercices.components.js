import { icon } from "../../core/components/icons.js";
import { C, seanceOf } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { $$, esc } from "../../core/utils/dom.js";
import { renderMath } from "../../core/utils/math.js";
import { TA_STYLE, strip } from "../admin/admin-form.utils.js";
import { typeColumns } from "../settings/settings.js";
import { exoState } from "./exercices.store.js";
import { expectedAnswers } from "./exercices.utils.js";
import { parse } from "../../routing/router.js";

// Toute une matière peut cumuler une centaine d'exercices (surtout depuis qu'ils viennent aussi du
// cours, voir migration CM/TD/TP) : une liste plate entièrement dépliée est devenue impossible à
// parcourir. Trois niveaux à la place : des cartes de séance (une par CM/TD/TP), une liste de
// titres repliés en cliquant une carte, et un exercice qui ne se déplie (énoncé + zone de réponse)
// qu'en cliquant son titre — `openExoId` retient lequel, un seul ouvert à la fois.
// Tri : officiels d'abord (reflètent le vrai sujet, priorité de révision), puis bonus ; au sein de
// chaque groupe, par ordre d'apparition dans le cours — les titres officiels suivent tous le format
// "Exercice N - ..." du document source, donc N == la chronologie réelle du TD/TP/CM.
function exoNum(e) {
  const m = /exercice\s+(\d+)/i.exec(e.titre || "");
  return m ? +m[1] : Infinity;
}

function sortExos(list) {
  return [...list].sort((a, b) => (b.officiel - a.officiel) || (exoNum(a) - exoNum(b)) || a.titre.localeCompare(b.titre));
}

function exoCardHtml(e, mid, open) {
  const st = state.exos[e.id]?.v, s = seanceOf(mid, e.seance);
  const isCode = e.type === "code", isTexte = e.type === "texte", isAuto = isCode || isTexte;
  const head = `<div class="row" data-a="toggleexo" data-id="${e.id}" style="cursor:pointer"><span class="chip gr">${s.type} ${s.numero}</span>${e.officiel ? '<span class="chip" title="Exercice extrait du sujet de TD fourni">Officiel</span>' : ""}<span class="chip" title="difficulté">${"★".repeat(e.difficulte)}${"·".repeat(3 - e.difficulte)}</span>${isCode ? '<span class="chip gr">code Python</span>' : isTexte ? '<span class="chip gr">réponse courte</span>' : ""}<div class="sp"></div>${st === "ok" ? '<span class="chip ok">réussi</span>' : st === "redo" ? '<span class="chip wa">à refaire</span>' : ""}</div>
    <h3 data-a="toggleexo" data-id="${e.id}" style="margin:.6em 0 0;cursor:pointer">${e.titre}</h3>`;
  if (!open) return `<div class="card" style="margin:14px 0" id="${e.id}">${head}</div>`;
  return `<div class="card" style="margin:14px 0" id="${e.id}">${head}<div class="prose" style="margin-top:.3em">${e.enonce}</div>
    ${e.indice ? `<details><summary>Indice</summary><div class="prose">${e.indice}</div></details>` : ""}
    ${isCode ? codeBlockHtml(e) : isTexte ? texteBlockHtml(e, true) : ""}
    <details><summary>Voir le corrigé</summary>${expectedAnswersHtml(e)}<div class="prose">${e.corrige}</div>${isAuto ? "" : `<div class="row" style="margin-top:12px"><span class="small muted">Alors ?</span><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="ok">Je l'avais</button><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="redo">À refaire</button></div>`}</details></div>`;
}

function seanceExoCardHtml(s, L, mid) {
  const ok = L.filter((e) => state.exos[e.id]?.v === "ok").length;
  return `<a class="card" href="#/m/${mid}/exos?s=${s.id}" style="display:block;text-decoration:none;color:inherit">
    <div class="row nowrap"><b>${esc(s.type)} ${s.numero}</b><div class="sp"></div><span class="tiny ${ok === L.length ? "" : "muted"}">${ok}/${L.length} réussis</span></div>
    <div class="tiny muted" style="margin-top:4px">${esc(strip(s.titre))}</div>
  </a>`;
}

export function exosHtml(mid, sid0) {
  const q = parse().q, sid = sid0 || q.s || "";
  const c = C(mid);
  const okCount = (list) => list.filter((e) => state.exos[e.id]?.v === "ok").length;
  if (sid) {
    const s = c.seances.find((x) => x.id === sid);
    const L = sortExos(c.exercices.filter((e) => e.seance === sid));
    return `<div class="row" style="align-items:center"><a class="btn sm ghost" href="#/m/${mid}/exos">${icon("back")}Toutes les séances</a><div class="sp"></div><span class="muted small">${L.length} exercices · ${okCount(L)} réussis</span></div>
    <h2 style="margin:16px 0 2px">${s ? `${esc(s.type)} ${s.numero}` : ""}</h2>${s ? `<p class="tiny muted" style="margin:0 0 12px">${esc(strip(s.titre))}</p>` : ""}
    ${L.map((e) => exoCardHtml(e, mid, exoState.openExoId === e.id)).join("") || '<div class="empty">Aucun exercice pour cette séance.</div>'}`;
  }
  const header = `<div class="row"><span class="muted small">${c.exercices.length} exercices · ${okCount(c.exercices)} réussis au total</span></div>`;
  // Une carte par séance (pas une liste plate dépliée) : chaque exercice vient du cours qui
  // l'accompagnait, et une matière peut en cumuler des dizaines voire des centaines. Rangées en 3
  // colonnes par type (CM/TD/TP) plutôt qu'un flux unique mêlant les types dans l'ordre chronologique
  // (CSS Grid ferait un flux ligne par ligne, pas un vrai regroupement par colonne).
  const groups = c.seances.filter((s) => c.exercices.some((e) => e.seance === s.id)).map((s) => ({ s, L: c.exercices.filter((e) => e.seance === s.id) }));
  const columns = typeColumns(groups, ({ s }) => s.type);
  return `${header}<div class="row" style="align-items:flex-start;gap:14px;margin-top:12px">${columns.map((col) => `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">${col.map(({ s, L }) => seanceExoCardHtml(s, L, mid)).join("")}</div>`).join("")}</div>${groups.length ? "" : `<div class="empty">Aucun exercice pour l'instant.</div>`}`;
}

export function codeBlockHtml(e) {
  const code = state.reponses[e.id]?.value ?? e.codeStarter ?? "";
  return `<div class="field" style="margin-top:10px"><label>Ton code</label><textarea data-code-id="${e.id}" rows="10" style="${TA_STYLE}">${esc(code)}</textarea></div>
    <div class="row" style="margin-top:8px"><button class="btn sm pri" data-a="runcode" data-id="${e.id}">${icon("check")}Exécuter les tests</button></div>
    <div id="pyres-${e.id}">${exoState.codeResults[e.id] ? codeResultHtml(exoState.codeResults[e.id]) : ""}</div>`;
}

// Réponses attendues affichées en tête du corrigé (exercices "texte") : le corrigé rédigé ne les
// redonne pas toujours, alors qu'elles servent déjà à la correction auto. Formes multiples « a|b » → « a ou b ».
export function expectedAnswersHtml(e) {
  if (e.type !== "texte") return "";
  const a = expectedAnswers(e); if (!a.length) return "";
  const fmt = (r) => String(r).split("|").map((x) => `<code>${esc(x.trim())}</code>`).join(" ou ");
  return `<div class="prose"><b>${a.length > 1 ? "Réponses attendues" : "Réponse attendue"}</b>${a.length > 1 ? `<ol>${a.map((r) => `<li>${fmt(r)}</li>`).join("")}</ol>` : ` : ${fmt(a[0])}`}</div>`;
}

// Les chips ✓/✗ par sous-réponse vivent dans #txres (comme l'unique résultat de l'ancien format à
// une réponse), pas à côté de chaque champ : "Vérifier" ne patch que cette div en place (voir
// checktexte plus bas), jamais tout le bloc, donc tout ce qui doit changer après coup doit y être.
export function texteBlockHtml(e, checked) {
  const answers = expectedAnswers(e), n = Math.max(1, answers.length);
  const saved = state.reponses[e.id];
  const values = saved?.values || [];
  const showResult = checked && saved?.oks;
  const rows = Array.from({ length: n }, (_, i) => `<div class="row nowrap"${i ? ' style="margin-top:6px"' : ""}>
    ${n > 1 ? `<label class="small muted" style="min-width:84px">Réponse ${i + 1}</label>` : ""}
    <input type="text" data-texte-id="${e.id}" data-texte-idx="${i}" value="${esc(values[i] || "")}" style="flex:1" placeholder="Ta réponse…">
  </div>`).join("");
  return `<div class="field" style="margin-top:10px">${n > 1 ? "" : "<label>Ta réponse</label>"}${rows}
    <div class="row" style="margin-top:8px"><button class="btn sm pri" data-a="checktexte" data-id="${e.id}">${icon("check")}Vérifier</button></div></div>
    <div id="txres-${e.id}">${showResult ? texteResultHtml(saved.oks) : ""}</div>`;
}

export function texteResultHtml(oks) {
  if (oks.length <= 1) { const ok = !!oks[0]; return `<div class="item" style="margin-top:8px"><span class="chip ${ok ? "ok" : "ko"}">${ok ? "✓ Bonne réponse" : "✗ Ce n'est pas ça"}</span></div>`; }
  return `<div class="row small" style="margin-top:8px;gap:8px;flex-wrap:wrap">${oks.map((ok, i) => `<span class="chip ${ok ? "ok" : "ko"}">Réponse ${i + 1} ${ok ? "✓" : "✗"}</span>`).join("")}</div>`;
}

export function codeResultHtml(r) {
  const total = r.results.length, passed = r.results.filter((x) => x.ok).length;
  return `${r.error ? `<div class="warn prose" style="padding:8px 12px;margin-top:8px"><b>Erreur :</b><pre style="white-space:pre-wrap;margin:4px 0 0">${esc(r.error)}</pre></div>` : ""}
    ${total ? `<div class="list" style="margin-top:8px">${r.results.map((x) => `<div class="item"><span class="chip ${x.ok ? "ok" : "ko"}">${x.ok ? "✓" : "✗"}</span><span>${esc(x.desc)}</span></div>`).join("")}</div><p class="small muted" style="margin-top:6px">${passed}/${total} tests réussis</p>` : ""}
    ${r.stdout ? `<details style="margin-top:8px"><summary>Sortie</summary><pre style="white-space:pre-wrap">${esc(r.stdout)}</pre></details>` : ""}`;
}

export function bindExos(el) { $$("details", el).forEach((d) => d.addEventListener("toggle", () => d.open && renderMath(d))); }
