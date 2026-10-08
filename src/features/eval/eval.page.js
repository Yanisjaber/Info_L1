import { icon } from "../../core/components/icons.js";
import { NIV_LABEL, matCardsHtmlSingle } from "../../core/components/setup-pickers.js";
import { tag } from "../../core/components/tag.js";
import { toast } from "../../core/components/toast.js";
import { D, M, seanceOf } from "../../core/services/app-data.js";
import { dataState } from "../../core/services/app-data.store.js";
import { state } from "../../core/services/store.js";
import { $, esc } from "../../core/utils/dom.js";
import { fmt1, fmtMMSS } from "../../core/utils/format.js";
import { TA_STYLE } from "../admin/admin-form.utils.js";
import { ccOptionsHtml, evalTicketHtml, texteReviewHtml } from "./eval.components.js";
import { finishEval, startEval } from "./eval.session.js";
import { evalState } from "./eval.store.js";
import { EXO_MINUTES, evalScore, poolE } from "./eval.utils.js";
import { codeBlockHtml, codeResultHtml, expectedAnswersHtml, texteBlockHtml } from "../exercices/exercices.components.js";
import { bindTicket } from "../quiz/quiz.components.js";
import { balanced } from "../quiz/quiz.utils.js";
import { routerState } from "../../routing/router.store.js";

export function evalSetup(q) {
  const mid = q.m && M(q.m) ? q.m : (dataState.IDS[0] || D.matieres[0]?.id);
  if (!mid) return { html: `<h1>Éval blanche</h1><div class="empty">Ajoute d'abord une matière avec des exercices.</div>` };
  const m = M(mid);
  const ccSel = q.cc && D.cal.evenements.some((e) => e.id === q.cc && e.matiere === mid) ? q.cc : "";
  const last = Object.values(state.evals).sort((a, b) => b.ts - a.ts).slice(0, 6);
  return {
    html: `<h1>Éval blanche</h1><p class="muted">Choisis une durée et un niveau, ou cible directement un CC dont tu as renseigné les séances au programme (CC & notes → l'échéance → séances). L'app compose un sujet d'exercices à réponse rédigée qui tient dans ce temps, sans correction avant la fin.</p>
    <form class="card" id="ef" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><label>Matière</label>${matCardsHtmlSingle(mid)}</div>
      ${evalTicketHtml(mid, m.eval.minutes, ccSel)}
      <div class="row"><button class="btn pri" type="submit">Démarrer l'épreuve</button><span class="muted small" id="epc"></span></div></form>
    ${last.length ? `<h3>Historique</h3><div class="card list">${last.map((e) => `<div class="item"><span class="badge">${fmt1(e.score20)}</span><div class="sp"><b>${esc(M(e.mid)?.court || e.mid)}</b> — ${fmt1(e.score20)}/20 (${e.ok}/${e.n})<div class="tiny muted">${new Date(e.ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</div></div></div>`).join("")}</div>` : ""}`,
    after: (el) => {
      const f = $("#ef", el);
      routerState.cleanup = bindTicket(el);
      const vals = () => { const fd = new FormData(f); return { mid: fd.get("m"), niv: +fd.get("niv"), mins: +fd.get("t") || 30, ccId: fd.get("cc") || "" }; };
      const ccOf = (v) => (v.ccId ? D.cal.evenements.find((e) => e.id === v.ccId) : null);
      const scopeOf = (v) => { const cc = ccOf(v); return cc?.seances?.length ? new Set(cc.seances) : null; };
      const updTicket = (v) => {
        $("#tk-dur", el).textContent = `${v.mins} min`;
        $("#tk-eniv", el).textContent = NIV_LABEL[v.niv];
        $("#tk-cc", el).textContent = ccOf(v)?.titre || "toute la matière";
      };
      const upd = () => {
        const v = vals(); updTicket(v);
        const avail = poolE({ mids: [v.mid], niv: v.niv, seances: scopeOf(v) }).length;
        const n = Math.max(1, Math.round(v.mins / EXO_MINUTES[v.niv]));
        $("#epc", el).textContent = avail ? `~${Math.min(n, avail)} exercice(s) prévu(s) (${avail} au total)` : "Aucun exercice disponible avec ces critères.";
      };
      f.addEventListener("change", (e) => {
        if (e.target.name === "m") { f.t.value = M(e.target.value).eval.minutes; $("#cc-list", el).innerHTML = ccOptionsHtml(e.target.value); }
        upd();
      });
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = vals(), seances = scopeOf(v);
        const pool = poolE({ mids: [v.mid], niv: v.niv, seances });
        if (!pool.length) return toast("Aucun exercice disponible avec ces critères.");
        const n = Math.min(Math.max(1, Math.round(v.mins / EXO_MINUTES[v.niv])), pool.length);
        const chosen = balanced(pool.slice(0, n), n);
        const cc = ccOf(v);
        startEval(chosen, { minutes: v.mins, title: "Éval blanche — " + (cc ? `${cc.titre} (${M(v.mid).court})` : M(v.mid).court), mid: v.mid });
      });
      upd();
    },
  };
}

