import { icon } from "../core/components/icons.js";
import { setNav } from "../core/components/shell.js";
import { periodeLabel } from "../core/services/app-data.js";
import { $, esc } from "../core/utils/dom.js";
import { renderMath } from "../core/utils/math.js";
import { account } from "../features/auth/account.page.js";
import { calendar } from "../features/calendar/calendar.page.js";
import { home } from "../features/dashboard/dashboard.page.js";
import { edtDraft } from "../features/edt/edt-draft.page.js";
import { edt } from "../features/edt/edt.page.js";
import { ccPrepPage } from "../features/elo/ccprep.page.js";
import { eloDetail, eloPage } from "../features/elo/elo.page.js";
import { evalReviewPage, evalRunView, evalSetup } from "../features/eval/eval.page.js";
import { evalState } from "../features/eval/eval.store.js";
import { exoAdminForm, exoAdminList } from "../features/exercices/exercices-admin.page.js";
import { flashAdminForm, flashAdminList } from "../features/flashcards/flashcards-admin.page.js";
import { cardsSetup, cardsView } from "../features/flashcards/flashcards.page.js";
import { cardsState } from "../features/flashcards/flashcards.store.js";
import { archives, matiere, subjects } from "../features/matieres/matieres.page.js";
import { notes } from "../features/notes/notes.page.js";
import { qcmAdminForm, qcmAdminList } from "../features/quiz/quiz-admin.page.js";
import { quizSetup, quizView } from "../features/quiz/quiz.page.js";
import { quizState } from "../features/quiz/quiz.store.js";
import { mmSeanceForm, mmSeances } from "../features/seances/seance-admin.page.js";
import { cours } from "../features/seances/seance.page.js";
import { search } from "../features/search/search.page.js";
import { todosPage } from "../features/todos/todos.page.js";
import { routerState } from "./router.store.js";

const view = () => $("#view");

// Une page listée dans la barre latérale (Accueil, EDT, Calendrier, To do list, Notes & CC, Elo,
// Compte, archives, une matière précise et ses onglets, les pages de lancement QCM/Éval/Flashcards)
// est déjà "la base" : inutile d'y proposer un retour, on y est arrivé directement depuis le menu.
// Tout le reste (une séance, une fiche Elo détaillée, une recherche, un formulaire d'admin…) est une
// sous-page atteinte par un lien, où revenir en arrière a un sens.
function isTopLevel(p) {
  if (!p.length) return true;
  if (["edt", "cal", "todos", "notes", "compte", "archives"].includes(p[0])) return true;
  if (["elo", "qcm", "eval", "cards"].includes(p[0]) && !p[1]) return true;
  if (p[0] === "m" && p[1]) return true;
  return false;
}

export function parse() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  return { parts: path.split("/").filter(Boolean), path, q: Object.fromEntries(new URLSearchParams(qs || "")) };
}

export async function route() {
  if (routerState.cleanup) { routerState.cleanup(); routerState.cleanup = null; }
  const r = parse(), p = r.parts;
  setNav(r.path);
  const el = view();
  let html = "", after = null;
  try {
    if (!p.length) ({ html, after } = home());
    else if (p[0] === "m" && !p[1]) ({ html, after } = subjects());
    else if (p[0] === "archives") ({ html, after } = archives());
    else if (p[0] === "m") ({ html, after } = matiere(p[1], p[2] || "cours"));
    else if (p[0] === "c") ({ html, after } = await cours(p[1], p[2]));
    else if (p[0] === "qcm") ({ html, after } = p[1] === "run" && quizState.Q ? quizView() : quizSetup(r.q));
    else if (p[0] === "eval" && p[1] === "review" && p[2]) ({ html, after } = evalReviewPage(p[2]));
    else if (p[0] === "eval") ({ html, after } = p[1] === "run" && evalState.EV ? evalRunView() : evalSetup(r.q));
    else if (p[0] === "cards") ({ html, after } = p[1] === "run" && cardsState.FC ? cardsView() : cardsSetup(r.q));
    else if (p[0] === "edt") ({ html, after } = edt());
    else if (p[0] === "todo") ({ html, after } = await edtDraft(r.q));
    else if (p[0] === "cal") ({ html, after } = calendar(r.q));
    else if (p[0] === "todos") ({ html, after } = todosPage());
    else if (p[0] === "notes") ({ html, after } = notes());
    else if (p[0] === "elo" && !p[1]) ({ html, after } = eloPage());
    else if (p[0] === "elo" && p[1]) ({ html, after } = eloDetail(p[1]));
    else if (p[0] === "ccprep" && p[1]) ({ html, after } = ccPrepPage(p[1]));
    else if (p[0] === "mm" && p[1] && !p[2]) ({ html, after } = mmSeances(p[1]));
    else if (p[0] === "mm" && p[1] && p[2]) ({ html, after } = mmSeanceForm(p[1], p[2]));
    else if (p[0] === "aq" && p[1] && !p[2]) ({ html, after } = qcmAdminList(p[1]));
    else if (p[0] === "aq" && p[1] && p[2]) ({ html, after } = qcmAdminForm(p[1], p[2]));
    else if (p[0] === "af" && p[1] && !p[2]) ({ html, after } = flashAdminList(p[1]));
    else if (p[0] === "af" && p[1] && p[2]) ({ html, after } = flashAdminForm(p[1], p[2]));
    else if (p[0] === "ax" && p[1] && !p[2]) ({ html, after } = exoAdminList(p[1]));
    else if (p[0] === "ax" && p[1] && p[2]) ({ html, after } = exoAdminForm(p[1], p[2]));
    else if (p[0] === "search") ({ html, after } = await search(r.q.q || ""));
    else if (p[0] === "compte") ({ html, after } = account());
    else html = `<div class="empty"><h2>Page introuvable</h2><a class="btn" href="#/">Accueil</a></div>`;
  } catch (e) {
    console.error(e);
    html = `<div class="empty"><h2>Oups</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Accueil</a></div>`;
  }
  // Bouton "Retour" universel : revient à l'écran précédent de la session, quel qu'il soit (EDT,
  // recherche, calendrier…) — pas un lien statique vers un parent hiérarchique supposé (une séance
  // ouverte depuis l'EDT doit revenir à l'EDT, pas à sa matière). Absent sur l'accueil et au tout
  // premier chargement (rien à quoi revenir).
  const backBtn = !isTopLevel(p) && routerState.navCount > 0 ? `<button type="button" class="btn sm ghost" data-a="navback" style="margin-bottom:14px">${icon("back")}Retour</button>` : "";
  el.innerHTML = backBtn + html;
  renderMath(el);
  if (after) after(el);
  window.scrollTo(0, 0);
  const h1txt = el.querySelector("h1")?.textContent || "Révisions", pl = periodeLabel();
  document.title = h1txt === pl ? h1txt : `${h1txt} — ${pl}`;
}
