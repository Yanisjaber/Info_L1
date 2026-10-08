import { icon } from "../../core/components/icons.js";
import { D, M, activeMatieres, periodeLabel } from "../../core/services/app-data.js";
import { stats } from "../../core/services/stats.js";
import { sync } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { fmtDate } from "../../core/utils/format.js";
import { cd, fmtPoids, nearestEvent, nextEvents, prioScore } from "./dashboard.utils.js";
import { edtHome } from "../edt/edt.components.js";
import { ELO_MAX_PER_MATIERE, getElo, tierFor } from "../elo/elo.utils.js";
import { todoPreviewCard } from "../todos/todos.components.js";

export function home() {
  const ne = nextEvents(1)[0];
  const ms = activeMatieres();
  const hiddenH1 = `<h1 class="sr-only">${ne ? esc(`${M(ne.matiere).court} — ${ne.titre}`) : esc(periodeLabel())}</h1>`;
  const onboard = !sync.user
    ? `<div class="card" style="margin-bottom:16px;border-left:4px solid var(--acc)"><b>Connecte-toi pour voir tes matières et tes cours.</b><p class="small muted" style="margin:4px 0 10px">Chaque compte a ses propres matières, cours, QCM et emploi du temps.</p><a class="btn pri" href="#/compte">${icon("user")}Se connecter / créer un compte</a></div>`
    : !ms.length
      ? `<div class="card" style="margin-bottom:16px;border-left:4px solid var(--acc)"><b>${D.matieres.length ? "Aucune matière active." : "Aucune matière pour l'instant."}</b><p class="small muted" style="margin:4px 0 10px">${D.matieres.length ? "Toutes tes matières sont archivées — remets-en une active, ou crées-en une nouvelle." : "Ajoute ta première matière depuis les paramètres."}</p><a class="btn pri" href="#/compte">${icon("edit")}${D.matieres.length ? "Gérer mes matières" : "Ajouter une matière"}</a></div>`
      : "";
  if (!sync.user || !ms.length) return { html: `<h1 class="sr-only">${esc(periodeLabel())}</h1>${onboard}` };

  const up = nextEvents(5).map((e) => `<a class="item" href="#/cal"><span class="badge" style="--acc:${M(e.matiere).couleur};background:color-mix(in srgb,${M(e.matiere).couleur} 15%,var(--surface));color:${M(e.matiere).couleur}">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(M(e.matiere).court)}</b> — ${esc(e.titre)}<div class="tiny muted">${esc(fmtPoids(e.poids))} · ${cd(e)}${e.statut && e.poids !== "à confirmer" ? " · <span class='chip wa'>date provisoire</span>" : ""}</div></div></a>`).join("");

  const avgProg = Math.round(ms.reduce((a, m) => a + stats(m.id).prog, 0) / ms.length);
  const totalElo = ms.reduce((a, m) => a + getElo(m.id), 0), eloScale = ELO_MAX_PER_MATIERE * ms.length;
  const tier = tierFor(totalElo, eloScale);

  const ranked = ms.map((m) => ({ m, p: prioScore(m.id) })).filter((x) => x.p).sort((a, b) => b.p.score - a.p.score);
  const sevOf = (mid) => { const i = ranked.findIndex((x) => x.m.id === mid); if (i < 0) return null; return i === 0 ? { cls: "ko", label: "Élevé" } : i === 1 ? { cls: "wa", label: "Moyen" } : { cls: "gr", label: "Faible" }; };

  const subjCards = ms.slice().sort((a, b) => stats(a.id).prog - stats(b.id).prog).map((m) => {
    const s = stats(m.id), elo = getElo(m.id), sev = sevOf(m.id), ev = nearestEvent(m.id);
    return `<a class="card subj" href="#/m/${m.id}" style="--c:${m.couleur}">
      <div class="row nowrap"><b>${esc(m.court)}</b><div class="sp"></div><span class="chip ${sev ? sev.cls : "gr"}">${sev ? sev.label : "—"}</span></div>
      <div class="row nowrap" style="gap:12px">
        <div class="ring" style="--v:${Math.min(100, Math.round((elo / ELO_MAX_PER_MATIERE) * 100))}" data-t="${elo}"></div>
        <div class="sp"><div class="bar"><i style="width:${s.prog}%;background:${m.couleur}"></i></div><div class="tiny muted" style="margin-top:5px">${s.prog}% avancé</div></div>
      </div>
      <div class="tiny muted" style="border-top:1px solid var(--line);padding-top:8px">${ev ? `${esc(fmtPoids(ev.poids))} · ${cd(ev)}` : "aucune échéance"}</div>
    </a>`;
  }).join("");

  return {
    html: `${hiddenH1}${onboard}
    <div class="card row" style="gap:24px;flex-wrap:wrap">
      <div class="row" style="gap:14px"><div class="ring" style="--v:${avgProg}" data-t="${avgProg}%"></div><div class="stat"><b>${avgProg}<small class="muted"> %</small></b><span>avancement moyen du semestre</span></div></div>
      <div class="row" style="gap:14px"><div class="ring" style="--v:${Math.round((totalElo / eloScale) * 100)}" data-t="${Math.round((totalElo / eloScale) * 100)}%"></div><div class="stat"><b>${totalElo}<small class="muted"> / ${eloScale}</small></b><span>Elo global · ${esc(tier.name)}</span></div></div>
      <div class="sp"></div>
      <a class="btn ghost" href="#/elo">${icon("flag")}Voir le détail Elo</a>
    </div>
    <div class="grid g2" style="margin:16px 0">
      <div class="card"><h3 style="margin-top:0">Prochaines échéances</h3><div class="list">${up || '<div class="empty">Aucune échéance.</div>'}</div><a class="btn sm ghost" href="#/cal">Tout le calendrier ${icon("arrow")}</a></div>
      ${edtHome() || `<div class="card"><h3 style="margin-top:0">Aujourd'hui</h3><div class="empty">Aucun emploi du temps importé.</div></div>`}
    </div>
    <h2>Tes matières</h2>
    <div class="grid g3">${subjCards}</div>
    ${todoPreviewCard()}`,
  };
}
