import { C, M, activeMatieres } from "../../core/services/app-data.js";
import { state, sync } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { strip } from "../admin/admin-form.utils.js";
import { eloCardHtml, sparklineSvg } from "./elo.components.js";
import { ELO_MAX_PER_MATIERE, coverage, getElo, hardMastery, tierFor } from "./elo.utils.js";

export function eloPage() {
  if (!sync.user) return { html: `<h1>Elo</h1><div class="empty">Connecte-toi pour voir ton niveau.</div>` };
  const ms = activeMatieres();
  if (!ms.length) return { html: `<h1>Elo</h1><div class="empty">Ajoute une matière (et entraîne-toi) pour voir ton niveau.</div>` };
  const total = ms.reduce((a, m) => a + getElo(m.id), 0);
  const scale = ELO_MAX_PER_MATIERE * ms.length;
  const tier = tierFor(total, scale);
  return {
    html: `<h1>Elo</h1><p class="muted">Ton niveau de maîtrise, matière par matière : 1000 points quand tout le cours d'une matière est couvert, jusqu'à 500 de plus si tu maîtrises aussi les QCM et exercices de niveau difficile. Le score global est la somme de tes ${ms.length} matières actives — ${ms.length * 1000} points quand tout le semestre est connu, ${scale} au maximum.</p>
    <div class="card row" style="gap:22px;margin:16px 0;align-items:center">
      <div style="font-size:2.6rem;font-weight:800">${total}<span class="small muted" style="font-weight:600"> / ${scale}</span></div>
      <div><span class="chip ${tier.cls}">${esc(tier.name)}</span><div class="tiny muted" style="margin-top:4px">Niveau global (somme des matières actives)</div></div>
    </div>
    <div class="grid g2" style="gap:14px">${ms.map(eloCardHtml).join("")}</div>`,
  };
}

export function eloDetail(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const rating = getElo(mid), cov = coverage(mid), hard = hardMastery(mid), tier = tierFor(rating);
  const base = Math.round(1000 * cov), bonus = Math.round(500 * hard);
  const hist = state.elo[mid]?.history || [];
  const pts = hist.map((h) => ({ ts: h.ts, v: h.rating }));
  const evals = Object.values(state.evals).filter((e) => e.mid === mid).sort((a, b) => a.ts - b.ts);
  const evalPts = evals.map((e) => ({ ts: e.ts, v: e.score20 }));
  const c = C(mid);
  const seances = c.seances.map((s) => {
    const qs = c.qcm.filter((q) => q.seance === s.id), exs = c.exercices.filter((e) => e.seance === s.id), fs = c.flashcards.filter((f) => f.seance === s.id);
    const okQ = qs.filter((q) => state.qcm[q.id]?.last).length;
    const okE = exs.filter((e) => state.exos[e.id]?.v === "ok").length;
    const okF = fs.filter((f) => state.cards[f.id]?.box >= 4).length;
    const total = qs.length + exs.length + fs.length;
    return { s, pct: total ? Math.round(((okQ + okE + okF) / total) * 100) : null, total };
  }).filter((x) => x.total > 0);
  return {
    html: `<div class="crumbs"><a href="#/elo">Elo</a> › ${esc(m.court)}</div>
    <h1 style="margin:0">${esc(m.nom)}</h1>
    <div class="card row" style="gap:26px;margin:14px 0;align-items:center;flex-wrap:wrap">
      <div><div style="font-size:2.6rem;font-weight:800">${rating}<span class="small muted" style="font-weight:600"> / ${ELO_MAX_PER_MATIERE}</span></div><span class="chip ${tier.cls}">${esc(tier.name)}</span></div>
      <div class="sp"></div>
      <div style="text-align:right"><div class="tiny muted">Cours couvert</div><div style="font-size:1.3rem;font-weight:700">${base} <span class="tiny muted">/ 1000</span></div></div>
      <div style="text-align:right"><div class="tiny muted">Bonus niveau difficile</div><div style="font-size:1.3rem;font-weight:700">${bonus} <span class="tiny muted">/ 500</span></div></div>
    </div>
    <h3>Évolution du niveau</h3>
    <div class="card">${sparklineSvg(pts, { w: 800, h: 180 })}</div>
    ${evalPts.length > 1 ? `<h3 style="margin-top:20px">Notes aux évals blanches (/20)</h3><div class="card">${sparklineSvg(evalPts, { w: 800, h: 140, min: 0, max: 20 })}</div>` : ""}
    <h3 style="margin-top:20px">Par séance <span class="tiny muted">(dans l'ordre du cours)</span></h3>
    <div class="card list">${seances.map(({ s, pct }) => `<a class="item" href="#/c/${mid}/${s.id}"><div class="sp"><b>${esc(s.type)} ${s.numero}</b> — ${esc(strip(s.titre))}<div class="bar" style="margin-top:6px"><i style="width:${pct}%;background:${m.couleur}"></i></div></div><span class="tiny muted" style="margin-left:10px">${pct}%</span></a>`).join("") || '<div class="empty">Pas encore de données.</div>'}</div>`,
  };
}
