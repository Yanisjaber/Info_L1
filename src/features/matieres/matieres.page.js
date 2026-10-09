import { icon } from "../../core/components/icons.js";
import { ring } from "../../core/components/ring.js";
import { C, D, M, activeMatieres, archivedMatieres, sKey } from "../../core/services/app-data.js";
import { stats } from "../../core/services/stats.js";
import { state, sync } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { fmt1, fmtDate, pct, plural } from "../../core/utils/format.js";
import { bindExos, exosHtml } from "../exercices/exercices.components.js";
import { fileUrl } from "../files/files.js";
import { calcFor } from "../notes/grades.js";
import { typeColumns, typeLabel } from "../settings/settings.js";
import { bindNotes, gradeBadge, notesCard } from "../notes/notes.page.js";

function subjectCard(m) {
  const s = stats(m.id);
  return `<a class="card subj" href="#/m/${m.id}" style="--c:${m.couleur};--acc:${m.couleur}"><div class="row nowrap"><div><h3>${esc(m.nom)}</h3><div class="muted small">${esc(m.desc)}</div></div><div class="sp"></div>${ring(s.prog, m.couleur)}</div>${gradeBadge(m.id)}<div class="tiny muted">${plural(s.seances, "séance")} · ${plural(s.nq, "QCM", "QCM")} · ${plural(s.nf, "carte")} · ${plural(s.ne, "exercice")}</div></a>`;
}

