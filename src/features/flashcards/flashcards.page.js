import { matCardsHtml, seanceChips } from "../../core/components/setup-pickers.js";
import { tag } from "../../core/components/tag.js";
import { toast } from "../../core/components/toast.js";
import { D, sKey, seanceOf } from "../../core/services/app-data.js";
import { dataState } from "../../core/services/app-data.store.js";
import { totals } from "../../core/services/stats.js";
import { state } from "../../core/services/store.js";
import { $ } from "../../core/utils/dom.js";
import { plural } from "../../core/utils/format.js";
import { cardsTicketHtml } from "./flashcards.components.js";
import { rate } from "./flashcards.session.js";
import { cardsState } from "./flashcards.store.js";
import { CARDMODE_LABEL, hasFlash, poolF } from "./flashcards.utils.js";
import { bindTicket } from "../quiz/quiz.components.js";
import { rerender } from "../../routing/navigation.js";
import { routerState } from "../../routing/router.store.js";

export function cardsSetup(q) {
  const selM = new Set(q.m ? q.m.split(",") : dataState.IDS);
  const selS = new Set(q.s && q.m ? q.s.split(",").map((s) => sKey(q.m, s)) : []);
  const t = totals();
  return {
    html: `<h1>Flashcards</h1><p class="muted">Répétition espacée : ce que tu connais revient de moins en moins souvent, ce que tu rates revient vite. <b>${t.due}</b> à revoir aujourd'hui · ${t.nf - t.seen} nouvelles.</p>
    <form class="card" id="cf" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><label>Matières <span class="tiny">(plusieurs possibles)</span></label>${matCardsHtml(selM, (m) => D.F.filter((f) => f.mid === m.id).length, "carte")}</div>
      ${cardsTicketHtml(q.mode || "due")}
      <div class="row"><button class="btn pri" type="submit">Commencer</button><span class="muted small" id="pc"></span></div></form>`,
    after: (el) => {
      const f = $("#cf", el);
      routerState.cleanup = bindTicket(el);
      const vals = () => { const fd = new FormData(f); return { mids: fd.getAll("m"), sids: new Set(fd.getAll("s")), mode: fd.get("mode"), cnt: +fd.get("cnt") }; };
      const updTicket = (v) => {
        $("#tk-cmode", el).textContent = CARDMODE_LABEL[v.mode];
        $("#tk-ccnt", el).textContent = v.cnt === 0 ? "toutes" : `${v.cnt} / session`;
        $("#tk-csc", el).textContent = v.sids.size ? plural(v.sids.size, "séance") : "toutes les séances";
      };
      const upd = () => { const v = vals(); updTicket(v); $("#pc", el).textContent = `${poolF(v).length} cartes dans cette session`; };
      f.addEventListener("change", (e) => {
        if (e.target.name === "m") { const cur = new Set(new FormData(f).getAll("s")); $("#sc", el).innerHTML = seanceChips(new FormData(f).getAll("m"), cur, hasFlash); }
        upd();
      });
      $("#sc", el).innerHTML = seanceChips([...selM], selS, hasFlash);
      f.addEventListener("submit", (e) => { e.preventDefault(); const cards = poolF(vals()); if (!cards.length) return toast("Aucune carte à travailler avec ces critères."); cardsState.FC = { cards, i: 0, flip: false, again: new Set(), good: 0, total: cards.length, done: false }; location.hash = "#/cards/run"; });
      upd();
    },
  };
}

export function cardsView() {
  if (cardsState.FC.done || cardsState.FC.i >= cardsState.FC.cards.length) {
    cardsState.FC.done = true;
    return { html: `<h1>Session terminée</h1><div class="card" style="text-align:center"><div class="score">${cardsState.FC.good}<span class="muted" style="font-size:1.2rem"> / ${cardsState.FC.total}</span></div><p class="muted">cartes sues du premier coup · ${cardsState.FC.again.size} à revoir bientôt</p><div class="row" style="justify-content:center"><a class="btn pri" href="#/cards">Nouvelle session</a><a class="btn" href="#/">Accueil</a></div></div>` };
  }
  const f = cardsState.FC.cards[cardsState.FC.i], c = state.cards[f.id], back = cardsState.FC.flip;
  return {
    html: `<div class="qhead"><div class="crumbs" style="margin:0"><a href="#/cards">← Quitter</a></div><div class="sp"></div><span class="chip gr">${cardsState.FC.i + 1} / ${cardsState.FC.cards.length}</span></div>
    <div class="bar" style="margin-bottom:14px"><i style="width:${(cardsState.FC.i / cardsState.FC.cards.length) * 100}%"></i></div>
    <div class="row" style="margin-bottom:8px">${tag(f.mid)}<span class="chip gr">${seanceOf(f.mid, f.seance).type} ${seanceOf(f.mid, f.seance).numero}</span><span class="chip gr">${c ? "boîte " + c.box : "nouvelle"}</span></div>
    <div class="fc ${back ? "back" : ""}" data-a="flip" tabindex="0" role="button" aria-label="Retourner la carte"><div><div class="lbl">${back ? "Réponse" : "Question"}</div><div>${back ? f.verso : f.recto}</div>${back ? "" : '<div class="tiny muted" style="margin-top:18px">Touche pour retourner · Espace</div>'}</div></div>
    ${back ? `<div class="rate"><button class="btn" data-a="rate" data-r="again" style="border-color:var(--ko);color:var(--ko)">À revoir</button><button class="btn" data-a="rate" data-r="good">Je savais</button><button class="btn pri" data-a="rate" data-r="easy">Facile</button></div>` : `<div class="row" style="margin-top:14px;justify-content:center"><button class="btn pri" data-a="flip">Voir la réponse</button></div>`}`,
    after: (el) => { const k = (e) => { if (e.code === "Space" || e.key === " ") { e.preventDefault(); if (!cardsState.FC.flip) { cardsState.FC.flip = true; rerender(); } } else if (cardsState.FC.flip && ["1", "2", "3"].includes(e.key)) rate({ 1: "again", 2: "good", 3: "easy" }[e.key]); }; document.addEventListener("keydown", k); routerState.cleanup = () => document.removeEventListener("keydown", k); },
  };
}
