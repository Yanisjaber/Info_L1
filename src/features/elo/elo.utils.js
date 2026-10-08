import { C, D } from "../../core/services/app-data.js";
import { commit, state, todayKey } from "../../core/services/store.js";
import { seanceHasContent } from "../edt/edt.utils.js";

// Score de maîtrise, pas un classement compétitif. Par matière : 0 = aucune connaissance,
// 1000 = tout le cours de cette matière est couvert (coverage à 100 %), et jusqu'à 500 points
// de bonus si en plus tu maîtrises aussi les QCM/exercices de niveau difficile — aller au-delà
// de ce qui est strictement demandé. Le score global est la SOMME des matières actives (pas une
// moyenne) : avec 6 matières, 6000 = tout le semestre connu, 9000 = le maximum absolu.
export const ELO_MAX_PER_MATIERE = 1500;

const ELO_TIERS = [
  { name: "Débutant", min: 0, cls: "gr" },
  { name: "Apprenti", min: 200, cls: "gr" },
  { name: "Confirmé", min: 450, cls: "wa" },
  { name: "Avancé", min: 750, cls: "wa" },
  { name: "Cours maîtrisé", min: 1000, cls: "ok" },
  { name: "Expert", min: 1250, cls: "ok" },
  { name: "Maître", min: 1450, cls: "ok" },
];

// `scale` est le maximum applicable dans ce contexte : 1500 pour une matière, 1500×n pour le
// score global à n matières — les seuils ci-dessus sont proportionnels à ce maximum (donc le
// seuil "Cours maîtrisé" tombe pile à 6000 pour 6 matières, comme demandé).
export function tierFor(rating, scale = ELO_MAX_PER_MATIERE) {
  let idx = 0;
  for (let i = 0; i < ELO_TIERS.length; i++) if (rating >= ELO_TIERS[i].min * (scale / ELO_MAX_PER_MATIERE)) idx = i;
  return ELO_TIERS[idx];
}

// Part des notions du cours (QCM/exercices/cartes) effectivement maîtrisées → la base sur 1000.
// `seances` (optionnel, Set d'ids) restreint le calcul à ce périmètre au lieu de toute la matière
// — sert au score de préparation d'un CC (voir ccReadiness), qui ne porte que sur son programme.
export function coverage(mid, seances = null) {
  const c = C(mid), inScope = (x) => !seances || seances.has(x.seance);
  const totalQ = c.qcm.filter(inScope).length, okQ = c.qcm.filter((q) => inScope(q) && state.qcm[q.id]?.last).length;
  const totalE = c.exercices.filter(inScope).length, okE = c.exercices.filter((e) => inScope(e) && state.exos[e.id]?.v === "ok").length;
  const totalF = c.flashcards.filter(inScope).length, okF = c.flashcards.filter((f) => inScope(f) && state.cards[f.id]?.box >= 4).length;
  const total = totalQ + totalE + totalF;
  return total ? (okQ + okE + okF) / total : 0;
}

// Part des QCM/exercices de niveau difficile (3 étoiles) maîtrisés → le bonus "au-delà du cours" sur 500.
export function hardMastery(mid, seances = null) {
  const c = C(mid), inScope = (x) => !seances || seances.has(x.seance);
  const hq = c.qcm.filter((q) => inScope(q) && q.niveau === 3), okQ = hq.filter((q) => state.qcm[q.id]?.last).length;
  const he = c.exercices.filter((e) => inScope(e) && e.difficulte === 3), okE = he.filter((e) => state.exos[e.id]?.v === "ok").length;
  const total = hq.length + he.length;
  return total ? (okQ + okE) / total : 0;
}

// Score déterministe (recalculé à la volée depuis l'état actuel, jamais stocké) : pas de dérive,
// pas d'ordre de rejeu à gérer — la note d'aujourd'hui ne dépend que du travail réellement fait.
export function getElo(mid, seances = null) { return Math.round(1000 * coverage(mid, seances) + 500 * hardMastery(mid, seances)); }

// Score de préparation d'un CC : même formule que l'Elo (coverage + maîtrise difficile sur /1500),
// mais restreint aux séances cochées comme étant au programme de ce CC plutôt qu'à toute la
// matière — répond à "suis-je prêt pour ce CC", pas "suis-je prêt sur toute la matière".
// Renvoie null tant qu'aucune séance n'est rattachée, ou qu'aucune n'a de QCM/exercices/cartes.
export function ccReadiness(ev) {
  if (!ev.seances?.length) return null;
  const want = new Set(ev.seances);
  const c = C(ev.matiere); if (!c) return null;
  const inScope = (x) => want.has(x.seance);
  const has = c.qcm.some(inScope) || c.exercices.some(inScope) || c.flashcards.some(inScope);
  if (!has) return null;
  const rating = getElo(ev.matiere, want);
  // Tant que les séances au programme ont un vrai cours rédigé, le % de connaissance (coverage,
  // simple fraction maîtrisée) est plus lisible que l'Elo (qui mélange coverage et bonus difficile
  // sur une échelle /1500 pas toujours intuitive) — l'Elo reste affiché en repli sinon.
  const filled = c.seances.filter((s) => want.has(s.id)).every(seanceHasContent);
  return { rating, tier: tierFor(rating), pct: Math.round(coverage(ev.matiere, want) * 100), filled };
}

export const pctCls = (pct) => (pct >= 80 ? "ok" : pct >= 40 ? "wa" : "gr");

// Empile un point d'historique (au plus un par jour par matière) pour tracer l'évolution dans le temps.
export function snapshotElo(mid) {
  if (!mid) return;
  const rating = getElo(mid);
  if (!state.elo[mid]) state.elo[mid] = { history: [] };
  const hist = state.elo[mid].history;
  const last = hist[hist.length - 1];
  if (last && todayKey(new Date(last.ts)) === todayKey()) last.rating = rating;
  else hist.push({ ts: Date.now(), rating });
  if (hist.length > 120) hist.shift();
  commit();
}

// Même principe que snapshotElo, mais un point par CC dont la séance concernée fait partie du
// programme — alimente le graphique d'évolution de la page "Se préparer" (voir ccPrepPage).
export function snapshotCcProg(mid, seance) {
  if (!mid || !seance) return;
  D.cal.evenements.filter((ev) => ev.matiere === mid && ev.seances?.includes(seance)).forEach((ev) => {
    const p = Math.round(coverage(mid, new Set(ev.seances)) * 100);
    if (!state.ccProg[ev.id]) state.ccProg[ev.id] = { history: [] };
    const hist = state.ccProg[ev.id].history;
    const last = hist[hist.length - 1];
    if (last && todayKey(new Date(last.ts)) === todayKey()) last.pct = p;
    else hist.push({ ts: Date.now(), pct: p });
    if (hist.length > 120) hist.shift();
  });
  commit();
}