export function subjects() {
  if (!sync.user) return { html: `<h1>Matières</h1><div class="empty">Connecte-toi pour voir tes matières.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
  const arch = archivedMatieres();
  return { html: `<h1>Matières</h1><div class="grid g2" style="margin-top:14px">${activeMatieres().map(subjectCard).join("") || `<div class="empty">Aucune matière pour l'instant.<br>Ajoutes-en une dans <a href="#/compte">Paramètres</a>.</div>`}</div>
    ${arch.length ? `<p class="small muted" style="margin-top:18px">${plural(arch.length, "matière archivée", "matières archivées")} de tes semestres terminés — <a href="#/archives">voir les archives</a>.</p>` : ""}` };
}

export function archives() {
  if (!sync.user) return { html: `<h1>Archives</h1><div class="empty">Connecte-toi pour voir tes archives.</div>` };
  const done = D.periodes.filter((p) => p.statut === "termine");
  return { html: `<h1>Archives</h1><p class="muted">Les matières de tes semestres terminés — toujours consultables (cours, QCM, cartes), juste sorties du menu principal.</p>
    ${done.map((p) => {
      const ms = D.matieres.filter((m) => m.periode === p.id);
      if (!ms.length) return "";
      return `<h2>${esc(p.nom)}</h2><div class="grid g2" style="margin-bottom:18px">${ms.map(subjectCard).join("")}</div>`;
    }).join("") || '<div class="empty">Aucun semestre terminé pour l\'instant.</div>'}` };
}

export function matiere(mid, tab) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const c = C(mid), s = stats(mid);
  const tabs = [["cours", "Cours"], ["train", "S'entraîner"], ["exos", "Exercices"], ["cc", "CC & notes"]];
  let body = "";
  if (tab === "cours") {
    body = typeColumns(c.seances).map((L) => {
      return `<h3>${esc(typeLabel(L[0].type))}</h3><div class="card list">${L.map((x) => {
        const nq = c.qcm.filter((q) => q.seance === x.id).length, nf = c.flashcards.filter((f) => f.seance === x.id).length, ne = c.exercices.filter((e) => e.seance === x.id).length;
        const rd = state.read[sKey(mid, x.id)]?.v;
        return `<a class="item" href="#/c/${mid}/${x.id}"><span class="badge">${x.type}<br>${x.numero}</span><div class="sp"><b>${x.titre}</b><div class="small muted">${fmtDate(x.date)} · ${x.resume}</div><div class="tiny muted">${nq} QCM · ${nf} cartes · ${ne} exercices</div></div>${rd ? '<span class="chip ok">lu</span>' : '<span class="chip gr">à lire</span>'}</a>`;
      }).join("")}</div>`;
    }).join("");
  } else if (tab === "train") {
    // Un "point faible" doit être réellement faible, pas juste le plus bas d'un lot déjà excellent —
    // sans seuil, deux séances à 100% s'affichaient comme points faibles faute d'autre candidat.
    const WEAK_THRESHOLD = 70;
    const weak = c.seances.map((x) => { const qs = c.qcm.filter((q) => q.seance === x.id && state.qcm[q.id]); const n = qs.reduce((a, q) => a + state.qcm[q.id].n, 0), ok = qs.reduce((a, q) => a + state.qcm[q.id].ok, 0); return { x, n, acc: pct(ok, n) }; }).filter((w) => w.n >= 3 && w.acc < WEAK_THRESHOLD).sort((a, b) => a.acc - b.acc).slice(0, 3);
    const hist = Object.values(state.evals).filter((e) => e.mid === mid).sort((a, b) => b.ts - a.ts).slice(0, 5);
    body = `<div class="grid g3">
      <div class="card" style="display:flex;flex-direction:column"><h3 style="margin-top:0">${icon("cards")} Flashcards</h3><p class="small muted">${plural(s.nf, "carte")} · ${s.due} à revoir · ${s.mastered} maîtrisées.</p><a class="btn pri" style="margin-top:auto;align-self:flex-start" href="#/cards?m=${mid}">Réviser</a></div>
      <div class="card" style="display:flex;flex-direction:column"><h3 style="margin-top:0">${icon("check")} QCM</h3><p class="small muted">${plural(s.nq, "question")} avec correction détaillée. ${s.answered} déjà vues, ${s.acc}% de réussite.</p><a class="btn pri" style="margin-top:auto;align-self:flex-start" href="#/qcm?m=${mid}">Lancer un QCM</a></div>
      <div class="card" style="display:flex;flex-direction:column"><h3 style="margin-top:0">${icon("clock")} Éval blanche</h3><p class="small muted">Sujet chronométré d'exercices à réponse rédigée, ${m.eval.minutes} min par défaut, noté sur 20.</p><a class="btn pri" style="margin-top:auto;align-self:flex-start" href="#/eval?m=${mid}">Passer l'éval</a></div></div>
      ${weak.length ? `<h3>Points faibles</h3><div class="card list">${weak.map((w) => `<a class="item" href="#/qcm?m=${mid}&s=${w.x.id}"><span class="badge">${w.x.type}<br>${w.x.numero}</span><div class="sp"><b>${w.x.titre}</b><div class="tiny muted">${w.acc}% de réussite sur ${w.n} réponses</div></div><span class="chip ko">${w.acc}%</span></a>`).join("")}</div>` : ""}
      ${hist.length ? `<h3>Dernières évals blanches</h3><div class="card list">${hist.map((e) => `<div class="item"><span class="badge">${fmt1(e.score20)}</span><div class="sp"><b>${fmt1(e.score20)} / 20</b> — ${e.ok}/${e.n} bonnes réponses<div class="tiny muted">${new Date(e.ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} · ${Math.round(e.dur / 60)} min</div></div><a class="btn sm ghost" href="#/eval/review/${esc(e.id)}" aria-label="Voir la copie">${icon("eye")}</a><button type="button" class="btn sm ghost" data-a="delevaL" data-id="${esc(e.id)}" aria-label="Supprimer cet essai">✕</button></div>`).join("")}</div>` : ""}`;
  } else if (tab === "exos") {
    body = exosHtml(mid, "");
  } else {
    const rem = D.cal.remarques.filter((r) => r.matiere === mid);
    // Les CC eux-mêmes (noms, poids, dates) sont dans le calculateur ci-dessous ; cette carte ne garde que le barème écrit, les remarques et la fiche PDF.
    const info = [m.cc ? `<p class="muted small" style="margin:0">${esc(m.cc)}</p>` : "", ...rem.map((r) => `<div class="note"><b>À noter —</b> ${esc(r.texte)}</div>`), m.pdfCC ? `<a class="btn sm" href="${esc(fileUrl(m.pdfCC))}" download>${icon("dl")}Fiche CC (PDF)</a>` : ""].filter(Boolean);
    body = `${info.length ? `<div class="card" style="display:grid;gap:10px;justify-items:start">${info.join("")}</div>` : ""}
      ${calcFor(mid) ? `<h3>Calculateur de note</h3>${notesCard(mid, { inline: false })}` : ""}`;
  }
  return {
    html: `<div class="crumbs"><a href="#/m">Matières</a> › ${esc(m.court)}</div>
    <div class="row nowrap" style="margin-bottom:6px"><div><h1 style="margin:0">${esc(m.nom)}</h1><div class="muted">${esc(m.desc)}</div>${gradeBadge(mid)}</div><div class="sp"></div>${ring(s.prog, m.couleur)}</div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/m/${mid}/${k}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</div>${body}`,
    after: (el) => { bindNotes(el); bindExos(el); },
  };
}