export function evalRunView() {
  if (evalState.EV.done) return evalState.EV.grading ? evalGradingView() : evalResult();
  const it = evalState.EV.items[evalState.EV.i], e = it.e, n = evalState.EV.items.length, last = evalState.EV.i === n - 1;
  const grid = `<div class="qgrid" aria-label="Navigation entre exercices">${evalState.EV.items.map((y, k) => `<button data-a="egoto" data-i="${k}" class="${k === evalState.EV.i ? "cur" : ""}">${k + 1}</button>`).join("")}</div>`;
  return {
    html: `<div class="qhead"><div class="crumbs" style="margin:0"><a href="#/eval">← Quitter</a></div><div class="sp"></div><span class="timer" id="tm" aria-live="off">--:--</span><span class="chip gr">${evalState.EV.i + 1} / ${n}</span></div>
    <div class="card"><div class="row" style="margin-bottom:4px">${tag(e.mid)}<span class="chip gr">${seanceOf(e.mid, e.seance).type} ${seanceOf(e.mid, e.seance).numero}</span><span class="chip" title="difficulté">${"★".repeat(e.difficulte)}${"·".repeat(3 - e.difficulte)}</span></div>
      <h3 style="margin:.6em 0 .3em">${esc(e.titre)}</h3><div class="prose">${e.enonce}</div>
      ${e.type === "code" ? codeBlockHtml(e) : e.type === "texte" ? texteBlockHtml(e, false) : ""}
      <div class="row" style="margin-top:18px"><button class="btn" data-a="eprev" ${evalState.EV.i === 0 ? "disabled" : ""}>${icon("back")}Précédent</button><div class="sp"></div>
        ${last ? `<button class="btn pri" data-a="efinish">Terminer l'épreuve</button>` : `<button class="btn pri" data-a="enext">Suivant ${icon("arrow")}</button>`}
      </div></div>
    <div class="card" style="margin-top:14px"><div class="row" style="margin-bottom:8px"><b>Exercices</b><div class="sp"></div><button class="btn sm" data-a="efinish">Terminer</button></div>${grid}</div>`,
    after: () => {
      const tick = () => { const left = evalState.EV.deadline - Date.now(); const t = $("#tm"); if (t) { t.textContent = fmtMMSS(left); t.classList.toggle("low", left < 60000); } if (left <= 0) finishEval(true); };
      tick(); const id = setInterval(tick, 500); routerState.cleanup = () => clearInterval(id);
    },
  };
}

function evalGradingView() {
  return { html: `<h1>${esc(evalState.EV.title)}</h1><div class="empty">${icon("clock")} Correction en cours — exécution de tous les exercices…</div>` };
}

// Revue d'une copie d'éval passée, à partir du snapshot figé au moment du rendu (pas de l'état
// courant des exercices, qui a pu bouger depuis) — accessible depuis l'historique même longtemps après.
export function evalReviewPage(id) {
  const rec = state.evals[id];
  if (!rec) return { html: `<div class="empty">Cette copie n'existe plus (supprimée).</div>` };
  const m = M(rec.mid);
  const items = rec.items || [];
  return {
    html: `<div class="crumbs"><a href="#/m/${rec.mid}/train">${esc(m?.court || rec.mid)}</a> › Copie</div>
    <h1 style="margin:0">Copie — ${esc(m?.nom || rec.mid)}</h1>
    <div class="card row" style="gap:26px;margin:14px 0"><div><div class="score">${fmt1(rec.score20)}<span class="muted" style="font-size:1.2rem"> / 20</span></div><div class="muted">${rec.ok} / ${rec.n} réussis · ${Math.floor(rec.dur / 60)} min ${rec.dur % 60} s · ${new Date(rec.ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</div></div></div>
    ${items.length ? items.map((snap, k) => {
      const e = D.E.find((x) => x.id === snap.eid);
      if (!e) return `<div class="card" style="margin:12px 0"><div class="row"><span class="chip gr">Ex. ${k + 1}</span></div><p class="small muted" style="margin:8px 0 0">Cet exercice a été supprimé depuis.</p></div>`;
      const se = seanceOf(e.mid, e.seance);
      return `<div class="card" style="margin:12px 0"><div class="row"><span class="chip ${snap.mark === "ok" ? "ok" : snap.mark === "redo" ? "wa" : "gr"}">${snap.mark === "ok" ? "réussi" : snap.mark === "redo" ? "à refaire" : "non noté"}</span><span class="chip gr">${se.type} ${se.numero}</span><div class="sp"></div><span class="tiny muted">Ex. ${k + 1}</span></div>
      <h3 style="margin:.6em 0 .3em">${esc(e.titre)}</h3><div class="prose">${e.enonce}</div>
      ${e.type === "code" ? `<div class="field" style="margin-top:10px"><label>Ta réponse</label><pre style="${TA_STYLE};white-space:pre-wrap">${esc(snap.code || "(rien de soumis)")}</pre></div>${snap.results ? codeResultHtml(snap.results) : ""}`
        : e.type === "texte" ? `<div class="field" style="margin-top:10px">${texteReviewHtml(e, snap)}</div>` : ""}
      <details style="margin-top:10px" open><summary>Voir le corrigé</summary><div style="margin-top:8px">${expectedAnswersHtml(e)}</div><div class="prose" style="margin-top:8px">${e.corrige}</div></details>
      </div>`;
    }).join("") : `<div class="empty">Le détail de cette copie n'a pas été enregistré (essai antérieur à cette fonctionnalité).</div>`}`,
  };
}

function evalResult() {
  const dur = Math.round((evalState.EV.end - evalState.EV.start) / 1000), { n, ok, marked } = evalScore(), s20 = (ok / n) * 20;
  return {
    html: `<h1>${esc(evalState.EV.title)} — correction</h1>${evalState.EV.timeout ? '<div class="warn prose" style="padding:10px 14px"><b>Temps écoulé —</b> l\'épreuve a été rendue et corrigée automatiquement.</div>' : '<p class="muted">Tous les exercices ont été corrigés automatiquement à partir de ta dernière version enregistrée.</p>'}
    ${marked === n ? `<div class="card row" style="gap:26px;margin:14px 0"><div><div class="score">${fmt1(s20)}<span class="muted" style="font-size:1.2rem"> / 20</span></div><div class="muted">${ok} / ${n} réussis · ${Math.floor(dur / 60)} min ${dur % 60} s</div></div></div>` : ""}
    <div class="row" style="margin:14px 0"><a class="btn" href="#/eval">Nouvelle session</a><a class="btn ghost" href="#/">Accueil</a></div>
    ${evalState.EV.items.map((it, k) => { const e = it.e, se = seanceOf(e.mid, e.seance), isAuto = e.type === "code" || e.type === "texte"; return `<div class="card" style="margin:12px 0" id="ev-${k}"><div class="row"><span class="chip ${it.mark === "ok" ? "ok" : it.mark === "redo" ? "wa" : "gr"}">${it.mark === "ok" ? "réussi" : it.mark === "redo" ? "à refaire" : "à corriger"}</span>${tag(e.mid)}<span class="chip gr">${se.type} ${se.numero}</span><div class="sp"></div><span class="tiny muted">Ex. ${k + 1}</span></div>
      <h3 style="margin:.6em 0 .3em">${esc(e.titre)}</h3><div class="prose">${e.enonce}</div>
      ${e.type === "code" ? codeBlockHtml(e) : e.type === "texte" ? texteBlockHtml(e, true) : ""}
      ${e.indice ? `<details style="margin-top:10px"><summary>Indice</summary><div class="prose" style="margin-top:8px">${e.indice}</div></details>` : ""}
      <details style="margin-top:10px" ${it.mark ? "open" : ""}><summary>Voir le corrigé</summary><div style="margin-top:8px">${expectedAnswersHtml(e)}</div><div class="prose" style="margin-top:8px">${e.corrige}</div></details>
      ${isAuto ? "" : `<div class="row" style="margin-top:12px"><button class="btn sm ${it.mark === "ok" ? "pri" : ""}" data-a="emark" data-i="${k}" data-v="ok">${icon("check")}Réussi</button><button class="btn sm ${it.mark === "redo" ? "pri" : ""}" data-a="emark" data-i="${k}" data-v="redo">À refaire</button></div>`}
    </div>`; }).join("")}`,
  };
}
