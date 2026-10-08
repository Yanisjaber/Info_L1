import { icon } from "../../core/components/icons.js";
import { ring } from "../../core/components/ring.js";
import { C, D, M } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { daysUntil, fmtLong, plural } from "../../core/utils/format.js";
import { strip } from "../admin/admin-form.utils.js";
import { cd, fmtPoids } from "../dashboard/dashboard.utils.js";
import { seanceHasContent, toMin } from "../edt/edt.utils.js";
import { lineChartSvg } from "./elo.components.js";
import { CARD_MINUTES, EXO_MINUTES, QCM_MINUTES, fmtDuration } from "../eval/eval.utils.js";

// Page "Se préparer" d'un CC : remplace le simple bouton "Éval blanche" de la popup CC par un
// vrai écran de révision scopé au programme de l'échéance (coverage %, évolution dans le temps via
// snapshotCcProg, détail par séance avec accès direct QCM/exercices/cartes de chacune).
export function ccPrepPage(ccId) {
  const ev = D.cal.evenements.find((e) => e.id === ccId);
  if (!ev) return { html: `<div class="empty">Échéance introuvable.</div>` };
  const m = M(ev.matiere); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const mid = ev.matiere, want = new Set(ev.seances || []), c = C(mid);
  const seances = c.seances.filter((s) => want.has(s.id));
  if (!seances.length) {
    return { html: `<div class="crumbs"><a href="#/cal">Calendrier</a> › Se préparer</div><h1 style="margin:0">${esc(ev.titre)}</h1>
      <div class="empty" style="margin-top:14px">Aucune séance au programme pour cette échéance — renseigne-les depuis CC &amp; notes → cette échéance → séances.</div>` };
  }
  const filled = seances.every(seanceHasContent);
  // Cœur de la page : pas un pourcentage abstrait mais le vrai reliquat — chaque QCM pas encore
  // réussi au dernier essai, chaque exercice pas encore "ok", chaque carte pas encore maîtrisée
  // (box≥4), groupés par séance. "Prêt" = cette liste est vide, pas un seuil arbitraire.
  const bySeance = seances.map((s) => {
    const qs = c.qcm.filter((q) => q.seance === s.id), exs = c.exercices.filter((e) => e.seance === s.id), fs = c.flashcards.filter((f) => f.seance === s.id);
    const remQ = qs.filter((q) => !state.qcm[q.id]?.last);
    const remE = exs.filter((e) => state.exos[e.id]?.v !== "ok");
    const remF = fs.filter((f) => !(state.cards[f.id]?.box >= 4));
    // Charge de travail réelle, pas juste un compte de notions : un QCM (réponse instantanée, pur
    // par cœur) ne pèse pas comme un exercice (12 à 25 min selon la difficulté) — sans ça, 300 QCM
    // quasi identiques gonflent le total autant qu'un vrai exercice de 25 min chacun.
    const remMin = remQ.length * QCM_MINUTES + remE.reduce((a, e) => a + (EXO_MINUTES[e.difficulte] || EXO_MINUTES[1]), 0) + remF.length * CARD_MINUTES;
    // Durée réelle du cours (créneau EDT lié à cette séance, s'il y en a un — plusieurs possibles
    // si le cours a été redécoupé) ; 90 min de repli (créneau CM/TD/TP standard) sinon, pour que
    // l'objectif de révision reste calculable même sur une séance créée à la main sans EDT.
    const edtMin = D.edt.events.filter((e) => e.sid === s.id && e.m === mid).reduce((a, e) => a + Math.max(0, toMin(e.e) - toMin(e.s)), 0);
    const courseMin = edtMin || 90;
    return { s, total: qs.length + exs.length + fs.length, remQ, remE, remF, remN: remQ.length + remE.length + remF.length, remMin, courseMin };
  });
  const totalItems = bySeance.reduce((a, x) => a + x.total, 0);
  const remainingN = bySeance.reduce((a, x) => a + x.remN, 0);
  const remainingMin = bySeance.reduce((a, x) => a + x.remMin, 0);
  // Règle de révision classique : 1h de cours ≈ 1h30 de travail (QCM+exercices+cartes) pour bien
  // maîtriser une séance — sert de repère pour juger si la charge restante est "normale" ou pas,
  // plutôt que de laisser un chiffre d'heures sans rien pour le comparer.
  const targetMin = bySeance.reduce((a, x) => a + x.courseMin, 0) * 1.5;
  const covPct = totalItems ? Math.round(((totalItems - remainingN) / totalItems) * 100) : 0;
  const ready = totalItems > 0 && remainingN === 0;
  const hist = (state.ccProg[ev.id]?.history || []).map((h) => ({ ts: h.ts, v: h.pct }));
  const histDelta = hist.length ? hist[hist.length - 1].v - hist[0].v : 0;
  const checklist = bySeance.filter((x) => x.remN > 0).map(({ s, remQ, remE, remF, remN, remMin }, i) => `
    <details class="card" style="margin:10px 0" ${i < 2 ? "open" : ""}>
      <summary style="cursor:pointer"><b>${esc(s.type)} ${s.numero}</b> — ${esc(strip(s.titre))} <span class="tiny muted">${plural(remN, "notion")} restante${remN > 1 ? "s" : ""} · ~${fmtDuration(remMin)}</span></summary>
      <div class="list" style="margin-top:6px">
        ${remQ.map((q) => `<a class="item" href="#/qcm?m=${mid}&s=${s.id}"><span class="chip gr">QCM</span><span class="sp">${q.q}</span></a>`).join("")}
        ${remE.map((e) => `<a class="item" href="#/m/${mid}/exos?s=${s.id}"><span class="chip gr">Exo</span><span class="sp">${esc(e.titre)}</span></a>`).join("")}
        ${remF.length ? `<a class="item" href="#/cards?m=${mid}&s=${s.id}"><span class="chip gr">Cartes</span><span class="sp">${plural(remF.length, "carte")} pas encore maîtrisée${remF.length > 1 ? "s" : ""}</span></a>` : ""}
      </div>
    </details>`).join("");
  return {
    html: `<div class="crumbs"><a href="#/cal">Calendrier</a> › Se préparer</div>
    <h1 style="margin:0;display:flex;align-items:center;gap:10px"><i class="dot" style="--c:${m.couleur}"></i>${esc(ev.titre)}</h1>
    <div class="row small muted" style="gap:6px;flex-wrap:wrap;margin-top:4px">${esc(m.nom)} · ${esc(fmtLong(ev.date))}<span class="chip gr">${esc(fmtPoids(ev.poids))}</span><span class="chip ${daysUntil(ev.date) < 0 ? "gr" : "ok"}">${cd(ev)}</span></div>

    ${ready
      ? `<div class="card" style="margin:16px 0;border-left:4px solid var(--ok);display:flex;align-items:center;gap:16px"><div style="font-size:2.2rem">🎯</div><div><b style="font-size:1.1rem">Prêt pour l'épreuve.</b><div class="small muted">Tout le programme est maîtrisé — vise le 20/20.</div></div><div class="sp"></div><a class="btn pri" href="#/eval?m=${mid}&cc=${esc(ev.id)}">${icon("clock")}Passer l'éval blanche</a></div>`
      : `<div class="card row" style="gap:22px;margin:16px 0;align-items:center;flex-wrap:wrap">${ring(covPct, m.couleur)}<div><div style="font-size:1.6rem;font-weight:800">${covPct}% prêt</div><div class="small muted">${plural(remainingN, "notion")} encore à maîtriser avant d'être prêt pour l'épreuve.</div></div><div class="sp"></div><div style="text-align:right"><div class="tiny muted">Objectif <span title="Règle classique : 1h de cours ≈ 1h30 de révision pour bien la maîtriser">(1h cours = 1h30 app)</span></div><div style="font-size:1.3rem;font-weight:700">${fmtDuration(targetMin)}</div></div><div style="text-align:right"><div class="tiny muted">Il reste</div><div style="font-size:1.3rem;font-weight:700;color:${remainingMin > targetMin ? "var(--ko)" : "var(--text)"}">${fmtDuration(remainingMin)}</div></div></div>`}
    ${!filled ? `<div class="note" style="margin-bottom:14px">Certaines séances au programme n'ont pas encore de cours rédigé — le reliquat ne porte que sur les QCM/cartes/exercices déjà en place pour elles.</div>` : ""}

    ${checklist ? `<h3>Ce qu'il te reste</h3>${checklist}` : ""}

    <h3 style="margin-top:20px">Évolution${hist.length > 1 ? ` <span class="small" style="font-weight:700;color:var(--ok)">${histDelta >= 0 ? "+" : ""}${histDelta}%</span><span class="tiny muted"> depuis le début du suivi</span>` : ""}</h3>
    <div class="card">${hist.length ? lineChartSvg(hist, { w: 800, h: 260 }) : `<div class="empty" style="padding:20px">Entraîne-toi sur ce programme pour voir ta progression.</div>`}</div>`,
  };
}
