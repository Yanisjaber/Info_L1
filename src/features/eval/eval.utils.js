import { D } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { evalState } from "./eval.store.js";
import { exoState } from "../exercices/exercices.store.js";

// Temps moyen estimé par exercice selon le niveau choisi, pour déduire automatiquement
// combien d'exercices composent l'épreuve à partir de la seule durée voulue.
export const EXO_MINUTES = { 1: 12, 2: 18, 3: 25 };

// QCM/cartes : réponse quasi instantanée (pur par cœur, voir la règle QCM dans le contenu généré),
// bien plus courts qu'un exercice — sert à estimer la charge de travail réelle sur "Se préparer"
// (ccPrepPage) plutôt que de compter des notions sans donner d'idée du temps que ça représente.
export const QCM_MINUTES = 0.5, CARD_MINUTES = 0.4;

export function fmtDuration(mins) {
  // Arrondi au quart d'heure : les minutes servant au calcul (0,5 min par QCM, repli de 90 min sans
  // créneau EDT…) sont déjà des estimations grossières — afficher "28 h 53" prétendrait à une
  // précision à la minute près que le calcul n'a pas vraiment.
  const m = Math.round(mins / 15) * 15;
  if (m < 1) return "moins d'1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export function poolE({ mids, niv, seances = null }) {
  // Priorise les exercices du niveau demandé ; complète avec les niveaux les plus proches si le
  // cours n'en a pas assez à ce niveau précis pour remplir la durée choisie. `seances` restreint en
  // plus au programme d'un CC précis (voir ccOptionsHtml) plutôt qu'à toute la matière.
  const all = D.E.filter((e) => mids.includes(e.mid) && (!seances || seances.has(e.seance)));
  const exact = all.filter((e) => e.difficulte === niv);
  const rest = all.filter((e) => e.difficulte !== niv).sort((a, b) => Math.abs(a.difficulte - niv) - Math.abs(b.difficulte - niv));
  return [...exact, ...rest];
}

export function evalScore() {
  const n = evalState.EV.items.length, ok = evalState.EV.items.filter((it) => it.mark === "ok").length, marked = evalState.EV.items.filter((it) => it.mark).length;
  return { n, ok, marked };
}

// La copie doit rester consultable telle qu'elle a été rendue, même si l'exercice est retenté
// plus tard ailleurs dans l'appli (state.reponses est partagé et se réécrit à chaque essai) — on
// fige donc ici une copie de la réponse et du résultat de chaque item, au lieu de ne garder que
// les compteurs agrégés par séance.
export function evalItemSnapshot(it) {
  const e = it.e, snap = { eid: e.id, mark: it.mark };
  if (e.type === "code") { snap.code = state.reponses[e.id]?.value ?? e.codeStarter ?? ""; snap.results = exoState.codeResults[e.id] || null; }
  else if (e.type === "texte") { const r = state.reponses[e.id]; snap.values = r?.values || []; snap.oks = r?.oks || []; }
  return snap;
}
