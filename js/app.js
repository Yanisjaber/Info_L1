import { $, $$, esc, icon, fmtDate, fmtLong, parseDay, startOfDay, daysUntil, pct, shuffle, plural, fmtMMSS, fmt1, toast, appConfirm, renderMath, download } from "./util.js";
import { state, commit, bump, setEntry, onChange, sync, initSync, pull, push, signIn, signUp, magicLink, signOut, exportJSON, importJSON, resetAll, todayKey } from "./store.js";
import { CALC } from "./grades.js";
import { loadMatieres, loadSeances, saveMatiere, deleteMatiere, saveSeance, deleteSeance, loadEdt, saveEdtEvent, deleteEdtEvent, analyzeIcs, commitIcsImport, loadPeriodes, savePeriode, deletePeriode, wipeAccount, loadCC, saveCCEvent, deleteCCEvent, loadItems, saveItem, deleteItem, loadResults, saveResult, loadEvals, saveEval, deleteEval, loadSeanceDocs, loadSeanceDocSids, uploadSeanceDoc, updateSeanceDoc, deleteSeanceDoc, getSeanceDocBlobUrl, loadTodos, saveTodo, setTodoDone, deleteTodo } from "./content.js";

const D = { matieres: [], periodes: [], cal: { evenements: [], remarques: [] }, edt: { events: [] }, content: {}, docSids: new Set(), Q: [], F: [], E: [], todos: [], idx: null };
let IDS = [];
const TYPES = { CM: "Cours magistraux", TD: "Travaux dirigés", TP: "Travaux pratiques" };
const view = () => $("#view");
let cleanup = null;
// Compte les navigations RÉELLES (hashchange) de la session, pas les rerenders déclenchés par une
// simple modif de données (rerender() appelle route() directement, sans hashchange) : sert à savoir
// si "Retour" a un sens (0 ou 1 = on vient d'arriver, rien à quoi revenir) sans dépendre de
// history.length, peu fiable d'un navigateur à l'autre.
let navCount = 0;
let Q = null; // session QCM
let EV = null; // session Éval blanche (exercices)
let FC = null; // session flashcards

const M = (id) => D.matieres.find((m) => m.id === id);
const C = (id) => D.content[id];
const sKey = (mid, sid) => mid + "/" + sid;
const seanceOf = (mid, sid) => C(mid).seances.find((s) => s.id === sid) || { type: "", numero: "" };
const tag = (mid) => `<span class="chip" style="--acc:${M(mid).couleur}"><i class="dot" style="--c:${M(mid).couleur}"></i>${esc(M(mid).court)}</span>`;
const isRef = (q) => q.choix.some((c) => /(toutes? les|aucune? (des|de ces)|les deux|ci-dessus|ci-dessous|\b[A-D] et [A-D]\b|réponses? [a-d1-4]\b|réponses? précédentes?)/i.test(c));
// Une matière sans période, ou rattachée à une période encore active, apparaît dans le menu
// principal. Une fois sa période marquée « terminée », elle bascule dans les archives sans
// disparaître : on peut toujours l'ouvrir, réviser ses QCM/cartes, etc.
const isActive = (m) => !m.periode || D.periodes.find((p) => p.id === m.periode)?.statut !== "termine";
const activeMatieres = () => D.matieres.filter(isActive);
const archivedMatieres = () => D.matieres.filter((m) => !isActive(m));
function periodeLabel() {
  const noms = [...new Set(D.periodes.filter((p) => p.statut === "actif").map((p) => p.nom))];
  return noms.length === 1 ? noms[0] : "Révise";
}

// ───────────────────────── Données ─────────────────────────
// Vide tout le contenu propre à un compte (matières, cours, EDT). Toujours synchrone et
// appelé AVANT toute requête réseau : si le rechargement qui suit échoue, l'écran reste
// vide (sûr) plutôt que de garder affichées les données du compte précédent (pas sûr).
function resetContent() {
  D.matieres = []; D.periodes = []; D.content = {}; D.docSids = new Set(); D.Q = []; D.F = []; D.E = []; D.todos = []; IDS = []; D.edt = { events: [] }; D.cal = { evenements: [], remarques: [] };
  state.qcm = {}; state.cards = {}; state.exos = {}; state.evals = {};
}
async function loadData() {
  resetContent();
  if (sync.user) {
    D.edt = await loadEdt();
    D.periodes = await loadPeriodes();
    D.matieres = await loadMatieres();
    const allIds = D.matieres.map((m) => m.id);
    const [allSeances, allQcm, allFlash, allExo, results, evals] = await Promise.all([
      Promise.all(allIds.map((id) => loadSeances(id))),
      loadItems("qcm"), loadItems("carte"), loadItems("exercice"),
      loadResults(), loadEvals(),
    ]);
    allIds.forEach((id, i) => {
      D.content[id] = {
        id, seances: allSeances[i],
        qcm: allQcm.filter((x) => x.matiere === id),
        flashcards: allFlash.filter((x) => x.matiere === id),
        exercices: allExo.filter((x) => x.matiere === id),
      };
    });
    IDS = activeMatieres().map((m) => m.id);
    D.cal = await loadCC();
    D.todos = await loadTodos();
    D.docSids = await loadSeanceDocSids();
    state.qcm = results.qcm; state.cards = results.cards; state.exos = results.exos;
    state.evals = evals;
  }
  IDS.forEach((id) => {
    C(id).qcm.forEach((q) => D.Q.push({ ...q, mid: id }));
    C(id).flashcards.forEach((f) => D.F.push({ ...f, mid: id }));
    C(id).exercices.forEach((e) => D.E.push({ ...e, mid: id }));
  });
}

// ───────────────────────── Statistiques ─────────────────────────
function stats(mid) {
  const c = C(mid), now = Date.now();
  const read = c.seances.filter((s) => state.read[sKey(mid, s.id)]?.v).length;
  const answered = c.qcm.filter((q) => state.qcm[q.id]);
  const right = c.qcm.filter((q) => state.qcm[q.id]?.last).length;
  const n = answered.reduce((a, q) => a + state.qcm[q.id].n, 0), ok = answered.reduce((a, q) => a + state.qcm[q.id].ok, 0);
  const seen = c.flashcards.filter((f) => state.cards[f.id]);
  const mastered = seen.filter((f) => state.cards[f.id].box >= 4).length;
  const due = seen.filter((f) => state.cards[f.id].due <= now).length;
  const exoOk = c.exercices.filter((e) => state.exos[e.id]?.v === "ok").length;
  const wrong = c.qcm.filter((q) => state.qcm[q.id] && state.qcm[q.id].last === false).length;
  const prog = Math.round((pct(read, c.seances.length) + pct(right, c.qcm.length) + pct(mastered, c.flashcards.length)) / 3);
  return { read, seances: c.seances.length, nq: c.qcm.length, answered: answered.length, right, acc: pct(ok, n), n, ok, nf: c.flashcards.length, seen: seen.length, mastered, due, wrong, ne: c.exercices.length, exoOk, prog };
}
const totals = () => IDS.reduce((t, id) => { const s = stats(id); for (const k of ["read", "seances", "nq", "answered", "right", "n", "ok", "nf", "seen", "mastered", "due", "wrong"]) t[k] = (t[k] || 0) + s[k]; return t; }, { read: 0, seances: 0, nq: 0, answered: 0, right: 0, n: 0, ok: 0, nf: 0, seen: 0, mastered: 0, due: 0, wrong: 0 });
const ring = (v, c) => `<div class="ring" style="--v:${v};${c ? "--acc:" + c : ""}" data-t="${v}%"></div>`;

// ───────────────────────── Elo ─────────────────────────
// Score de maîtrise, pas un classement compétitif. Par matière : 0 = aucune connaissance,
// 1000 = tout le cours de cette matière est couvert (coverage à 100 %), et jusqu'à 500 points
// de bonus si en plus tu maîtrises aussi les QCM/exercices de niveau difficile — aller au-delà
// de ce qui est strictement demandé. Le score global est la SOMME des matières actives (pas une
// moyenne) : avec 6 matières, 6000 = tout le semestre connu, 9000 = le maximum absolu.
const ELO_MAX_PER_MATIERE = 1500;
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
function tierFor(rating, scale = ELO_MAX_PER_MATIERE) {
  let idx = 0;
  for (let i = 0; i < ELO_TIERS.length; i++) if (rating >= ELO_TIERS[i].min * (scale / ELO_MAX_PER_MATIERE)) idx = i;
  return ELO_TIERS[idx];
}
// Part des notions du cours (QCM/exercices/cartes) effectivement maîtrisées → la base sur 1000.
// `seances` (optionnel, Set d'ids) restreint le calcul à ce périmètre au lieu de toute la matière
// — sert au score de préparation d'un CC (voir ccReadiness), qui ne porte que sur son programme.
function coverage(mid, seances = null) {
  const c = C(mid), inScope = (x) => !seances || seances.has(x.seance);
  const totalQ = c.qcm.filter(inScope).length, okQ = c.qcm.filter((q) => inScope(q) && state.qcm[q.id]?.last).length;
  const totalE = c.exercices.filter(inScope).length, okE = c.exercices.filter((e) => inScope(e) && state.exos[e.id]?.v === "ok").length;
  const totalF = c.flashcards.filter(inScope).length, okF = c.flashcards.filter((f) => inScope(f) && state.cards[f.id]?.box >= 4).length;
  const total = totalQ + totalE + totalF;
  return total ? (okQ + okE + okF) / total : 0;
}
// Part des QCM/exercices de niveau difficile (3 étoiles) maîtrisés → le bonus "au-delà du cours" sur 500.
function hardMastery(mid, seances = null) {
  const c = C(mid), inScope = (x) => !seances || seances.has(x.seance);
  const hq = c.qcm.filter((q) => inScope(q) && q.niveau === 3), okQ = hq.filter((q) => state.qcm[q.id]?.last).length;
  const he = c.exercices.filter((e) => inScope(e) && e.difficulte === 3), okE = he.filter((e) => state.exos[e.id]?.v === "ok").length;
  const total = hq.length + he.length;
  return total ? (okQ + okE) / total : 0;
}
// Score déterministe (recalculé à la volée depuis l'état actuel, jamais stocké) : pas de dérive,
// pas d'ordre de rejeu à gérer — la note d'aujourd'hui ne dépend que du travail réellement fait.
function getElo(mid, seances = null) { return Math.round(1000 * coverage(mid, seances) + 500 * hardMastery(mid, seances)); }
// Score de préparation d'un CC : même formule que l'Elo (coverage + maîtrise difficile sur /1500),
// mais restreint aux séances cochées comme étant au programme de ce CC plutôt qu'à toute la
// matière — répond à "suis-je prêt pour ce CC", pas "suis-je prêt sur toute la matière".
// Renvoie null tant qu'aucune séance n'est rattachée, ou qu'aucune n'a de QCM/exercices/cartes.
function ccReadiness(ev) {
  if (!ev.seances?.length) return null;
  const want = new Set(ev.seances);
  const c = C(ev.matiere); if (!c) return null;
  const inScope = (x) => want.has(x.seance);
  const has = c.qcm.some(inScope) || c.exercices.some(inScope) || c.flashcards.some(inScope);
  if (!has) return null;
  const rating = getElo(ev.matiere, want);
  return { rating, tier: tierFor(rating) };
}
// Empile un point d'historique (au plus un par jour par matière) pour tracer l'évolution dans le temps.
function snapshotElo(mid) {
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
// Petit graphique en aire, en SVG pur (pas de dépendance externe) : points = [{ts, v}].
function sparklineSvg(points, opts = {}) {
  const w = opts.w || 600, h = opts.h || 160, pad = 10;
  if (points.length < 2) return `<div class="empty" style="padding:20px">Pas encore assez de données.</div>`;
  const vals = points.map((p) => p.v);
  const minV = opts.min ?? Math.min(...vals), maxV = opts.max ?? Math.max(...vals);
  const span = Math.max(1e-6, maxV - minV);
  const stepX = (w - pad * 2) / (points.length - 1);
  const y = (v) => h - pad - ((v - minV) / span) * (h - pad * 2);
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(pad + i * stepX).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${(pad + (points.length - 1) * stepX).toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;
  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" style="display:block">
    <path d="${areaD}" fill="var(--acc)" opacity="0.12"></path>
    <path d="${pathD}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
    <circle cx="${(pad + (points.length - 1) * stepX).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4" fill="var(--acc)"></circle>
  </svg>`;
}
function eloCardHtml(m) {
  const rating = getElo(m.id), cov = coverage(m.id), tier = tierFor(rating);
  const hist = (state.elo[m.id]?.history || []).slice(-24);
  const pts = hist.map((h) => ({ ts: h.ts, v: h.rating }));
  const delta = pts.length > 1 ? rating - pts[0].v : 0;
  return `<a class="card" href="#/elo/${m.id}" style="--acc:${m.couleur};display:block;text-decoration:none;color:inherit">
    <div class="row nowrap"><i class="dot" style="--c:${m.couleur}"></i><b>${esc(m.court)}</b><div class="sp"></div><span class="chip ${tier.cls}">${esc(tier.name)}</span></div>
    <div class="row nowrap" style="margin-top:10px;align-items:baseline;gap:8px"><div style="font-size:1.9rem;font-weight:800">${rating}<span class="tiny muted" style="font-weight:600"> / ${ELO_MAX_PER_MATIERE}</span></div>${pts.length > 1 ? `<span class="tiny" style="color:${delta >= 0 ? "var(--ok)" : "var(--ko)"}">${delta >= 0 ? "+" : ""}${delta}</span>` : ""}</div>
    <div class="bar" style="margin-top:10px"><i style="width:${Math.min(100, Math.round((rating / ELO_MAX_PER_MATIERE) * 100))}%;background:${m.couleur}"></i></div>
    <div class="tiny muted" style="margin-top:4px">${Math.round(cov * 100)}% du cours couvert</div>
    <div style="margin-top:10px">${pts.length > 1 ? sparklineSvg(pts, { w: 280, h: 46 }) : `<div class="tiny muted">Entraîne-toi pour voir ta progression.</div>`}</div>
  </a>`;
}
function eloPage() {
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
function eloDetail(mid) {
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

// Logo « Révise » (livre ouvert + signet)
const BRAND_LOGO = `<svg viewBox="0 0 256 256" aria-hidden="true"><rect width="256" height="256" rx="58" fill="#1F3A5F"/><path d="M128 88C106 68 74 66 46 76V190C74 180 106 184 128 204Z" fill="#fff"/><path d="M128 88C150 68 182 66 210 76V190C182 180 150 184 128 204Z" fill="#fff" fill-opacity=".86"/><path d="M150 70H178V130L164 118L150 130Z" fill="#6FD6B5"/></svg>`;

// ───────────────────────── Coque ─────────────────────────
function shell() {
  const navSubj = activeMatieres().map((m) => `<a href="#/m/${m.id}" data-nav="m/${m.id}"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.court)}</a>`).join("");
  const brandLabel = periodeLabel();
  const brandMark = BRAND_LOGO;
  $("#app").innerHTML = `
  <aside id="side">
    <a class="brand" href="#/"><span class="logo">${brandMark}</span><span class="brand-t">Révise${brandLabel !== "Révise" ? `<small>${esc(brandLabel)}</small>` : ""}</span></a>
    <form class="sform" role="search"><input type="text" name="q" placeholder="Rechercher…" aria-label="Rechercher"></form>
    <nav class="nav" aria-label="Navigation">
      <a href="#/" data-nav="">${icon("home")}Accueil</a>
      <a href="#/edt" data-nav="edt">${icon("grid")}Emploi du temps</a>
      <a href="#/cal" data-nav="cal">${icon("cal")}Calendrier</a>
      <a href="#/todos" data-nav="todos">${icon("todo")}To do list</a>
      <a href="#/notes" data-nav="notes">${icon("chart")}Notes &amp; CC</a>
      <a href="#/elo" data-nav="elo">${icon("flag")}Elo</a>
      <div class="sep">Matières</div>${navSubj}
      ${archivedMatieres().length ? `<a href="#/archives" data-nav="archives">${icon("book")}Archives</a>` : ""}
      <div class="sep">S'entraîner</div>
      <a href="#/cards" data-nav="cards">${icon("cards")}Flashcards</a>
      <a href="#/qcm" data-nav="qcm">${icon("check")}QCM</a>
      <a href="#/eval" data-nav="eval">${icon("clock")}Éval blanche</a>
    </nav>
    <div class="side-foot">
      <a class="nav-a btn ghost sm" href="#/compte" data-nav="compte">${icon("user")}<span id="syncl">Compte</span></a>
    </div>
  </aside>
  <div id="main">
    <header id="topbar"><a class="brand" href="#/"><span class="logo">${brandMark}</span></a><form class="sform" role="search"><input type="text" name="q" placeholder="Rechercher…" aria-label="Rechercher"></form><a href="#/compte" class="btn ghost sm" aria-label="Compte">${icon("user")}</a></header>
    <main id="view" tabindex="-1"></main>
  </div>
  <nav id="tabbar" aria-label="Navigation mobile">
    <a href="#/" data-nav="">${icon("home")}Accueil</a>
    <a href="#/m" data-nav="m">${icon("book")}Matières</a>
    <a href="#/qcm" data-nav="qcm">${icon("check")}QCM</a>
    <a href="#/cards" data-nav="cards">${icon("cards")}Cartes</a>
    <a href="#/edt" data-nav="edt">${icon("grid")}EDT</a>
    <a href="#/cal" data-nav="cal">${icon("cal")}Agenda</a>
  </nav>`;
  $$(".sform").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const q = f.q.value.trim(); if (q) location.hash = "#/search?q=" + encodeURIComponent(q); }));
}
function setNav(path) {
  const p = path.replace(/^\//, "");
  $$("[data-nav]").forEach((a) => {
    const n = a.dataset.nav;
    const on = n === "" ? p === "" : p === n || p.startsWith(n + "/");
    a.classList.toggle("on", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const acc = p.startsWith("m/") ? M(p.split("/")[1])?.couleur : null;
  document.documentElement.style.setProperty("--acc", acc || "");
  if (!acc) document.documentElement.style.removeProperty("--acc");
}
function syncLabel() {
  const el = $("#syncl"); if (!el) return;
  el.textContent = !sync.configured ? "Compte (local)" : sync.user ? { ok: "Compte", sync: "Synchro…", error: "Erreur synchro", off: "Connecté" }[sync.status] || "Connecté" : "Se connecter";
}

// ───────────────────────── Routeur ─────────────────────────
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
function parse() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  return { parts: path.split("/").filter(Boolean), path, q: Object.fromEntries(new URLSearchParams(qs || "")) };
}
async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
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
    else if (p[0] === "qcm") ({ html, after } = p[1] === "run" && Q ? quizView() : quizSetup(r.q));
    else if (p[0] === "eval" && p[1] === "review" && p[2]) ({ html, after } = evalReviewPage(p[2]));
    else if (p[0] === "eval") ({ html, after } = p[1] === "run" && EV ? evalRunView() : evalSetup(r.q));
    else if (p[0] === "cards") ({ html, after } = p[1] === "run" && FC ? cardsView() : cardsSetup(r.q));
    else if (p[0] === "edt") ({ html, after } = edt());
    else if (p[0] === "todo") ({ html, after } = await edtDraft(r.q));
    else if (p[0] === "cal") ({ html, after } = calendar(r.q));
    else if (p[0] === "todos") ({ html, after } = todosPage());
    else if (p[0] === "notes") ({ html, after } = notes());
    else if (p[0] === "elo" && !p[1]) ({ html, after } = eloPage());
    else if (p[0] === "elo" && p[1]) ({ html, after } = eloDetail(p[1]));
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
  const backBtn = !isTopLevel(p) && navCount > 0 ? `<button type="button" class="btn sm ghost" data-a="navback" style="margin-bottom:14px">${icon("back")}Retour</button>` : "";
  el.innerHTML = backBtn + html;
  renderMath(el);
  if (after) after(el);
  window.scrollTo(0, 0);
  const h1txt = el.querySelector("h1")?.textContent || "Révisions", pl = periodeLabel();
  document.title = h1txt === pl ? h1txt : `${h1txt} — ${pl}`;
}
const rerender = () => route();
// À utiliser (au lieu de rerender seul) après toute modif qui peut changer la liste des
// matières visibles dans le menu (créer/supprimer une matière, changer une période…).
const refreshShell = () => { shell(); return rerender(); };

// ───────────────────────── Accueil ─────────────────────────
function nextEvents(n = 4) {
  return D.cal.evenements.filter((e) => M(e.matiere) && daysUntil(e.date) >= 0).slice(0, n);
}
const cd = (e) => { const d = daysUntil(e.date); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : d < 0 ? "passé" : `dans ${d} jours`; };
// Poids du CC en 0..1, pour évaluer l'importance d'une échéance : "20 %" ou "1/3" ; à défaut
// (ex. "à confirmer") on suppose un poids moyen plutôt que de l'ignorer complètement.
function parsePoidsNum(s) {
  const m = String(s || "").match(/(\d+(?:[.,]\d+)?)\s*%/); if (m) return parseFloat(m[1].replace(",", ".")) / 100;
  const m2 = String(s || "").match(/^(\d+)\s*\/\s*(\d+)$/); if (m2) return +m2[1] / +m2[2];
  return 0.15;
}
// Affichage : une note "1/3" (une note parmi trois, pas un pourcentage du CC) se lit plus
// naturellement en "33 %" qu'en fraction — tout le reste (poids réels, "à confirmer") est inchangé.
function fmtPoids(s) {
  const m = String(s || "").match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? `${Math.round((+m[1] / +m[2]) * 100)} %` : s;
}
const nearestEvent = (mid) => D.cal.evenements.filter((e) => e.matiere === mid && daysUntil(e.date) >= 0).sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];
// Priorité = poids du CC × urgence (proche = plus urgent) × marge de progression (peu avancé = plus prioritaire).
function prioScore(mid) {
  const ev = nearestEvent(mid); if (!ev) return null;
  const d = Math.max(0, daysUntil(ev.date)), prog = stats(mid).prog;
  const urgency = Math.max(0.2, 1 - d / 45), gap = Math.max(0.2, 1 - prog / 100);
  return { ev, score: parsePoidsNum(ev.poids) * urgency * gap };
}

// ───────────────────────── To-do list ─────────────────────────
// Juste trois états visuels, calculés à la volée depuis `done`/`date` — rien à stocker en plus :
// faite (vert), en retard (rouge, date passée et pas faite), ou normale (ni l'un ni l'autre).
const todoLate = (t) => !t.done && daysUntil(t.date) < 0;
const todoChip = (t) => (t.done ? "ok" : todoLate(t) ? "ko" : "gr");
const todosSorted = () => D.todos.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
function todoRowHtml(t, compact = false) {
  return `<div class="item"><input type="checkbox" data-a="todotoggle" data-id="${t.id}" ${t.done ? "checked" : ""} aria-label="Marquer « ${esc(t.texte)} » comme faite">
    <div class="sp"><b class="${t.done ? "muted" : ""}" style="${t.done ? "text-decoration:line-through" : ""}">${esc(t.texte)}</b></div>
    <span class="chip ${todoChip(t)}">${t.done ? "Faite" : todoLate(t) ? "En retard" : fmtDate(t.date)}</span>
    ${compact ? "" : `<button type="button" class="btn sm ghost" data-a="deltodo" data-id="${t.id}" aria-label="Supprimer « ${esc(t.texte)} »">✕</button>`}</div>`;
}
function home() {
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
// Aperçu sur l'accueil : les 6 tâches les plus urgentes (en retard d'abord, puis les plus proches),
// réparties en 2 colonnes de 3 — la liste complète (ajout/suppression, petit calendrier) est sur sa
// propre page, ici on ne fait que montrer et cocher.
function todoPreviewCard() {
  const pending = todosSorted().filter((t) => !t.done).slice(0, 6);
  const col1 = pending.slice(0, 3), col2 = pending.slice(3, 6);
  const body = pending.length
    ? `<div class="grid g2">
        <div class="list">${col1.map((t) => todoRowHtml(t, true)).join("")}</div>
        <div class="list">${col2.map((t) => todoRowHtml(t, true)).join("")}</div>
      </div>`
    : `<div class="empty">Rien à faire pour l'instant.</div>`;
  return `<div class="card" style="margin:16px 0">
    <div class="row nowrap"><h3 style="margin:0">To do list</h3><div class="sp"></div><a class="btn sm ghost" href="#/todos">Page complète ${icon("arrow")}</a></div>
    ${body}
  </div>`;
}
// Sélecteur de date "maison" (remplace le widget natif du navigateur, trop éloigné du reste de
// l'appli) : un bouton qui affiche la date choisie, un `<input type="hidden">` qui porte la vraie
// valeur pour le formulaire, et une pastille calendrier (mêmes classes `.cal`/`.d`/`.dh` que les
// autres calendriers de l'appli) qui s'ouvre en dessous. Générique : plusieurs instances peuvent
// coexister sur une même page (`data-datepicker` + `wireDatePickers` les câble toutes).
function datePickerHtml(name, value) {
  return `<div class="dpick" data-datepicker>
    <button type="button" class="btn dpick-trig" data-a="dpicktoggle">${icon("cal")}<span class="dpick-label">${fmtDate(value)}</span></button>
    <input type="hidden" name="${name}" value="${value}">
    <div class="card dpick-pop" hidden>
      <div class="row nowrap" style="margin-bottom:8px;gap:6px">
        <button type="button" class="btn sm" data-a="dpickprev" aria-label="Mois précédent">${icon("back")}</button>
        <b class="dpick-mlabel" style="flex:1;text-align:center;text-transform:capitalize"></b>
        <button type="button" class="btn sm" data-a="dpicknext" aria-label="Mois suivant">${icon("arrow")}</button>
      </div>
      <div class="cal pick dpick-grid"></div>
      <div class="row" style="margin-top:8px;justify-content:center"><button type="button" class="btn sm ghost" data-a="dpicktoday">Aujourd'hui</button></div>
    </div>
  </div>`;
}
function wireDatePickers(el) {
  $$("[data-datepicker]", el).forEach((wrap) => {
    const hidden = $('input[type="hidden"]', wrap), label = $(".dpick-label", wrap), pop = $(".dpick-pop", wrap);
    const mlabel = $(".dpick-mlabel", wrap), grid = $(".dpick-grid", wrap);
    const d0 = parseDay(hidden.value || todayKey());
    let view = new Date(d0.getFullYear(), d0.getMonth(), 1);
    const render = () => {
      const y = view.getFullYear(), mo = view.getMonth();
      const first = new Date(y, mo, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
      const today = todayKey(), sel = hidden.value;
      let cells = "";
      for (let i = 0; i < off; i++) cells += `<div class="d out"></div>`;
      for (let d = 1; d <= dim; d++) {
        const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        cells += `<button type="button" class="d ${iso === today ? "today" : ""} ${iso === sel ? "sel" : ""}" data-iso="${iso}">${d}</button>`;
      }
      mlabel.textContent = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(view);
      grid.innerHTML = `${["L", "M", "M", "J", "V", "S", "D"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells}`;
    };
    render();
    $('[data-a="dpicktoggle"]', wrap).addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = pop.hidden;
      $$(".dpick-pop", el).forEach((p) => { p.hidden = true; });
      if (willOpen) { render(); pop.hidden = false; }
    });
    pop.addEventListener("click", (e) => {
      e.stopPropagation();
      const dayBtn = e.target.closest("[data-iso]");
      if (dayBtn) {
        hidden.value = dayBtn.dataset.iso; label.textContent = fmtDate(dayBtn.dataset.iso); pop.hidden = true;
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "dpickprev") { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); }
      else if (a === "dpicknext") { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); }
      else if (a === "dpicktoday") { const t = new Date(); view = new Date(t.getFullYear(), t.getMonth(), 1); render(); }
    });
  });
  // Un clic ailleurs sur la page ferme toute pastille restée ouverte.
  el.addEventListener("click", () => $$(".dpick-pop", el).forEach((p) => { p.hidden = true; }));
}
let todoMonth = null;
// Page complète : ajout, petit calendrier (quels jours ont des tâches), et la liste groupée
// par état (en retard d'abord, puis à venir, puis terminées repliées).
function todosPage() {
  if (!sync.user) return { html: `<h1>To do list</h1><div class="empty">Connecte-toi pour voir ta liste de tâches.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
  if (!todoMonth) todoMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const y = todoMonth.getFullYear(), mo = todoMonth.getMonth();
  const first = new Date(y, mo, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const today = todayKey();
  let cells = "";
  for (let i = 0; i < off; i++) cells += `<div class="d out"></div>`;
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const ts = D.todos.filter((t) => t.date === iso);
    const chipColor = (t) => t.done ? "var(--ok)" : todoLate(t) ? "var(--ko)" : "var(--muted)";
    const chips = ts.slice(0, 2).map((t) => `<button type="button" class="ev" style="--c:${chipColor(t)};${t.done ? "text-decoration:line-through" : ""}" data-a="caltodo" data-id="${t.id}" title="${esc(t.texte)}">${esc(t.texte)}</button>`).join("");
    const extra = ts.length > 2 ? `<div class="tiny muted" style="padding-left:2px">+${ts.length - 2}</div>` : "";
    cells += `<div class="d ${iso === today ? "today" : ""}"><b>${d}</b>${chips}${extra}</div>`;
  }
  const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(todoMonth);

  const all = todosSorted();
  const late = all.filter((t) => todoLate(t));
  const upcoming = all.filter((t) => !t.done && !todoLate(t));
  const done = all.filter((t) => t.done);

  return {
    html: `<h1>To do list</h1>
    <div class="card" style="margin-bottom:16px">
      <form data-a="addtodo" class="row" style="gap:8px;flex-wrap:wrap">
        <input type="text" name="texte" placeholder="Nouvelle tâche…" required style="flex:1;min-width:180px">
        ${datePickerHtml("date", today)}
        <button class="btn pri" type="submit">${icon("check")}Ajouter</button>
      </form>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row" style="margin-bottom:10px"><button type="button" class="btn sm" data-a="todoprev" aria-label="Mois précédent">${icon("back")}</button><b style="min-width:150px;text-align:center;text-transform:capitalize">${monthName}</b><button type="button" class="btn sm" data-a="todonext" aria-label="Mois suivant">${icon("arrow")}</button><button type="button" class="btn sm ghost" data-a="todotoday">Aujourd'hui</button></div>
      <div class="cal mini">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells}</div>
    </div>
    ${late.length ? `<h2>En retard</h2><div class="card list" style="margin-bottom:16px">${late.map((t) => todoRowHtml(t)).join("")}</div>` : ""}
    <h2>À venir</h2><div class="card list">${upcoming.map((t) => todoRowHtml(t)).join("") || `<div class="empty">Rien de prévu.</div>`}</div>
    ${done.length ? `<details style="margin-top:16px"><summary>Tâches terminées (${done.length})</summary><div class="card list" style="margin-top:10px">${done.map((t) => todoRowHtml(t)).join("")}</div></details>` : ""}`,
    after: (el) => {
      wireDatePickers(el);
      $('form[data-a="addtodo"]', el)?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target), texte = fd.get("texte").trim();
        if (!texte) return;
        try { await saveTodo({ texte, date: fd.get("date") }); toast("Tâche ajoutée"); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); }
      });
    },
  };
}
function subjectCard(m) {
  const s = stats(m.id);
  return `<a class="card subj" href="#/m/${m.id}" style="--c:${m.couleur};--acc:${m.couleur}"><div class="row nowrap"><div><h3>${esc(m.nom)}</h3><div class="muted small">${esc(m.desc)}</div></div><div class="sp"></div>${ring(s.prog, m.couleur)}</div><div class="tiny muted">${plural(s.seances, "séance")} · ${plural(s.nq, "QCM", "QCM")} · ${plural(s.nf, "carte")} · ${plural(s.ne, "exercice")}</div></a>`;
}
function subjects() {
  if (!sync.user) return { html: `<h1>Matières</h1><div class="empty">Connecte-toi pour voir tes matières.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
  const arch = archivedMatieres();
  return { html: `<h1>Matières</h1><div class="grid g2" style="margin-top:14px">${activeMatieres().map(subjectCard).join("") || `<div class="empty">Aucune matière pour l'instant.<br>Ajoutes-en une dans <a href="#/compte">Paramètres</a>.</div>`}</div>
    ${arch.length ? `<p class="small muted" style="margin-top:18px">${plural(arch.length, "matière archivée", "matières archivées")} de tes semestres terminés — <a href="#/archives">voir les archives</a>.</p>` : ""}` };
}
function archives() {
  if (!sync.user) return { html: `<h1>Archives</h1><div class="empty">Connecte-toi pour voir tes archives.</div>` };
  const done = D.periodes.filter((p) => p.statut === "termine");
  return { html: `<h1>Archives</h1><p class="muted">Les matières de tes semestres terminés — toujours consultables (cours, QCM, cartes), juste sorties du menu principal.</p>
    ${done.map((p) => {
      const ms = D.matieres.filter((m) => m.periode === p.id);
      if (!ms.length) return "";
      return `<h2>${esc(p.nom)}</h2><div class="grid g2" style="margin-bottom:18px">${ms.map(subjectCard).join("")}</div>`;
    }).join("") || '<div class="empty">Aucun semestre terminé pour l\'instant.</div>'}` };
}

// ───────────────────────── Matière ─────────────────────────
function matiere(mid, tab) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const c = C(mid), s = stats(mid);
  const tabs = [["cours", "Cours"], ["train", "S'entraîner"], ["exos", "Exercices"], ["cc", "CC & notes"]];
  let body = "";
  if (tab === "cours") {
    body = ["CM", "TD", "TP"].map((t) => {
      const L = c.seances.filter((x) => x.type === t); if (!L.length) return "";
      return `<h3>${TYPES[t]}</h3><div class="card list">${L.map((x) => {
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
    const evs = D.cal.evenements.filter((e) => e.matiere === mid);
    const rem = D.cal.remarques.filter((r) => r.matiere === mid);
    body = `<div class="card"><p class="muted small" style="margin-top:0">${esc(m.cc)}</p>
      <div class="list">${evs.map((e) => `<div class="item"><span class="badge" style="font-size:.66rem">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(e.titre)}</b> <span class="chip gr">${esc(fmtPoids(e.poids))}</span>${e.type === "2e" ? ' <span class="chip wa">2e chance</span>' : ""}<div class="tiny muted">${esc(e.detail)}</div></div></div>`).join("") || '<div class="muted small">Pas de date fixée pour l\'instant.</div>'}</div>
      ${rem.map((r) => `<div class="note" style="margin-top:10px"><b>À noter —</b> ${esc(r.texte)}</div>`).join("")}
      ${m.pdfCC ? `<a class="btn sm" href="${m.pdfCC}" download>${icon("dl")}Fiche CC (PDF)</a>` : ""}</div>
      ${CALC[mid] ? `<h3>Calculateur de note</h3>${notesCard(mid)}` : ""}`;
  }
  return {
    html: `<div class="crumbs"><a href="#/m">Matières</a> › ${esc(m.court)}</div>
    <div class="row nowrap" style="margin-bottom:6px"><div><h1 style="margin:0">${esc(m.nom)}</h1><div class="muted">${esc(m.desc)}</div></div><div class="sp"></div>${ring(s.prog, m.couleur)}</div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/m/${mid}/${k}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</div>${body}`,
    after: (el) => { bindNotes(el); bindExos(el); },
  };
}

// ───────────────────────── Cours ─────────────────────────
// ───────────────────────── Écriture manuscrite (stylet) — moteur vectoriel ─────────────────────────
// Chaque trait est un objet {tool,color,size,pts:[{x,y,p}]} (ou une forme {tool,x1,y1,x2,y2}), pas
// des pixels figés : ça permet un rendu net à tout zoom et une gomme qui efface un trait entier
// plutôt que des pixels. La vue (DRAW.view = {scale,ox,oy}) est un pur zoom/pan d'affichage appliqué
// dans redrawAll() — les coordonnées stockées des traits restent toujours en espace "page" à 100 %.
// Rejet de paume ADAPTATIF : tant qu'aucun vrai stylet (pointerType "pen") n'a touché l'écran cette
// session d'écriture, un seul doigt dessine normalement (sinon personne sans Apple Pencil ne pourrait
// rien écrire) ; dès qu'un stylet est détecté, le rejet de paume classique s'active et le doigt ne
// sert plus qu'à pincer/déplacer la vue — poser la main pendant qu'on écrit au stylet ne laisse plus
// de traits. Deux doigts pincent/déplacent la vue dans tous les cas ; la souris dessine toujours.
let DRAW = null;
let CURRENT_DOCS = []; // docs (avec strokes/paper) de la séance affichée — évite de stocker du JSON dans un data-attribut
const PEN_PALETTE = ["#111111", "#C4342B", "#E08A2B", "#B8960C", "#2E8B57", "#2454C7", "#7C4DBE", "#C6427E"];
const SHAPES = ["line", "rect", "ellipse", "arrow"];
function openWriteOverlay(el, mid, sid, doc = null) {
  const overlay = $("#writeOverlay", el), canvas = $("#writeCanvas", el);
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  const dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  // Pas de ctx.scale ici : redrawAll() pose la transform en entier à chaque frame (dpr + zoom/pan),
  // pour pouvoir zoomer/déplacer la vue sans jamais toucher aux coordonnées stockées des traits.
  DRAW = {
    el, ctx, canvas, mid, sid, w: rect.width, h: rect.height, dpr, editingDoc: doc,
    tool: "pen", color: "#111111", size: 4, paper: "blank",
    strokes: [], log: [], redoLog: [], eraseGesture: null, cur: null, drawing: false, dirty: false,
    view: { scale: 1, ox: 0, oy: 0 }, touches: new Map(), pinch: null, sawPen: false, touchDrawing: false, backdropImg: null,
  };
  if (doc?.strokes?.length) {
    DRAW.strokes = JSON.parse(JSON.stringify(doc.strokes)); // copie : jamais l'objet du doc d'origine
    DRAW.paper = doc.paper || "blank";
    redrawAll();
  } else if (doc?.path) {
    // Page enregistrée avant l'écriture vectorielle : plus moyen de retoucher trait par trait,
    // mais on peut continuer à écrire par-dessus l'image telle quelle.
    toast("Page d'avant cette mise à jour : les traits ne sont plus modifiables un par un, mais tu peux continuer à écrire dessus.");
    getSeanceDocBlobUrl(doc.path).then((blobUrl) => {
      const img = new Image();
      img.onload = () => { DRAW.backdropImg = img; redrawAll(); URL.revokeObjectURL(blobUrl); };
      img.onerror = () => toast("Impossible de charger cette page pour la modifier.");
      img.src = blobUrl;
    }).catch((err) => toast("Erreur : " + err.message));
  } else {
    redrawAll();
  }
  syncWriteToolbar(el);
}
function closeWriteOverlay(el) {
  $("#writeOverlay", el).hidden = true;
  document.body.style.overflow = "";
  DRAW = null;
}
function syncWriteToolbar(el) {
  $$("[data-a='wtool']", el).forEach((b) => b.classList.toggle("on", b.dataset.tool === DRAW.tool));
  const slider = $("[data-a='wsizeslider']", el); if (slider) slider.value = DRAW.size;
  const sv = $("#wsizeval", el); if (sv) sv.textContent = DRAW.size;
  $$("[data-a='wpaper']", el).forEach((b) => b.classList.toggle("on", b.dataset.paper === DRAW.paper));
  $$("[data-a='wcolor']", el).forEach((b) => b.classList.toggle("on", b.dataset.c === DRAW.color));
}
// `rect` est la zone PAGE actuellement visible (dépend du pan/zoom) : le quadrillage/lignage est
// calculé par modulo à partir de l'origine absolue, pas depuis le coin du rect, pour qu'il continue
// à l'identique quand on se déplace — c'est ce qui donne l'impression d'une feuille "infinie".
function paperPattern(ctx, rect, paper) {
  if (paper === "blank") return;
  const { left, top, right, bottom } = rect;
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 1;
  if (paper === "lined") {
    const step = 30;
    for (let y = Math.floor((top - 6) / step) * step + 6; y < bottom; y += step) { ctx.beginPath(); ctx.moveTo(left, y + .5); ctx.lineTo(right, y + .5); ctx.stroke(); }
  } else if (paper === "grid") {
    const step = 24;
    for (let x = Math.floor(left / step) * step; x < right; x += step) { ctx.beginPath(); ctx.moveTo(x + .5, top); ctx.lineTo(x + .5, bottom); ctx.stroke(); }
    for (let y = Math.floor(top / step) * step; y < bottom; y += step) { ctx.beginPath(); ctx.moveTo(left, y + .5); ctx.lineTo(right, y + .5); ctx.stroke(); }
  }
  ctx.restore();
}
// Trace lissée par courbes quadratiques passant par les points-milieux : évite l'aspect "brisé"
// d'un simple enchaînement de segments droits point à point.
function pathThrough(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
function drawArrowHead(ctx, s) {
  const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), len = 9 + s.size;
  ctx.beginPath();
  ctx.moveTo(s.x2 - len * Math.cos(ang - Math.PI / 7), s.y2 - len * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(s.x2, s.y2);
  ctx.lineTo(s.x2 - len * Math.cos(ang + Math.PI / 7), s.y2 - len * Math.sin(ang + Math.PI / 7));
  ctx.stroke();
}
function drawStroke(ctx, s) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  if (s.tool === "pen" || s.tool === "highlighter") {
    ctx.globalAlpha = s.tool === "highlighter" ? .35 : 1;
    ctx.lineWidth = s.tool === "highlighter" ? s.size * 3 : s.size;
    pathThrough(ctx, s.pts); ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (s.tool === "line" || s.tool === "arrow") {
    ctx.lineWidth = s.size;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    if (s.tool === "arrow") drawArrowHead(ctx, s);
  } else if (s.tool === "rect") {
    ctx.lineWidth = s.size;
    ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
  } else if (s.tool === "ellipse") {
    ctx.lineWidth = s.size;
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2, rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
}
function redrawAll() {
  if (!DRAW) return;
  const { ctx, w, h, dpr, view, canvas } = DRAW;
  // Reset complet avant de reposer la transform : sinon une zone qui sort du cadre (dézoom, pan)
  // garderait les pixels bruts de la frame précédente au lieu d'être vide.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
  // Feuille "presque infinie" : on peint du blanc + le quadrillage sur toute la zone PAGE
  // actuellement visible (dépend du pan/zoom), pas seulement sur le rectangle initial — se déplacer
  // ne révèle donc jamais de vide, la feuille continue dans toutes les directions.
  const vis = { left: -view.ox / view.scale, top: -view.oy / view.scale, right: (w - view.ox) / view.scale, bottom: (h - view.oy) / view.scale };
  ctx.fillStyle = "#fff"; ctx.fillRect(vis.left, vis.top, vis.right - vis.left, vis.bottom - vis.top);
  if (DRAW.backdropImg) ctx.drawImage(DRAW.backdropImg, 0, 0, w, h);
  paperPattern(ctx, vis, DRAW.paper);
  DRAW.strokes.forEach((s) => drawStroke(ctx, s));
  if (DRAW.cur) drawStroke(ctx, DRAW.cur);
}
// Historique d'actions unifié (ajout ET gomme) : gommer un morceau par erreur doit pouvoir s'annuler
// exactement comme un trait de trop, donc les deux passent par la même pile plutôt que par un
// simple "dernier trait" — sinon effacer serait irréversible.
function undoStroke() {
  if (!DRAW || !DRAW.log.length) return;
  const last = DRAW.log.pop();
  if (last.type === "add") { const i = DRAW.strokes.indexOf(last.stroke); if (i >= 0) DRAW.strokes.splice(i, 1); }
  else last.items.slice().sort((a, b) => a.originalIndex - b.originalIndex).forEach(({ original, originalIndex, pieces }) => {
    pieces.forEach((pc) => { const i = DRAW.strokes.indexOf(pc); if (i >= 0) DRAW.strokes.splice(i, 1); });
    DRAW.strokes.splice(Math.min(originalIndex, DRAW.strokes.length), 0, original);
  });
  DRAW.redoLog.push(last); DRAW.dirty = true; redrawAll();
}
function redoStroke() {
  if (!DRAW || !DRAW.redoLog.length) return;
  const last = DRAW.redoLog.pop();
  if (last.type === "add") DRAW.strokes.push(last.stroke);
  else last.items.forEach(({ original, originalIndex, pieces }) => {
    const i = DRAW.strokes.indexOf(original); if (i >= 0) DRAW.strokes.splice(i, 1);
    DRAW.strokes.splice(Math.min(originalIndex, DRAW.strokes.length), 0, ...pieces);
  });
  DRAW.log.push(last); DRAW.dirty = true; redrawAll();
}
// La gomme est un stylo qui gomme : son rayon suit le même curseur de taille que le stylo, et elle
// efface au pixel près — un trait touché est DÉCOUPÉ à l'endroit du contact (les morceaux de part et
// d'autre redeviennent deux traits indépendants), il ne disparaît pas en entier comme un objet qu'on
// aurait cliqué. Les formes (ligne/rectangle/cercle/flèche) n'ont pas de "pixels" à découper : elles
// s'effacent toujours entières au contact, comme avant.
// `DRAW.eraseGesture` suit, pour tout le geste (du pointerdown au pointerup), quel trait ORIGINAL est
// à l'origine de quel morceau actuellement affiché — via une Map indexée par référence d'objet — afin
// qu'annuler restaure le trait d'origine intact même s'il a été redécoupé plusieurs fois en chemin.
// Distance d'un point au SEGMENT [a,b] (pas juste à ses deux extrémités) : avec des points de trait
// parfois espacés (trait rapide, événements pointeur peu fréquents), tester seulement les sommets
// laisserait passer un clic pourtant visuellement en plein sur le trait, entre deux points stockés.
function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function eraseAt(p) {
  const r = DRAW.size * 3 + 6;
  const { records, pieceGid } = DRAW.eraseGesture;
  let i = 0;
  while (i < DRAW.strokes.length) {
    const s = DRAW.strokes[i];
    let hit = false, pieces = null;
    if (s.tool === "pen" || s.tool === "highlighter") {
      const pts = s.pts;
      if (pts.length < 2) {
        hit = Math.hypot(pts[0].x - p.x, pts[0].y - p.y) < r;
        if (hit) pieces = [];
      } else {
        const runs = []; let cur = [pts[0]];
        for (let k = 0; k < pts.length - 1; k++) {
          if (distToSeg(p, pts[k], pts[k + 1]) < r) { hit = true; if (cur.length >= 2) runs.push(cur); cur = [pts[k + 1]]; }
          else cur.push(pts[k + 1]);
        }
        if (cur.length >= 2) runs.push(cur);
        if (hit) pieces = runs.map((run) => ({ tool: s.tool, color: s.color, size: s.size, pts: run }));
      }
    } else {
      const pts = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }];
      hit = pts.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < r);
      if (hit) pieces = [];
    }
    if (!hit) { i++; continue; }
    let recIdx = pieceGid.get(s);
    if (recIdx === undefined) { recIdx = records.length; records.push({ original: s, originalIndex: i }); }
    pieces.forEach((pc) => pieceGid.set(pc, recIdx));
    DRAW.strokes.splice(i, 1, ...pieces);
    i += pieces.length;
    DRAW.dirty = true;
  }
}
async function saveWriteNote() {
  if (!DRAW) return;
  const { el, canvas, mid, sid, editingDoc, strokes, paper } = DRAW;
  const savedView = DRAW.view;
  DRAW.view = { scale: 1, ox: 0, oy: 0 }; // export toujours la page entière à 100%, peu importe le zoom/pan en cours
  redrawAll(); // s'assure aussi qu'aucun trait/forme en cours de tracé n'est exporté à moitié
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  DRAW.view = savedView; redrawAll();
  if (!blob) { toast("Erreur : impossible d'enregistrer cette page."); return; }
  const vector = { strokes, paper };
  try {
    if (editingDoc) {
      await updateSeanceDoc(editingDoc, new File([blob], editingDoc.nom, { type: "image/png" }), vector);
    } else {
      const d = new Date(), pad = (n) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
      await uploadSeanceDoc(mid, sid, new File([blob], `Note manuscrite ${stamp}.png`, { type: "image/png" }), vector);
      D.docSids.add(sid);
    }
  } catch (err) { toast("Erreur : " + err.message); return; }
  closeWriteOverlay(el);
  toast(editingDoc ? "Modifications enregistrées" : "Note enregistrée dans les documents");
  rerender();
}
// Convertit un point écran (CSS px) en coordonnées page (celles stockées dans les traits), en
// inversant la transform de vue courante — indispensable pour dessiner juste sous le stylet une
// fois qu'on a zoomé/déplacé la vue.
function ptFromEvent(e, canvas) {
  const r = canvas.getBoundingClientRect(), { scale, ox, oy } = DRAW.view;
  return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale, p: e.pressure || .5 };
}
function isShapeTool(t) { return SHAPES.includes(t); }
function touchPt(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
// Fige le point de la PAGE actuellement sous le milieu des deux doigts : tant que ce point reste
// sous le milieu courant pendant tout le geste, pincer zoome/déplace naturellement en une seule fois
// (pas besoin de logique séparée pour le pan).
function startPinch() {
  const [a, b] = [...DRAW.touches.values()];
  const d0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
  const { scale, ox, oy } = DRAW.view;
  DRAW.pinch = { d0, scale0: scale, anchor: { x: (midX - ox) / scale, y: (midY - oy) / scale } };
}
function resetZoomView() { if (!DRAW) return; DRAW.view = { scale: 1, ox: 0, oy: 0 }; redrawAll(); }
function wireWriteCanvas(el) {
  const canvas = $("#writeCanvas", el); if (!canvas) return;
  const start = (e, p) => {
    if (DRAW.tool === "eraser") { DRAW.drawing = true; DRAW.eraseGesture = { records: [], pieceGid: new Map() }; eraseAt(p); return; }
    if (isShapeTool(DRAW.tool)) { DRAW.cur = { tool: DRAW.tool, color: DRAW.color, size: DRAW.size, x1: p.x, y1: p.y, x2: p.x, y2: p.y }; DRAW.drawing = true; return; }
    DRAW.cur = { tool: DRAW.tool, color: DRAW.color, size: DRAW.size, pts: [p] }; DRAW.drawing = true;
  };
  const move = (e, p) => {
    if (DRAW.tool === "eraser") { eraseAt(p); return; }
    if (isShapeTool(DRAW.tool)) { DRAW.cur.x2 = p.x; DRAW.cur.y2 = p.y; }
    else DRAW.cur.pts.push(p);
    DRAW.dirty = true;
  };
  const end = () => {
    if (!DRAW.drawing) return;
    DRAW.drawing = false;
    if (DRAW.tool === "eraser") {
      const { records, pieceGid } = DRAW.eraseGesture;
      if (records.length) {
        const items = records.map((rec, idx) => ({ original: rec.original, originalIndex: rec.originalIndex, pieces: DRAW.strokes.filter((x) => pieceGid.get(x) === idx) }));
        DRAW.log.push({ type: "erase", items }); DRAW.redoLog = [];
      }
      DRAW.eraseGesture = null;
    } else if (DRAW.cur) {
      DRAW.strokes.push(DRAW.cur); DRAW.log.push({ type: "add", stroke: DRAW.cur }); DRAW.redoLog = []; DRAW.cur = null; DRAW.dirty = true;
    }
  };
  // Pincer à deux doigts zoome/déplace la VUE du canevas (jamais la barre d'outils, qui est en
  // dehors du canevas). Un seul doigt dessine SAUF si un vrai stylet a déjà touché l'écran cette
  // session (DRAW.sawPen) — c'est le rejet de paume adaptatif décrit plus haut.
  const touchStart = (e) => {
    DRAW.touches.set(e.pointerId, touchPt(e, canvas));
    if (DRAW.touches.size === 2) {
      // un 2e doigt arrive pendant qu'on dessinait au 1er : on finalise ce trait avant de pincer,
      // sinon le pincement laisserait un trait fantôme au point de contact du 1er doigt.
      if (DRAW.touchDrawing) { end(); DRAW.touchDrawing = false; }
      startPinch();
    } else if (DRAW.touches.size === 1) {
      DRAW.pinch = null;
      if (!DRAW.sawPen) { DRAW.touchDrawing = true; start(e, ptFromEvent(e, canvas)); }
    }
    redrawAll();
  };
  const touchMove = (e) => {
    if (!DRAW.touches.has(e.pointerId)) return;
    DRAW.touches.set(e.pointerId, touchPt(e, canvas));
    if (DRAW.touches.size === 2 && DRAW.pinch) {
      const [a, b] = [...DRAW.touches.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      const scale = Math.min(6, Math.max(.4, DRAW.pinch.scale0 * (d / DRAW.pinch.d0)));
      DRAW.view = { scale, ox: midX - DRAW.pinch.anchor.x * scale, oy: midY - DRAW.pinch.anchor.y * scale };
      redrawAll();
    } else if (DRAW.touches.size === 1 && DRAW.touchDrawing) {
      move(e, ptFromEvent(e, canvas)); redrawAll();
    }
  };
  const touchEnd = (e) => {
    DRAW.touches.delete(e.pointerId);
    if (DRAW.touchDrawing && DRAW.touches.size === 0) { end(); DRAW.touchDrawing = false; }
    DRAW.pinch = null;
    if (DRAW.touches.size === 2) startPinch(); // un 3e doigt levé en premier : le pincement à 2 continue sans à-coup
    redrawAll();
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!DRAW) return;
    if (e.pointerType === "pen") DRAW.sawPen = true;
    if (e.pointerType === "touch") { canvas.setPointerCapture(e.pointerId); touchStart(e); return; }
    canvas.setPointerCapture(e.pointerId);
    start(e, ptFromEvent(e, canvas)); redrawAll();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!DRAW) return;
    if (e.pointerType === "touch") { touchMove(e); return; }
    if (!DRAW.drawing) return;
    move(e, ptFromEvent(e, canvas)); redrawAll();
  });
  const endMain = (e) => {
    if (!DRAW) return;
    if (e.pointerType === "touch") { touchEnd(e); return; }
    end(); redrawAll();
  };
  canvas.addEventListener("pointerup", endMain);
  canvas.addEventListener("pointercancel", endMain);
  canvas.addEventListener("pointerleave", endMain);
  // Trackpad (Mac/PC) : un pincement à deux doigts arrive au navigateur comme un `wheel` avec
  // `ctrlKey` à true — il n'y a pas d'évènement dédié pour ce geste sur ordinateur. On l'intercepte
  // sur TOUT l'overlay (pas juste le canevas) pour empêcher le zoom natif de la page — qui zoomerait
  // aussi la barre d'outils — et on l'applique nous-mêmes à `DRAW.view`. Un défilement à deux doigts
  // sans ctrl déplace la vue (pan) : au trackpad/souris comme au doigt, on peut ainsi se balader sur
  // une feuille sans bord plutôt que rester coincé sur le rectangle de départ.
  const overlay = $("#writeOverlay", el) || canvas;
  overlay.addEventListener("wheel", (e) => {
    if (!DRAW) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const { scale, ox, oy } = DRAW.view;
    if (e.ctrlKey || e.metaKey) {
      const anchor = { x: (mx - ox) / scale, y: (my - oy) / scale };
      const ns = Math.min(6, Math.max(.4, scale * Math.exp(-e.deltaY * 0.01)));
      DRAW.view = { scale: ns, ox: mx - anchor.x * ns, oy: my - anchor.y * ns };
    } else {
      DRAW.view = { scale, ox: ox - e.deltaX, oy: oy - e.deltaY };
    }
    redrawAll();
  }, { passive: false });
}
const fmtSize = (b) => !b ? "" : b < 1024 ? `${b} o` : b < 1048576 ? `${Math.round(b / 1024)} Ko` : `${(b / 1048576).toFixed(1)} Mo`;
const isHandNote = (d) => d.type === "image/png" && d.nom.startsWith("Note manuscrite");
function docRowHtml(d) {
  return `<div class="item"><span class="badge">${icon("dl")}</span><div class="sp"><b class="small">${esc(d.nom)}</b><div class="tiny muted">${fmtSize(d.taille)}</div></div>
    ${isHandNote(d) ? `<button class="btn sm" data-a="editnote" data-id="${d.id}" aria-label="Modifier ${esc(d.nom)}">${icon("edit")}</button>` : ""}
    ${d.url ? `<a class="btn sm" href="${d.url}" download="${esc(d.nom)}" target="_blank" rel="noopener">${icon("dl")}</a>` : ""}<button class="btn sm ghost" data-a="deldoc" data-id="${d.id}" data-path="${esc(d.path)}" data-nom="${esc(d.nom)}" aria-label="Supprimer ${esc(d.nom)}">✕</button></div>`;
}
async function cours(mid, sid) {
  const m = M(mid), s = m && seanceOf(mid, sid);
  if (!s) return { html: `<div class="empty">Séance introuvable.</div>` };
  const c = C(mid), i = c.seances.findIndex((x) => x.id === sid);
  const prev = c.seances[i - 1], next = c.seances[i + 1];
  const nq = c.qcm.filter((q) => q.seance === sid).length, nf = c.flashcards.filter((f) => f.seance === sid).length, ne = c.exercices.filter((e) => e.seance === sid).length;
  const rd = state.read[sKey(mid, sid)]?.v;
  const key = sKey(mid, sid);
  const hasContent = seanceHasContent(s);
  const docs = await loadSeanceDocs(mid, sid);
  CURRENT_DOCS = docs;
  const notes = state.seanceNotes[key]?.text || "";
  // Un créneau EDT marqué cc=true peut être rattaché à cette séance (un CC a lieu pendant ce
  // cours) : on le retrouve en inversant seanceFor, pour afficher un bandeau avec sa note éditable
  // directement ici — pas besoin de repasser par l'EDT pour noter les modalités du CC.
  const ccEvt = D.edt.events.find((x) => x.cc && x.m === mid && seanceFor(x)?.id === sid);
  const ccDeadline = D.cal.evenements.find((x) => x.edtId === ccEvt?.id) || D.cal.evenements.find((x) => x.matiere === mid && x.date === s.date);
  const ccBanner = ccEvt ? `<div class="card" style="margin:12px 0;border-left:4px solid var(--amber)">
    <div class="row nowrap"><span class="chip wa">CC</span><b>Contrôle continu pendant ce cours</b><div class="sp"></div>${ccDeadline ? `<a class="btn sm ghost" href="#/cal">${icon("cal")}Voir dans Notes &amp; CC</a>` : `<button type="button" class="btn sm ghost" data-a="addccsugg" data-m="${esc(mid)}" data-date="${s.date}" data-titre="${esc(ccEvt.n || "CC")}" data-edt-id="${esc(ccEvt.id)}">${icon("check")}Ajouter à mes échéances</button>`}</div>
    <div class="field" style="margin-top:10px"><label>Détails du CC</label><textarea data-ccnote-id="${esc(ccEvt.id)}" rows="2" placeholder="Modalités, durée, barème…" style="${TA_STYLE}">${esc(ccEvt.n || "")}</textarea></div>
  </div>` : "";
  const docBody = `<div class="doc-layout"><article class="prose" id="doc">${s.contenu}</article><aside class="toc" id="toc"></aside></div>`;
  const emptyBody = `<div class="empty" style="text-align:left;padding:20px 22px"><b>Pas encore de cours rédigé pour cette séance.</b><p class="small muted" style="margin:6px 0 0">Utilise l'espace de travail ci-dessous pour déposer un support ou prendre des notes en attendant — tu pourras toujours demander la rédaction d'une vraie fiche à partir de ça plus tard.</p></div>`;
  return {
    html: `<div class="crumbs"><a href="#/m">Matières</a> › <a href="#/m/${mid}">${esc(m.court)}</a> › ${s.type} ${s.numero}</div>
    <div class="row"><div><h1 style="margin:0">${s.titre}</h1><div class="muted">${s.date ? fmtLong(s.date) + " · " : ""}${TYPES[s.type]}</div></div><div class="sp"></div>
      ${s.pdf ? `<a class="btn sm" href="${s.pdf}" download>${icon("dl")}PDF</a>` : ""}<a class="btn sm" data-a="navreplace" href="#/mm/${mid}/${sid}">${icon("edit")}Modifier</a><button class="btn sm ${rd ? "" : "pri"}" data-a="read" data-k="${sKey(mid, sid)}">${rd ? "✓ Lu" : "Marquer comme lu"}</button></div>
    <p class="muted">${s.resume}</p>
    ${ccBanner}
    ${hasContent ? docBody : emptyBody}
    <div class="card" style="margin-top:26px"><h3 style="margin-top:0">Espace de travail</h3><p class="tiny muted" style="margin-top:-6px">Tes notes et tes documents pour cette séance — rien de tout ça n'est un cours rédigé, juste un endroit pour garder ce que tu as sous la main.</p>
      <div class="field"><label>Tes notes</label><textarea data-note-key="${key}" rows="6" placeholder="Notes prises en séance, points à retenir…" style="${TA_STYLE}">${esc(notes)}</textarea></div>
      <div style="margin-top:16px"><label class="tiny muted" style="display:block;margin-bottom:6px">Documents</label>
        <div class="list" style="border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin-bottom:10px">${docs.map(docRowHtml).join("") || '<div class="empty" style="padding:16px">Aucun document déposé.</div>'}</div>
        <div class="row" style="gap:8px"><label class="btn sm">${icon("upload")}Ajouter un document<input type="file" multiple data-a="adddoc" data-mid="${mid}" data-sid="${sid}" class="sr"></label>
        <button type="button" class="btn sm" data-a="opennote" data-mid="${mid}" data-sid="${sid}">${icon("edit")}Écrire à la main</button></div>
      </div></div>
    <div class="write-overlay" id="writeOverlay" hidden>
      <div class="write-tb">
        <button type="button" data-a="wtool" data-tool="pen" class="on" aria-label="Stylo">${icon("edit")}Stylo</button>
        <button type="button" data-a="wtool" data-tool="highlighter" aria-label="Surligneur">Surligneur</button>
        <button type="button" data-a="wtool" data-tool="eraser" aria-label="Gomme">Gomme</button>
        <span class="write-sep"></span>
        <button type="button" data-a="wtool" data-tool="line">Ligne</button>
        <button type="button" data-a="wtool" data-tool="rect">Rectangle</button>
        <button type="button" data-a="wtool" data-tool="ellipse">Cercle</button>
        <button type="button" data-a="wtool" data-tool="arrow">Flèche</button>
        <span class="write-sep"></span>
        <button type="button" data-a="wundo" aria-label="Annuler">${icon("back")}</button>
        <button type="button" data-a="wredo" aria-label="Rétablir">${icon("arrow")}</button>
      </div>
      <div class="write-tb">
        ${PEN_PALETTE.map((c, i) => `<button type="button" data-a="wcolor" data-c="${c}" class="sw${i === 0 ? " on" : ""}" style="background:${c}" aria-label="Couleur ${c}"></button>`).join("")}
        <label class="sw sw-custom" aria-label="Couleur personnalisée"><input type="color" data-a="wcustomcolor" value="#111111"></label>
        <span class="write-sep"></span>
        <span class="tiny muted">Taille</span>
        <input type="range" class="write-slider" data-a="wsizeslider" min="1" max="24" step="1" value="4">
        <span class="tiny" id="wsizeval" style="width:1.4em;text-align:right">4</span>
        <span class="write-sep"></span>
        <button type="button" data-a="wpaper" data-paper="blank" class="on">Blanc</button>
        <button type="button" data-a="wpaper" data-paper="lined">Ligné</button>
        <button type="button" data-a="wpaper" data-paper="grid">Quadrillé</button>
        <span class="write-sep"></span>
        <button type="button" data-a="wzoomreset" aria-label="Réinitialiser le zoom">${icon("search")}100 %</button>
        <div class="sp"></div>
        <button type="button" data-a="wclose">Fermer</button>
        <button type="button" class="pri" data-a="wsave">${icon("check")}Enregistrer dans les documents</button>
      </div>
      <div class="write-canvas-wrap"><canvas id="writeCanvas"></canvas></div>
    </div>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">S'entraîner sur cette séance</h3><div class="row">
      ${nq ? `<a class="btn pri" href="#/qcm?m=${mid}&s=${sid}">${icon("check")}${nq} QCM</a>` : ""}
      ${nf ? `<a class="btn" href="#/cards?m=${mid}&s=${sid}">${icon("cards")}${nf} cartes</a>` : ""}
      ${ne ? `<a class="btn" href="#/m/${mid}/exos?s=${sid}">${icon("edit")}${ne} exercices</a>` : ""}</div></div>
    <div class="row" style="margin-top:16px">${prev ? `<a class="btn" href="#/c/${mid}/${prev.id}">${icon("back")}${prev.type} ${prev.numero}</a>` : ""}<div class="sp"></div>${next ? `<a class="btn" href="#/c/${mid}/${next.id}">${next.type} ${next.numero}${icon("arrow")}</a>` : ""}</div>`,
    after: (el) => {
      wireWriteCanvas(el);
      if (!hasContent) return;
      const hs = $$("#doc h2, #doc h3", el);
      $("#toc", el).innerHTML = hs.length > 2 ? `<b>Sommaire</b>` + hs.map((h, k) => { h.id = "s" + k; const cl = h.cloneNode(true); $$(".katex-mathml", cl).forEach((n) => n.remove()); return `<a class="${h.tagName === "H3" ? "l3" : ""}" href="#/c/${mid}/${sid}" data-scroll="s${k}">${esc(cl.textContent.replace(/\s+/g, " ").trim())}</a>`; }).join("") : "";
      $$("[data-scroll]", el).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.getElementById(a.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" }); }));
    },
  };
}

// ───────────────────────── Exercices ─────────────────────────
// Toute une matière peut cumuler une centaine d'exercices (surtout depuis qu'ils viennent aussi du
// cours, voir migration CM/TD/TP) : une liste plate entièrement dépliée est devenue impossible à
// parcourir. Trois niveaux à la place : des cartes de séance (une par CM/TD/TP), une liste de
// titres repliés en cliquant une carte, et un exercice qui ne se déplie (énoncé + zone de réponse)
// qu'en cliquant son titre — `openExoId` retient lequel, un seul ouvert à la fois.
let openExoId = null;
function exoCardHtml(e, mid, open) {
  const st = state.exos[e.id]?.v, s = seanceOf(mid, e.seance);
  const isCode = e.type === "code", isTexte = e.type === "texte", isAuto = isCode || isTexte;
  const head = `<div class="row" data-a="toggleexo" data-id="${e.id}" style="cursor:pointer"><span class="chip gr">${s.type} ${s.numero}</span><span class="chip" title="difficulté">${"★".repeat(e.difficulte)}${"·".repeat(3 - e.difficulte)}</span>${isCode ? '<span class="chip gr">code Python</span>' : isTexte ? '<span class="chip gr">réponse courte</span>' : ""}<div class="sp"></div>${st === "ok" ? '<span class="chip ok">réussi</span>' : st === "redo" ? '<span class="chip wa">à refaire</span>' : ""}</div>
    <h3 data-a="toggleexo" data-id="${e.id}" style="margin:.6em 0 0;cursor:pointer">${e.titre}</h3>`;
  if (!open) return `<div class="card" style="margin:14px 0" id="${e.id}">${head}</div>`;
  return `<div class="card" style="margin:14px 0" id="${e.id}">${head}<div class="prose" style="margin-top:.3em">${e.enonce}</div>
    ${e.indice ? `<details><summary>Indice</summary><div class="prose">${e.indice}</div></details>` : ""}
    ${isCode ? codeBlockHtml(e) : isTexte ? texteBlockHtml(e, true) : ""}
    <details><summary>Voir le corrigé</summary><div class="prose">${e.corrige}</div>${isAuto ? "" : `<div class="row" style="margin-top:12px"><span class="small muted">Alors ?</span><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="ok">Je l'avais</button><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="redo">À refaire</button></div>`}</details></div>`;
}
function seanceExoCardHtml(s, L, mid) {
  const ok = L.filter((e) => state.exos[e.id]?.v === "ok").length;
  return `<a class="card" href="#/m/${mid}/exos?s=${s.id}" style="display:block;text-decoration:none;color:inherit">
    <div class="row nowrap"><b>${esc(s.type)} ${s.numero}</b><div class="sp"></div><span class="tiny ${ok === L.length ? "" : "muted"}">${ok}/${L.length} réussis</span></div>
    <div class="tiny muted" style="margin-top:4px">${esc(strip(s.titre))}</div>
  </a>`;
}
function exosHtml(mid, sid0) {
  const q = parse().q, sid = sid0 || q.s || "";
  const c = C(mid);
  const okCount = (list) => list.filter((e) => state.exos[e.id]?.v === "ok").length;
  if (sid) {
    const s = c.seances.find((x) => x.id === sid);
    const L = c.exercices.filter((e) => e.seance === sid);
    return `<div class="row" style="align-items:center"><a class="btn sm ghost" href="#/m/${mid}/exos">${icon("back")}Toutes les séances</a><div class="sp"></div><span class="muted small">${L.length} exercices · ${okCount(L)} réussis</span></div>
    <h2 style="margin:16px 0 2px">${s ? `${esc(s.type)} ${s.numero}` : ""}</h2>${s ? `<p class="tiny muted" style="margin:0 0 12px">${esc(strip(s.titre))}</p>` : ""}
    ${L.map((e) => exoCardHtml(e, mid, openExoId === e.id)).join("") || '<div class="empty">Aucun exercice pour cette séance.</div>'}`;
  }
  const header = `<div class="row"><span class="muted small">${c.exercices.length} exercices · ${okCount(c.exercices)} réussis au total</span></div>`;
  // Une carte par séance (pas une liste plate dépliée) : chaque exercice vient du cours qui
  // l'accompagnait, et une matière peut en cumuler des dizaines voire des centaines. Rangées en 3
  // colonnes par type (CM/TD/TP) plutôt qu'un flux unique mêlant les types dans l'ordre chronologique
  // (CSS Grid ferait un flux ligne par ligne, pas un vrai regroupement par colonne).
  const groups = c.seances.filter((s) => c.exercices.some((e) => e.seance === s.id)).map((s) => ({ s, L: c.exercices.filter((e) => e.seance === s.id) }));
  const columns = ["CM", "TD", "TP"].map((type) => groups.filter(({ s }) => s.type === type)).filter((col) => col.length);
  return `${header}<div class="row" style="align-items:flex-start;gap:14px;margin-top:12px">${columns.map((col) => `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">${col.map(({ s, L }) => seanceExoCardHtml(s, L, mid)).join("")}</div>`).join("")}</div>${groups.length ? "" : `<div class="empty">Aucun exercice pour l'instant.</div>`}`;
}
let codeResults = {}; // id -> dernier résultat d'exécution (mémoire seulement, pour survivre à un rerender)
function codeBlockHtml(e) {
  const code = state.reponses[e.id]?.value ?? e.codeStarter ?? "";
  return `<div class="field" style="margin-top:10px"><label>Ton code</label><textarea data-code-id="${e.id}" rows="10" style="${TA_STYLE}">${esc(code)}</textarea></div>
    <div class="row" style="margin-top:8px"><button class="btn sm pri" data-a="runcode" data-id="${e.id}">${icon("check")}Exécuter les tests</button></div>
    <div id="pyres-${e.id}">${codeResults[e.id] ? codeResultHtml(codeResults[e.id]) : ""}</div>`;
}
// Normalise une réponse texte pour une comparaison tolérante (casse, accents, espaces).
function normText(s) {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}
function toNum(s) {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null; // parseFloat tronque sinon "1/3" en 1 (faux positif)
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
// Une réponse texte accepte plusieurs formes valides séparées par « | » (ex. « 6|6.0|six »),
// comparées soit littéralement (texte normalisé), soit numériquement si les deux sont des nombres.
function checkTextAnswer(input, expected) {
  const accepted = String(expected ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const normInput = normText(input), numInput = toNum(input);
  return accepted.some((a) => normText(a) === normInput || (numInput !== null && toNum(a) === numInput));
}
// Un exercice "texte" a une ou plusieurs réponses attendues (`reponses`, une par sous-question de
// l'énoncé) — `reponse` (singulier) est l'ancien format à une seule réponse, conservé en repli pour
// les exercices jamais réédités depuis, afin de ne rien casser sans migration de données.
const expectedAnswers = (e) => (e.reponses?.length ? e.reponses : e.reponse ? [e.reponse] : []);
// Les chips ✓/✗ par sous-réponse vivent dans #txres (comme l'unique résultat de l'ancien format à
// une réponse), pas à côté de chaque champ : "Vérifier" ne patch que cette div en place (voir
// checktexte plus bas), jamais tout le bloc, donc tout ce qui doit changer après coup doit y être.
function texteBlockHtml(e, checked) {
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
function texteResultHtml(oks) {
  if (oks.length <= 1) { const ok = !!oks[0]; return `<div class="item" style="margin-top:8px"><span class="chip ${ok ? "ok" : "ko"}">${ok ? "✓ Bonne réponse" : "✗ Ce n'est pas ça"}</span></div>`; }
  return `<div class="row small" style="margin-top:8px;gap:8px;flex-wrap:wrap">${oks.map((ok, i) => `<span class="chip ${ok ? "ok" : "ko"}">Réponse ${i + 1} ${ok ? "✓" : "✗"}</span>`).join("")}</div>`;
}
// Note le résultat d'une correction automatique (code ou texte) : progression + éval en cours si active.
// Si un eval est en cours, la ligne `evals` est upsertée EN PREMIER (pour obtenir/retrouver son id
// serveur) afin que le résultat de l'exercice porte bien `eval_id` — c'est ce lien qui permet à la
// suppression de cet eval depuis l'historique de reprendre automatiquement (cascade) cette marque.
async function autoMark(id, ok) {
  const ex = D.E.find((e) => e.id === id);
  const mark = ok ? "ok" : "redo";
  let it = null;
  if (EV) {
    it = EV.items.find((x) => x.e.id === id);
    if (it) { it.mark = mark; await saveEvalRecord(); }
  }
  state.exos[id] = { v: mark, ts: Date.now() };
  await saveResult("exercice", id, { v: mark }, it ? EV.id : null);
  bump(2, "exercice");
  if (ex) snapshotElo(ex.mid);
  if (it) {
    const idx = EV.items.indexOf(it);
    const card = document.getElementById(`ev-${idx}`);
    const chip = card?.querySelector(".chip");
    if (chip) { chip.className = `chip ${it.mark === "ok" ? "ok" : "wa"}`; chip.textContent = it.mark === "ok" ? "réussi" : "à refaire"; }
  }
}
function codeResultHtml(r) {
  const total = r.results.length, passed = r.results.filter((x) => x.ok).length;
  return `${r.error ? `<div class="warn prose" style="padding:8px 12px;margin-top:8px"><b>Erreur :</b><pre style="white-space:pre-wrap;margin:4px 0 0">${esc(r.error)}</pre></div>` : ""}
    ${total ? `<div class="list" style="margin-top:8px">${r.results.map((x) => `<div class="item"><span class="chip ${x.ok ? "ok" : "ko"}">${x.ok ? "✓" : "✗"}</span><span>${esc(x.desc)}</span></div>`).join("")}</div><p class="small muted" style="margin-top:6px">${passed}/${total} tests réussis</p>` : ""}
    ${r.stdout ? `<details style="margin-top:8px"><summary>Sortie</summary><pre style="white-space:pre-wrap">${esc(r.stdout)}</pre></details>` : ""}`;
}
function bindExos(el) { $$("details", el).forEach((d) => d.addEventListener("toggle", () => d.open && renderMath(d))); }

// ───────────────────────── QCM / Éval ─────────────────────────
// Colonnes CM/TD/TP (même regroupement que l'onglet Exercices) plutôt qu'un flux unique mêlant les
// types dans l'ordre chronologique — et pas de case "Toutes" séparée : aucune coche sélectionne déjà
// tout (cf. message au-dessus du popover), une case en plus pour dire la même chose n'ajoutait que
// de la confusion.
function seanceChips(mids, selS, hasFn = (c, s) => c.qcm.some((q) => q.seance === s.id)) {
  return mids.map((mid) => {
    const c = C(mid), seances = c.seances.filter((s) => hasFn(c, s));
    const cols = ["CM", "TD", "TP"].map((type) => seances.filter((s) => s.type === type)).filter((col) => col.length);
    return `<div class="small muted" style="margin:10px 0 6px"><i class="dot" style="--c:${M(mid).couleur};display:inline-block"></i> ${esc(M(mid).court)}</div>
      <div class="row" style="align-items:flex-start;gap:16px">${cols.map((col) => `<div style="flex:1;min-width:0">
        <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">${esc(col[0].type)}</div>
        <div class="poplist">${col.map((s) => `<label><input type="checkbox" name="s" value="${sKey(mid, s.id)}" ${selS.has(sKey(mid, s.id)) ? "checked" : ""}><span>${esc(s.type)} ${s.numero}</span></label>`).join("")}</div>
      </div>`).join("")}</div>`;
  }).join("");
}
const NIV_LABEL = { 1: "Base", 2: "Moyen", 3: "Difficile" };
// Cartes matière à cocher : un ".mcard2" par matière, checkbox natif caché derrière toute la carte
// (voir .mcard2 en CSS) pour pouvoir en cocher plusieurs — combiner des matières dans un même QCM.
function matCardsHtml(selM, countFn = (m) => D.Q.filter((qq) => qq.mid === m.id).length, noun = "question") {
  return `<div class="mgrid2">${D.matieres.map((m) => `<label class="mcard2"><input type="checkbox" name="m" value="${m.id}" ${selM.has(m.id) ? "checked" : ""}><i class="dot" style="background:${m.couleur}"></i><b>${esc(m.court)}</b><span class="tiny muted">${plural(countFn(m), noun)}</span></label>`).join("")}</div>`;
}
// Barre d'outils pour les réglages secondaires : chaque bouton ouvre un petit menu flottant
// par-dessus la page (voir bindTicket) au lieu d'empiler niveau/nombre/mode/historique en
// permanence — la pile de rangées de pastilles identiques était justement ce qui rendait l'écran
// illisible. Le menu vit À L'INTÉRIEUR du bouton (nécessaire pour la fermeture au clic extérieur
// en CSS-free), donc bindTicket doit ignorer les clics qui viennent du menu lui-même.
function quizTicketHtml(statut) {
  const btn = (edit, icon, id) => `<button type="button" class="tbbtn" data-edit="${edit}"><span class="ic">${icon}</span><span class="v" id="${id}"></span>`;
  return `<div class="tb" id="qtk">
      ${btn("nb", "🔢", "tk-nb")}
        <div class="pop" data-panel="nb"><div class="poplist">
          <label><input type="radio" name="cnt" value="10"><span>10</span></label>
          <label><input type="radio" name="cnt" value="20" checked><span>20</span></label>
          <label><input type="radio" name="cnt" value="30"><span>30</span></label>
          <label><input type="radio" name="cnt" value="50"><span>50</span></label>
          <label><input type="radio" name="cnt" value="0"><span>Toutes</span></label>
        </div></div>
      </button>
      ${btn("niv", "📶", "tk-niv")}
        <div class="pop" data-panel="niv"><div class="poplist">
          <label><input type="checkbox" name="n" value="1" checked><span>Base</span></label>
          <label><input type="checkbox" name="n" value="2" checked><span>Moyen</span></label>
          <label><input type="checkbox" name="n" value="3" checked><span>Difficile</span></label>
        </div></div>
      </button>
      ${btn("sc", "📚", "tk-sc")}
        <div class="pop" data-panel="sc"><div class="tiny muted" style="margin-bottom:6px">Aucune coche = toutes les séances</div><div id="sc"></div></div>
      </button>
      ${btn("mode", "🎯", "tk-mode")}
        <div class="pop" data-panel="mode"><div class="poplist">
          <label><input type="radio" name="mode" value="train" checked><span>Entraînement — correction immédiate</span></label>
          <label><input type="radio" name="mode" value="exam"><span>Examen — correction à la fin</span></label>
        </div></div>
      </button>
      ${btn("hist", "🕘", "tk-hist")}
        <div class="pop" data-panel="hist"><div class="poplist">
          <label><input type="radio" name="statut" value="" ${statut === "" ? "checked" : ""}><span>Toutes les questions</span></label>
          <label><input type="radio" name="statut" value="wrong" ${statut === "wrong" ? "checked" : ""}><span>Seulement ratées la dernière fois</span></label>
          <label><input type="radio" name="statut" value="ok" ${statut === "ok" ? "checked" : ""}><span>Seulement réussies la dernière fois</span></label>
        </div></div>
      </button>
    </div>`;
}
// Un seul menu ouvert à la fois ; un clic sur son propre bouton ou ailleurs sur la page le referme.
// Renvoie la fonction de nettoyage à affecter à `cleanup` (écouteur document à retirer à la navigation).
function bindTicket(el) {
  $$(".tbbtn", el).forEach((b) => b.addEventListener("click", (e) => {
    if (e.target.closest(".pop")) return; // clic sur une option du menu : ne pas le refermer
    const panel = $(`.pop[data-panel="${b.dataset.edit}"]`, el);
    const wasOpen = panel.dataset.open === "true";
    $$(".pop", el).forEach((p) => delete p.dataset.open);
    $$(".tbbtn", el).forEach((c) => c.setAttribute("aria-expanded", "false"));
    if (!wasOpen) { panel.dataset.open = "true"; b.setAttribute("aria-expanded", "true"); }
  }));
  const onDocClick = (e) => { if (!e.target.closest(".tb")) { $$(".pop", el).forEach((p) => delete p.dataset.open); $$(".tbbtn", el).forEach((c) => c.setAttribute("aria-expanded", "false")); } };
  document.addEventListener("click", onDocClick);
  return () => document.removeEventListener("click", onDocClick);
}
function quizSetup(q) {
  const selM = new Set(q.m ? q.m.split(",") : IDS);
  const selS = new Set(q.s && q.m ? q.s.split(",").map((s) => sKey(q.m, s)) : []);
  const statut = ["wrong", "ok"].includes(q.statut) ? q.statut : "";
  return {
    html: `<h1>QCM</h1><p class="muted">Entraîne-toi avec correction immédiate, ou passe en mode « examen » (correction à la fin).</p>
    <form class="card" id="qf" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><label>Matières <span class="tiny">(plusieurs possibles)</span></label>${matCardsHtml(selM)}</div>
      ${quizTicketHtml(statut)}
      <div class="row"><button class="btn pri" type="submit">Commencer</button><span class="muted small" id="pc"></span></div></form>`,
    after: (el) => {
      const f = $("#qf", el);
      cleanup = bindTicket(el);
      const vals = () => { const fd = new FormData(f); return { mids: fd.getAll("m"), sids: new Set(fd.getAll("s")), niv: new Set(fd.getAll("n").map(Number)), statut: fd.get("statut") || "", cnt: +fd.get("cnt"), mode: fd.get("mode") }; };
      const updTicket = (v) => {
        $("#tk-nb", el).textContent = `${v.cnt === 0 ? "Toutes" : v.cnt} questions`;
        $("#tk-niv", el).textContent = v.niv.size === 3 ? "tous niveaux" : v.niv.size ? [...v.niv].sort().map((n) => NIV_LABEL[n]).join(" + ") : "aucun niveau";
        $("#tk-sc", el).textContent = v.sids.size ? plural(v.sids.size, "séance") : "toutes les séances";
        $("#tk-mode", el).textContent = v.mode === "exam" ? "Examen" : "Entraînement";
        $("#tk-hist", el).textContent = v.statut === "wrong" ? "historique : ratées" : v.statut === "ok" ? "historique : réussies" : "historique : toutes";
      };
      const upd = () => { const v = vals(); updTicket(v); $("#pc", el).textContent = `${poolQ(v).length} questions disponibles`; };
      f.addEventListener("change", (e) => {
        if (e.target.name === "m") { const cur = new Set(new FormData(f).getAll("s")); $("#sc", el).innerHTML = seanceChips(new FormData(f).getAll("m"), cur); }
        upd();
      });
      $("#sc", el).innerHTML = seanceChips([...selM], selS);
      f.addEventListener("submit", (e) => {
        e.preventDefault(); const v = vals(); let pool = poolQ(v);
        if (!pool.length) return toast("Aucune question avec ces critères.");
        pool = shuffle(pool); if (v.cnt) pool = pool.slice(0, v.cnt);
        startQuiz(pool, { mode: v.mode, title: v.statut === "wrong" ? "Mes erreurs" : v.statut === "ok" ? "Mes réussites" : "QCM", mid: null });
      });
      upd();
    },
  };
}
function poolQ({ mids, sids, niv, statut }) {
  return D.Q.filter((q) => mids.includes(q.mid) && (!sids.size || sids.has(sKey(q.mid, q.seance))) && niv.has(q.niveau) && (!statut || (statut === "wrong" ? state.qcm[q.id]?.last === false : state.qcm[q.id]?.last === true)));
}
function balanced(pool, n) {
  const g = {}; shuffle(pool).forEach((q) => (g[q.seance] = g[q.seance] || []).push(q));
  const lists = Object.values(g), out = [];
  while (out.length < n && lists.some((l) => l.length)) for (const l of lists) if (l.length && out.length < n) out.push(l.shift());
  return shuffle(out);
}
// Temps moyen estimé par exercice selon le niveau choisi, pour déduire automatiquement
// combien d'exercices composent l'épreuve à partir de la seule durée voulue.
const EXO_MINUTES = { 1: 12, 2: 18, 3: 25 };
function poolE({ mids, niv, seances = null }) {
  // Priorise les exercices du niveau demandé ; complète avec les niveaux les plus proches si le
  // cours n'en a pas assez à ce niveau précis pour remplir la durée choisie. `seances` restreint en
  // plus au programme d'un CC précis (voir ccOptionsHtml) plutôt qu'à toute la matière.
  const all = D.E.filter((e) => mids.includes(e.mid) && (!seances || seances.has(e.seance)));
  const exact = all.filter((e) => e.difficulte === niv);
  const rest = all.filter((e) => e.difficulte !== niv).sort((a, b) => Math.abs(a.difficulte - niv) - Math.abs(b.difficulte - niv));
  return [...exact, ...rest];
}
// Cartes matière à choix unique (même ".mcard2" que le QCM, mais des radios : une éval blanche
// porte sur une seule matière à la fois).
function matCardsHtmlSingle(mid) {
  return `<div class="mgrid2">${D.matieres.map((m) => `<label class="mcard2"><input type="radio" name="m" value="${m.id}" ${m.id === mid ? "checked" : ""}><i class="dot" style="background:${m.couleur}"></i><b>${esc(m.court)}</b><span class="tiny muted">${plural(D.E.filter((e) => e.mid === m.id).length, "exercice")}</span></label>`).join("")}</div>`;
}
// Options du menu "Portée" : un CC n'apparaît que s'il a des séances au programme renseignées
// (sinon rien à cibler dessus) — même source que ccReadiness.
function ccOptionsHtml(mid) {
  const ccs = D.cal.evenements.filter((e) => e.matiere === mid && e.seances?.length);
  return `<label><input type="radio" name="cc" value="" checked><span>Toute la matière</span></label>${ccs.map((c) => `<label><input type="radio" name="cc" value="${esc(c.id)}"><span>${esc(c.titre)}</span></label>`).join("")}`;
}
function evalTicketHtml(mid, mins) {
  return `<div class="tb" id="etk">
      <button type="button" class="tbbtn" data-edit="dur"><span class="ic">⏱️</span><span class="v" id="tk-dur"></span>
        <div class="pop" data-panel="dur"><div class="field" style="min-width:150px;gap:4px"><label class="tiny muted">Durée (minutes)</label><input type="number" name="t" min="10" max="180" step="5" value="${mins}"></div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="niv"><span class="ic">📶</span><span class="v" id="tk-eniv"></span>
        <div class="pop" data-panel="niv"><div class="poplist">
          <label><input type="radio" name="niv" value="1"><span>Base</span></label>
          <label><input type="radio" name="niv" value="2" checked><span>Moyen</span></label>
          <label><input type="radio" name="niv" value="3"><span>Difficile</span></label>
        </div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="cc"><span class="ic">🎯</span>Portée : <span class="v" id="tk-cc"></span>
        <div class="pop" data-panel="cc"><div class="poplist" id="cc-list">${ccOptionsHtml(mid)}</div></div>
      </button>
    </div>`;
}
function evalSetup(q) {
  const mid = q.m && M(q.m) ? q.m : (IDS[0] || D.matieres[0]?.id);
  if (!mid) return { html: `<h1>Éval blanche</h1><div class="empty">Ajoute d'abord une matière avec des exercices.</div>` };
  const m = M(mid);
  const last = Object.values(state.evals).sort((a, b) => b.ts - a.ts).slice(0, 6);
  return {
    html: `<h1>Éval blanche</h1><p class="muted">Choisis une durée et un niveau, ou cible directement un CC dont tu as renseigné les séances au programme (CC & notes → l'échéance → séances). L'app compose un sujet d'exercices à réponse rédigée qui tient dans ce temps, sans correction avant la fin.</p>
    <form class="card" id="ef" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><label>Matière</label>${matCardsHtmlSingle(mid)}</div>
      ${evalTicketHtml(mid, m.eval.minutes)}
      <div class="row"><button class="btn pri" type="submit">Démarrer l'épreuve</button><span class="muted small" id="epc"></span></div></form>
    ${last.length ? `<h3>Historique</h3><div class="card list">${last.map((e) => `<div class="item"><span class="badge">${fmt1(e.score20)}</span><div class="sp"><b>${esc(M(e.mid)?.court || e.mid)}</b> — ${fmt1(e.score20)}/20 (${e.ok}/${e.n})<div class="tiny muted">${new Date(e.ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</div></div></div>`).join("")}</div>` : ""}`,
    after: (el) => {
      const f = $("#ef", el);
      cleanup = bindTicket(el);
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
function startEval(pool, opt) {
  EV = { ...opt, i: 0, done: false, start: Date.now(), deadline: Date.now() + opt.minutes * 60000, items: pool.map((e) => ({ e, mark: null })) };
  location.hash = "#/eval/run";
  if (location.hash.endsWith("/run")) rerender();
}
function evalRunView() {
  if (EV.done) return EV.grading ? evalGradingView() : evalResult();
  const it = EV.items[EV.i], e = it.e, n = EV.items.length, last = EV.i === n - 1;
  const grid = `<div class="qgrid" aria-label="Navigation entre exercices">${EV.items.map((y, k) => `<button data-a="egoto" data-i="${k}" class="${k === EV.i ? "cur" : ""}">${k + 1}</button>`).join("")}</div>`;
  return {
    html: `<div class="qhead"><div class="crumbs" style="margin:0"><a href="#/eval">← Quitter</a></div><div class="sp"></div><span class="timer" id="tm" aria-live="off">--:--</span><span class="chip gr">${EV.i + 1} / ${n}</span></div>
    <div class="card"><div class="row" style="margin-bottom:4px">${tag(e.mid)}<span class="chip gr">${seanceOf(e.mid, e.seance).type} ${seanceOf(e.mid, e.seance).numero}</span><span class="chip" title="difficulté">${"★".repeat(e.difficulte)}${"·".repeat(3 - e.difficulte)}</span></div>
      <h3 style="margin:.6em 0 .3em">${esc(e.titre)}</h3><div class="prose">${e.enonce}</div>
      ${e.type === "code" ? codeBlockHtml(e) : e.type === "texte" ? texteBlockHtml(e, false) : ""}
      <div class="row" style="margin-top:18px"><button class="btn" data-a="eprev" ${EV.i === 0 ? "disabled" : ""}>${icon("back")}Précédent</button><div class="sp"></div>
        ${last ? `<button class="btn pri" data-a="efinish">Terminer l'épreuve</button>` : `<button class="btn pri" data-a="enext">Suivant ${icon("arrow")}</button>`}
      </div></div>
    <div class="card" style="margin-top:14px"><div class="row" style="margin-bottom:8px"><b>Exercices</b><div class="sp"></div><button class="btn sm" data-a="efinish">Terminer</button></div>${grid}</div>`,
    after: () => {
      const tick = () => { const left = EV.deadline - Date.now(); const t = $("#tm"); if (t) { t.textContent = fmtMMSS(left); t.classList.toggle("low", left < 60000); } if (left <= 0) finishEval(true); };
      tick(); const id = setInterval(tick, 500); cleanup = () => clearInterval(id);
    },
  };
}
function evalGradingView() {
  return { html: `<h1>${esc(EV.title)}</h1><div class="empty">${icon("clock")} Correction en cours — exécution de tous les exercices…</div>` };
}
// Corrige automatiquement tous les exercices de la session (code : on relance les tests ;
// texte : on recompare la réponse) à partir de la dernière version enregistrée de chacun —
// aucune action manuelle par exercice n'est nécessaire, comme un vrai rendu de copie.
async function finishEval(timeout) {
  if (!EV || EV.done) return;
  EV.done = true; EV.end = Date.now(); EV.timeout = !!timeout; EV.grading = true;
  if (cleanup) { cleanup(); cleanup = null; }
  rerender();
  await saveEvalRecord();
  for (const it of EV.items) {
    const e = it.e;
    if (e.type === "code") {
      const code = state.reponses[e.id]?.value ?? e.codeStarter ?? "";
      try {
        const { runPythonExercise } = await import("./pyrun.js");
        const r = await runPythonExercise(code, e.codeTests);
        codeResults[e.id] = r;
        const ran = r.results.length || r.error;
        it.mark = ran && !r.error && r.results.every((x) => x.ok) ? "ok" : "redo";
      } catch (err) {
        it.mark = "redo";
      }
    } else if (e.type === "texte") {
      const answers = expectedAnswers(e), values = state.reponses[e.id]?.values || [];
      const oks = answers.map((a, i) => checkTextAnswer(values[i] ?? "", a));
      const ok = answers.length > 0 && oks.every(Boolean);
      setEntry("reponses", e.id, { values, oks, ok });
      it.mark = ok ? "ok" : "redo";
    }
    if (it.mark) { state.exos[e.id] = { v: it.mark, ts: Date.now() }; await saveResult("exercice", e.id, { v: it.mark }, EV.id); snapshotElo(e.mid); }
  }
  await saveEvalRecord();
  EV.grading = false;
  rerender();
}
function evalScore() {
  const n = EV.items.length, ok = EV.items.filter((it) => it.mark === "ok").length, marked = EV.items.filter((it) => it.mark).length;
  return { n, ok, marked };
}
// La copie doit rester consultable telle qu'elle a été rendue, même si l'exercice est retenté
// plus tard ailleurs dans l'appli (state.reponses est partagé et se réécrit à chaque essai) — on
// fige donc ici une copie de la réponse et du résultat de chaque item, au lieu de ne garder que
// les compteurs agrégés par séance.
function evalItemSnapshot(it) {
  const e = it.e, snap = { eid: e.id, mark: it.mark };
  if (e.type === "code") { snap.code = state.reponses[e.id]?.value ?? e.codeStarter ?? ""; snap.results = codeResults[e.id] || null; }
  else if (e.type === "texte") { const r = state.reponses[e.id]; snap.values = r?.values || []; snap.oks = r?.oks || []; }
  return snap;
}
// Upserte la ligne `evals` (même id serveur réutilisé à chaque rappel, stocké sur EV.id dès la
// première sauvegarde) : appelée avant toute correction d'exercice dans finishEval pour que
// saveResult() puisse déjà rattacher ses résultats à cet eval via eval_id.
async function saveEvalRecord() {
  const { n, ok } = evalScore();
  const by = {}; EV.items.forEach((it) => { const s = by[it.e.seance] || (by[it.e.seance] = [0, 0]); s[1]++; if (it.mark === "ok") s[0]++; });
  const rec = { id: EV.id, mid: EV.mid, n, ok, score20: (ok / n) * 20, dur: Math.round(((EV.end || Date.now()) - EV.start) / 1000), seances: by, items: EV.items.map(evalItemSnapshot) };
  EV.id = await saveEval(rec);
  state.evals[EV.id] = { ...rec, id: EV.id, ts: Date.now() };
  bump(3, "eval");
  commit();
}
function texteReviewHtml(e, snap) {
  const answers = expectedAnswers(e), n = Math.max(1, answers.length);
  const values = snap.values || [], oks = snap.oks || [];
  return Array.from({ length: n }, (_, i) => `<div class="item"${i ? ' style="margin-top:6px"' : ""}><span class="chip ${oks[i] ? "ok" : "ko"}">${oks[i] ? "✓" : "✗"}</span><div class="sp">${esc(values[i] || "(vide)")}</div></div>`).join("");
}
// Revue d'une copie d'éval passée, à partir du snapshot figé au moment du rendu (pas de l'état
// courant des exercices, qui a pu bouger depuis) — accessible depuis l'historique même longtemps après.
function evalReviewPage(id) {
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
      <details style="margin-top:10px" open><summary>Voir le corrigé</summary><div class="prose" style="margin-top:8px">${e.corrige}</div></details>
      </div>`;
    }).join("") : `<div class="empty">Le détail de cette copie n'a pas été enregistré (essai antérieur à cette fonctionnalité).</div>`}`,
  };
}
function evalResult() {
  const dur = Math.round((EV.end - EV.start) / 1000), { n, ok, marked } = evalScore(), s20 = (ok / n) * 20;
  return {
    html: `<h1>${esc(EV.title)} — correction</h1>${EV.timeout ? '<div class="warn prose" style="padding:10px 14px"><b>Temps écoulé —</b> l\'épreuve a été rendue et corrigée automatiquement.</div>' : '<p class="muted">Tous les exercices ont été corrigés automatiquement à partir de ta dernière version enregistrée.</p>'}
    ${marked === n ? `<div class="card row" style="gap:26px;margin:14px 0"><div><div class="score">${fmt1(s20)}<span class="muted" style="font-size:1.2rem"> / 20</span></div><div class="muted">${ok} / ${n} réussis · ${Math.floor(dur / 60)} min ${dur % 60} s</div></div></div>` : ""}
    <div class="row" style="margin:14px 0"><a class="btn" href="#/eval">Nouvelle session</a><a class="btn ghost" href="#/">Accueil</a></div>
    ${EV.items.map((it, k) => { const e = it.e, se = seanceOf(e.mid, e.seance), isAuto = e.type === "code" || e.type === "texte"; return `<div class="card" style="margin:12px 0" id="ev-${k}"><div class="row"><span class="chip ${it.mark === "ok" ? "ok" : it.mark === "redo" ? "wa" : "gr"}">${it.mark === "ok" ? "réussi" : it.mark === "redo" ? "à refaire" : "à corriger"}</span>${tag(e.mid)}<span class="chip gr">${se.type} ${se.numero}</span><div class="sp"></div><span class="tiny muted">Ex. ${k + 1}</span></div>
      <h3 style="margin:.6em 0 .3em">${esc(e.titre)}</h3><div class="prose">${e.enonce}</div>
      ${e.type === "code" ? codeBlockHtml(e) : e.type === "texte" ? texteBlockHtml(e, true) : ""}
      ${e.indice ? `<details style="margin-top:10px"><summary>Indice</summary><div class="prose" style="margin-top:8px">${e.indice}</div></details>` : ""}
      <details style="margin-top:10px" ${it.mark ? "open" : ""}><summary>Voir le corrigé</summary><div class="prose" style="margin-top:8px">${e.corrige}</div></details>
      ${isAuto ? "" : `<div class="row" style="margin-top:12px"><button class="btn sm ${it.mark === "ok" ? "pri" : ""}" data-a="emark" data-i="${k}" data-v="ok">${icon("check")}Réussi</button><button class="btn sm ${it.mark === "redo" ? "pri" : ""}" data-a="emark" data-i="${k}" data-v="redo">À refaire</button></div>`}
    </div>`; }).join("")}`,
  };
}
function startQuiz(pool, opt) {
  Q = {
    ...opt, i: 0, done: false, start: Date.now(), deadline: opt.timed ? Date.now() + opt.minutes * 60000 : 0,
    qs: pool.map((q) => ({ q, order: isRef(q) ? q.choix.map((_, k) => k) : shuffle(q.choix.map((_, k) => k)), ans: new Set(), checked: false, flag: false })),
  };
  location.hash = "#/qcm/run";
  if (location.hash.endsWith("/run")) rerender();
}
const okQ = (x) => x.ans.size === x.q.rep.length && x.q.rep.every((r) => x.ans.has(r));
// N'est appelée qu'en mode examen (voir finishQuiz) : l'entraînement (correction immédiate,
// sans enjeu, pensé pour être fait n'importe où) ne doit laisser aucune trace, ni dans les stats
// de précision/progression ni dans l'Elo — seul l'examen (chronométré, correction à la fin) compte.
async function recordQ(x) {
  const cur = state.qcm[x.q.id] || { n: 0, ok: 0, last: false };
  const good = okQ(x);
  const entry = { n: cur.n + 1, ok: cur.ok + (good ? 1 : 0), last: good };
  state.qcm[x.q.id] = entry;
  await saveResult("qcm", x.q.id, entry);
  snapshotElo(x.q.mid);
  bump(1, "qcm");
}
function quizView() {
  if (Q.done) return quizResult();
  const x = Q.qs[Q.i], q = x.q, m = M(q.mid), n = Q.qs.length, exam = Q.mode === "exam";
  const multi = q.type === "multiple";
  const rev = x.checked;
  const letters = "ABCDE";
  const choices = x.order.map((oi, pos) => {
    const sel = x.ans.has(oi), good = q.rep.includes(oi);
    const cls = rev ? (good && sel ? "good" : good ? "miss" : sel ? "bad" : "") : sel ? "sel" : "";
    return `<button type="button" class="choice ${cls}" data-a="choose" data-i="${oi}" data-multi="${multi ? 1 : 0}" ${rev ? "disabled" : ""} role="${multi ? "checkbox" : "radio"}" aria-checked="${sel}"><span class="k">${letters[pos]}</span><span>${q.choix[oi]}</span></button>`;
  }).join("");
  const grid = exam ? `<div class="qgrid" aria-label="Navigation entre questions">${Q.qs.map((y, k) => `<button data-a="goto" data-i="${k}" class="${k === Q.i ? "cur" : ""} ${y.ans.size ? "done" : ""} ${y.flag ? "flag" : ""}" aria-label="Question ${k + 1}">${k + 1}</button>`).join("")}</div>` : "";
  const good = okQ(x);
  const expl = rev ? `<div class="expl ${good ? "ok" : "ko"}"><b>${good ? "Bonne réponse." : "Pas tout à fait."}</b> ${q.expl}</div>` : "";
  const last = Q.i === n - 1;
  return {
    html: `<div class="qhead"><div class="crumbs" style="margin:0"><a href="#/qcm">← Quitter</a></div><div class="sp"></div>${Q.timed ? `<span class="timer" id="tm" aria-live="off">--:--</span>` : ""}<span class="chip gr">${Q.i + 1} / ${n}</span></div>
    <div class="bar" style="margin-bottom:14px"><i style="width:${((Q.i + (rev ? 1 : 0)) / n) * 100}%"></i></div>
    <div class="card"><div class="row" style="margin-bottom:4px">${tag(q.mid)}<span class="chip gr">${seanceOf(q.mid, q.seance).type} ${seanceOf(q.mid, q.seance).numero}</span>${multi ? '<span class="chip wa">plusieurs réponses</span>' : ""}<span class="chip gr">${["", "base", "moyen", "difficile"][q.niveau]}</span></div>
      <div class="qtext">${q.q}</div><div role="${multi ? "group" : "radiogroup"}">${choices}</div>${expl}
      <div class="row" style="margin-top:18px">
        ${exam ? `<button class="btn sm ghost" data-a="flag">${icon("flag")}${x.flag ? "Retirer le repère" : "Marquer"}</button>` : ""}
        <button class="btn" data-a="prev" ${Q.i === 0 ? "disabled" : ""}>${icon("back")}Précédent</button><div class="sp"></div>
        ${exam ? (last ? `<button class="btn pri" data-a="finish">Terminer l'épreuve</button>` : `<button class="btn pri" data-a="next">Suivante ${icon("arrow")}</button>`)
          : rev ? (last ? `<button class="btn pri" data-a="finish">Voir le bilan</button>` : `<button class="btn pri" data-a="next">Suivante ${icon("arrow")}</button>`)
          : `<button class="btn pri" data-a="check" ${x.ans.size ? "" : "disabled"}>Valider</button>`}
      </div></div>
    ${exam ? `<div class="card" style="margin-top:14px"><div class="row" style="margin-bottom:8px"><b>Questions</b><span class="muted small">${Q.qs.filter((y) => y.ans.size).length}/${n} répondues</span><div class="sp"></div><button class="btn sm" data-a="finish">Terminer</button></div>${grid}</div>` : ""}`,
    after: (el) => {
      if (Q.timed) {
        const tick = () => { const left = Q.deadline - Date.now(); const t = $("#tm"); if (t) { t.textContent = fmtMMSS(left); t.classList.toggle("low", left < 60000); } if (left <= 0) { finishQuiz(true); } };
        tick(); const id = setInterval(tick, 500); cleanup = () => clearInterval(id);
      }
    },
  };
}
function finishQuiz(timeout) {
  if (!Q || Q.done) return;
  Q.done = true; Q.end = Date.now(); Q.timeout = !!timeout;
  const exam = Q.mode === "exam";
  if (exam) Q.qs.forEach((x) => { if (x.ans.size) { x.checked = true; recordQ(x).catch((err) => toast("Erreur : " + err.message)); } });
  const ok = Q.qs.filter(okQ).length, n = Q.qs.length;
  Q.ok = ok;
  commit();
  if (cleanup) { cleanup(); cleanup = null; }
  rerender();
}
function quizResult() {
  const n = Q.qs.length, ok = Q.ok, s20 = (ok / n) * 20, exam = Q.mode === "exam";
  const dur = Math.round((Q.end - Q.start) / 1000);
  const by = {}; Q.qs.forEach((x) => { const k = sKey(x.q.mid, x.q.seance); const s = by[k] || (by[k] = [0, 0]); s[1]++; if (okQ(x)) s[0]++; });
  const wrong = Q.qs.filter((x) => !okQ(x));
  const msg = s20 >= 16 ? "Excellent." : s20 >= 12 ? "Solide, quelques points à consolider." : s20 >= 10 ? "Tu passes, mais fragile : reprends les erreurs." : "À retravailler : relis les cours liés aux erreurs ci-dessous.";
  return {
    html: `<h1>${esc(Q.title)} — bilan</h1>${Q.timeout ? '<div class="warn prose" style="padding:10px 14px"><b>Temps écoulé —</b> l\'épreuve a été rendue automatiquement.</div>' : ""}
    <div class="card row" style="gap:26px;margin:14px 0"><div><div class="score">${fmt1(s20)}<span class="muted" style="font-size:1.2rem"> / 20</span></div><div class="muted">${ok} / ${n} bonnes réponses · ${Math.floor(dur / 60)} min ${dur % 60} s</div></div><div class="sp"><b>${msg}</b>
      <div class="small muted" style="margin-top:6px">${Object.entries(by).map(([k, v]) => { const [mm, ss] = k.split("/"); const se = seanceOf(mm, ss); return `${esc(M(mm).court)} ${se.type} ${se.numero} : ${v[0]}/${v[1]}`; }).join(" · ")}</div></div></div>
    <div class="row"><button class="btn pri" data-a="retry" ${wrong.length ? "" : "disabled"}>Refaire mes ${wrong.length} erreurs</button><a class="btn" href="#/qcm">Nouvelle session</a><a class="btn ghost" href="#/">Accueil</a></div>
    <h2>Correction</h2>${Q.qs.map((x, k) => { const q = x.q, good = okQ(x); const se = seanceOf(q.mid, q.seance); return `<div class="card" style="margin:12px 0"><div class="row"><span class="chip ${good ? "ok" : "ko"}">${good ? "juste" : x.ans.size ? "faux" : "sans réponse"}</span>${tag(q.mid)}<a class="small" href="#/c/${q.mid}/${q.seance}">${se.type} ${se.numero} — voir le cours</a><div class="sp"></div><span class="tiny muted">Q${k + 1}</span></div><div class="qtext" style="font-size:1rem">${q.q}</div>
      ${x.order.map((oi, pos) => { const sel = x.ans.has(oi), g = q.rep.includes(oi); return `<div class="choice ${g && sel ? "good" : g ? "miss" : sel ? "bad" : ""}" style="cursor:default" data-multi="${q.type === "multiple" ? 1 : 0}"><span class="k">${"ABCDE"[pos]}</span><span>${q.choix[oi]}</span></div>`; }).join("")}
      <div class="expl ${good ? "ok" : "ko"}">${q.expl}</div></div>`; }).join("")}`,
  };
}

// ───────────────────────── Flashcards ─────────────────────────
const DAYS = [0, 1, 3, 7, 14, 30];
function poolF({ mids, sids, mode, cnt }) {
  const now = Date.now();
  let L = D.F.filter((f) => mids.includes(f.mid) && (!sids.size || sids.has(sKey(f.mid, f.seance))));
  const due = L.filter((f) => state.cards[f.id] && state.cards[f.id].due <= now);
  const fresh = L.filter((f) => !state.cards[f.id]);
  if (mode === "due") return shuffle(due).concat(shuffle(fresh)).slice(0, cnt || 9999);
  if (mode === "new") return shuffle(fresh).slice(0, cnt || 9999);
  return shuffle(L).slice(0, cnt || 9999);
}
const CARDMODE_LABEL = { due: "à revoir + nouvelles", new: "nouvelles seulement", all: "toutes" };
const hasFlash = (c, s) => c.flashcards.some((f) => f.seance === s.id);
function cardsTicketHtml(mode) {
  return `<div class="tb" id="ctk">
      <button type="button" class="tbbtn" data-edit="mode"><span class="ic">🔁</span><span class="v" id="tk-cmode"></span>
        <div class="pop" data-panel="mode"><div class="poplist">
          <label><input type="radio" name="mode" value="due" ${mode !== "new" && mode !== "all" ? "checked" : ""}><span>À revoir + nouvelles</span></label>
          <label><input type="radio" name="mode" value="new" ${mode === "new" ? "checked" : ""}><span>Nouvelles seulement</span></label>
          <label><input type="radio" name="mode" value="all" ${mode === "all" ? "checked" : ""}><span>Toutes (révision libre)</span></label>
        </div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="cnt"><span class="ic">🔢</span><span class="v" id="tk-ccnt"></span>
        <div class="pop" data-panel="cnt"><div class="poplist">
          <label><input type="radio" name="cnt" value="10"><span>10</span></label>
          <label><input type="radio" name="cnt" value="20" checked><span>20</span></label>
          <label><input type="radio" name="cnt" value="40"><span>40</span></label>
          <label><input type="radio" name="cnt" value="0"><span>Toutes</span></label>
        </div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="sc"><span class="ic">📚</span><span class="v" id="tk-csc"></span>
        <div class="pop" data-panel="sc"><div class="tiny muted" style="margin-bottom:6px">Aucune coche = toutes les séances</div><div id="sc"></div></div>
      </button>
    </div>`;
}
function cardsSetup(q) {
  const selM = new Set(q.m ? q.m.split(",") : IDS);
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
      cleanup = bindTicket(el);
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
      f.addEventListener("submit", (e) => { e.preventDefault(); const cards = poolF(vals()); if (!cards.length) return toast("Aucune carte à travailler avec ces critères."); FC = { cards, i: 0, flip: false, again: new Set(), good: 0, total: cards.length, done: false }; location.hash = "#/cards/run"; });
      upd();
    },
  };
}
function cardsView() {
  if (FC.done || FC.i >= FC.cards.length) {
    FC.done = true;
    return { html: `<h1>Session terminée</h1><div class="card" style="text-align:center"><div class="score">${FC.good}<span class="muted" style="font-size:1.2rem"> / ${FC.total}</span></div><p class="muted">cartes sues du premier coup · ${FC.again.size} à revoir bientôt</p><div class="row" style="justify-content:center"><a class="btn pri" href="#/cards">Nouvelle session</a><a class="btn" href="#/">Accueil</a></div></div>` };
  }
  const f = FC.cards[FC.i], c = state.cards[f.id], back = FC.flip;
  return {
    html: `<div class="qhead"><div class="crumbs" style="margin:0"><a href="#/cards">← Quitter</a></div><div class="sp"></div><span class="chip gr">${FC.i + 1} / ${FC.cards.length}</span></div>
    <div class="bar" style="margin-bottom:14px"><i style="width:${(FC.i / FC.cards.length) * 100}%"></i></div>
    <div class="row" style="margin-bottom:8px">${tag(f.mid)}<span class="chip gr">${seanceOf(f.mid, f.seance).type} ${seanceOf(f.mid, f.seance).numero}</span><span class="chip gr">${c ? "boîte " + c.box : "nouvelle"}</span></div>
    <div class="fc ${back ? "back" : ""}" data-a="flip" tabindex="0" role="button" aria-label="Retourner la carte"><div><div class="lbl">${back ? "Réponse" : "Question"}</div><div>${back ? f.verso : f.recto}</div>${back ? "" : '<div class="tiny muted" style="margin-top:18px">Touche pour retourner · Espace</div>'}</div></div>
    ${back ? `<div class="rate"><button class="btn" data-a="rate" data-r="again" style="border-color:var(--ko);color:var(--ko)">À revoir</button><button class="btn" data-a="rate" data-r="good">Je savais</button><button class="btn pri" data-a="rate" data-r="easy">Facile</button></div>` : `<div class="row" style="margin-top:14px;justify-content:center"><button class="btn pri" data-a="flip">Voir la réponse</button></div>`}`,
    after: (el) => { const k = (e) => { if (e.code === "Space" || e.key === " ") { e.preventDefault(); if (!FC.flip) { FC.flip = true; rerender(); } } else if (FC.flip && ["1", "2", "3"].includes(e.key)) rate({ 1: "again", 2: "good", 3: "easy" }[e.key]); }; document.addEventListener("keydown", k); cleanup = () => document.removeEventListener("keydown", k); },
  };
}
function rate(r) {
  const f = FC.cards[FC.i], cur = state.cards[f.id] || { box: 0, n: 0, ok: 0 };
  let box = r === "again" ? 1 : Math.min(5, Math.max(1, cur.box) + (r === "easy" ? 2 : 1));
  if (cur.box === 0 && r !== "again") box = r === "easy" ? 3 : 2;
  const entry = { box, n: cur.n + 1, ok: cur.ok + (r === "again" ? 0 : 1), due: r === "again" ? Date.now() : Date.now() + DAYS[box] * 864e5 };
  state.cards[f.id] = entry;
  saveResult("carte", f.id, entry).catch((err) => toast("Erreur : " + err.message));
  bump(1, "carte");
  if (r === "again") { if (!FC.again.has(f.id)) { FC.again.add(f.id); FC.cards.push(f); } }
  else if (!FC.again.has(f.id)) FC.good++;
  FC.i++; FC.flip = false;
  commit(); rerender();
}

// ───────────────────────── Emploi du temps ─────────────────────────
const pd = (d, hm) => { const [y, m, dd] = d.split("-").map(Number), [h, mi] = (hm || "0:0").split(":").map(Number); return new Date(y, m - 1, dd, h, mi); };
const toMin = (hm) => { const [h, m] = (hm || "0:0").split(":").map(Number); return h * 60 + m; };
const edtOf = (iso) => D.edt.events.filter((e) => e.d === iso).sort((a, b) => (a.s || "").localeCompare(b.s || ""));
const edtLabel = (e) => (e.t === "Férié" ? "Jour férié" : e.t === "Fermeture" ? "Université fermée" : e.t);
const edtColor = (e) => (e.m && M(e.m) ? M(e.m).couleur : "var(--muted)");
const edtName = (e) => (e.m && M(e.m) ? M(e.m).court : e.t);
const edtMeta = (e) => [e.r, e.p, e.g].filter(Boolean).map(esc).join(" · ");
const edtMetaRaw = (e) => [e.r, e.p, e.g].filter(Boolean).join(" · ");
const edtState = (e, now) => (e.e ? (pd(e.d, e.e) <= now ? "past" : pd(e.d, e.s) <= now ? "live" : "") : "");
// Une séance peut exister en base (créée vide dès le premier clic sur "Rédiger ce cours", via
// edtDraft — voir plus bas) sans qu'aucun cours y ait jamais été rédigé : le seul fait qu'une ligne
// existe ne veut rien dire pour l'utilisateur, seul `contenu` compte.
const seanceHasContent = (s) => !!(s?.contenu && s.contenu.replace(/<[^>]+>/g, "").trim());
// A-t-on déjà déposé de la matière (document, note manuscrite ou tapée) pour cette séance, même si
// elle n'a pas encore été rédigée (`contenu` vide) ? Sert à distinguer "rien n'a été fait" de
// "j'ai de quoi écrire le cours, il ne reste qu'à le rédiger".
const seanceHasMaterial = (mid, s) => !!(s && (D.docSids.has(s.id) || (state.seanceNotes[sKey(mid, s.id)]?.text || "").trim()));
// Associe un créneau de l'EDT à la séance de cours correspondante (même matière, même date, même
// type). Un CC n'est plus un type d'EDT à part (voir e.cc) : c'est un vrai créneau Cours/TD/TP qui
// se comporte exactement pareil pour ce qui est de s'y attacher une séance.
const EDT_TYPE_MAP = { Cours: "CM", TD: "TD", TP: "TP" };
// `e.sid` (lien explicite, posé à la création de la séance — voir "creerseance") prime toujours.
// Le matching par date+type+matière ne reste qu'un repli pour les créneaux pas encore liés
// (anciens essais .ics, ou créés avant l'ajout de sid).
function seanceFor(e) {
  const want = EDT_TYPE_MAP[e.t];
  if (!want || !e.m) return null;
  const c = C(e.m);
  if (!c) return null;
  if (e.sid) { const s = c.seances.find((x) => x.id === e.sid); if (s) return s; }
  const cands = c.seances.filter((s) => s.date === e.d && s.type === want).sort((a, b) => a.numero - b.numero);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  const sameDay = D.edt.events.filter((x) => x.d === e.d && x.m === e.m && x.t === e.t).sort((a, b) => toMin(a.s) - toMin(b.s));
  return cands[sameDay.indexOf(e)] ?? cands[0];
}
function draftHrefFor(e) {
  const want = EDT_TYPE_MAP[e.t];
  if (!want || !e.m) return null;
  return `#/todo?id=${e.id}&m=${e.m}&d=${e.d}&t=${encodeURIComponent(e.t)}&s=${e.s}&e=${e.e}&r=${encodeURIComponent(e.r || "")}&p=${encodeURIComponent(e.p || "")}&g=${encodeURIComponent(e.g || "")}`;
}
function edtCard(e, now, top, height, left, width, px) {
  const st = edtState(e, now), sc = seanceFor(e), written = seanceHasContent(sc);
  const compact = px < 58, micro = px < 32;
  const tt = esc([`${e.s}–${e.e}`, edtName(e), edtMetaRaw(e), e.n, e.cc ? "CC" : ""].filter(Boolean).join(" · "));
  // Le corps de la carte se comporte pareil pour tous les types : lien vers le cours s'il existe
  // déjà, sinon vers l'espace docs/notes à créer (href via draftHrefFor), sinon rien de cliquable —
  // c'est toujours le crayon qui modifie heure/date/matière/type, jamais le corps.
  const href = sc ? `#/c/${e.m}/${sc.id}` : draftHrefFor(e);
  const tag = href ? "a" : "div";
  const status = written ? `<span class="tiny edt-link">${icon("book")}${esc(sc.type)} ${sc.numero}</span>`
    : href ? (seanceHasMaterial(e.m, sc) ? `<span class="tiny edt-link">${icon("edit")}Rédiger ce cours</span>` : `<span class="tiny muted">Aucune note ou doc</span>`) : "";
  // Le bouton crayon est un <button> frère du <a>/<div>, jamais imbriqué dedans (markup invalide
  // sinon) : c'est pour ça que tout le positionnement absolu passe sur .edt-ev-wrap désormais,
  // .edt-ev se contentant de remplir ce wrapper (voir style.css).
  return `<div class="edt-ev-wrap" style="top:${top}%;height:${height}%;left:${left}%;width:calc(${width}% - 3px)">
    <${tag} class="edt-ev ${e.cc ? "hascc " : ""}${st}${href ? " clickable" : ""}" style="--c:${edtColor(e)}" title="${tt}"${href ? ` href="${href}"` : ""}>
      <div class="edt-h"><b>${e.s}${micro ? "" : "–" + e.e}</b>${!micro ? `<span class="chip gr">${esc(e.t)}</span>` : ""}${!micro && e.cc ? '<span class="chip wa">CC</span>' : ""}${!micro && st === "live" ? '<span class="chip ok">en cours</span>' : ""}</div>
      ${!micro ? `<div class="edt-t">${esc(edtName(e))}</div>` : ""}
      ${!compact && edtMeta(e) ? `<div class="tiny muted">${edtMeta(e)}</div>` : ""}${!compact && e.n ? `<div class="tiny edt-n">${esc(e.n)}</div>` : ""}
      ${!compact ? status : ""}</${tag}>
    <button type="button" class="edt-editbtn" data-a="edtedit" data-id="${esc(e.id)}" aria-label="Modifier ce créneau" title="Modifier">${icon("edit")}</button>
  </div>`;
}
const edtRel = (iso) => { const d = daysUntil(iso); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : fmtLong(iso); };
function edtRow(e, now, rel) {
  const c = edtColor(e), st = edtState(e, now), sc = seanceFor(e), written = seanceHasContent(sc);
  const href = sc ? `#/c/${e.m}/${sc.id}` : draftHrefFor(e) || "#/edt";
  const statusTxt = written ? `${esc(sc.type)} ${sc.numero}` : href !== "#/edt" ? (seanceHasMaterial(e.m, sc) ? "à rédiger" : "aucune note ou doc") : "";
  return `<a class="item edt-row ${st}" href="${href}"><span class="badge" style="background:color-mix(in srgb,${c} 15%,var(--surface));color:${c}">${e.s}</span><div class="sp"><b>${esc(edtName(e))}</b> <span class="chip gr">${esc(e.t)}</span>${e.cc ? ' <span class="chip wa">CC</span>' : ""}${st === "live" ? ' <span class="chip ok">en cours</span>' : ""}<div class="tiny muted">${rel ? edtRel(e.d) + " · " : ""}${e.s}–${e.e}${edtMeta(e) ? " · " + edtMeta(e) : ""}${statusTxt ? " · " + statusTxt : ""}</div></div></a>`;
}
// Nombre de créneaux visés dans la carte "Aujourd'hui" : si la journée en a moins, on complète
// avec les prochains cours à venir (jusqu'à EDT_UPCOMING_MAX) pour ne jamais laisser la carte
// à moitié vide — sans jamais dépasser EDT_HOME_MAX créneaux au total (journée + prochains cours).
const EDT_HOME_MAX = 5, EDT_UPCOMING_MAX = 3;
function edtHome() {
  if (!D.edt.events.length) return "";
  const now = new Date(), iso = todayKey();
  const day = edtOf(iso), timedAll = day.filter((e) => !e.allday), off = day.find((e) => e.allday);
  const timed = timedAll.slice(0, EDT_HOME_MAX);
  const head = timedAll.length ? "" : `<div class="small muted" style="margin:4px 0 8px">${off ? esc(edtLabel(off)) + " aujourd'hui." : "Pas de cours aujourd'hui."}</div>`;
  const doneMsg = timedAll.length && !timedAll.some((e) => pd(e.d, e.e) > now) ? '<div class="small muted" style="margin:4px 0 8px">Journée terminée.</div>' : "";
  const upcoming = timed.length < EDT_HOME_MAX
    ? D.edt.events.filter((e) => !e.allday && e.t !== "Réunion" && e.d !== iso && pd(e.d, e.e) > now).sort((a, b) => pd(a.d, a.s) - pd(b.d, b.s)).slice(0, Math.min(EDT_UPCOMING_MAX, EDT_HOME_MAX - timed.length))
    : [];
  return `<div class="card"><div class="row"><h3 style="margin:0">Aujourd'hui</h3><div class="sp"></div><a class="btn sm ghost" href="#/edt">${icon("grid")}Emploi du temps</a></div>
    ${head}<div class="list">${timed.map((e) => edtRow(e, now)).join("")}</div>${doneMsg}
    ${upcoming.length ? `<div class="tiny muted" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.06em">${upcoming.length > 1 ? "Prochains cours" : "Prochain cours"}</div><div class="list">${upcoming.map((e) => edtRow(e, now, true)).join("")}</div>` : ""}</div>`;
}
let edtWeek = null;
const mondayOf = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const EDT_HOUR_PX = 64;
function edt() {
  if (!D.edt.events.length) {
    if (!sync.user) return { html: `<h1>Emploi du temps</h1><div class="empty">Connecte-toi pour importer ton emploi du temps.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
    return {
      html: `<h1>Emploi du temps</h1><div class="empty">Aucun emploi du temps importé.<div style="margin-top:10px"><a class="btn pri" href="#/compte">${icon("dl")}Importer mon EDT</a></div></div>
      <div class="row" style="margin-top:14px"><h3 style="margin:0">Ou ajoute un créneau à la main</h3><div class="sp"></div><button type="button" class="btn sm pri" data-a="addedt" aria-label="Ajouter un créneau">+</button></div>`,
    };
  }
  if (!edtWeek) edtWeek = mondayOf(new Date());
  const now = new Date(), today = todayKey();
  const days = [...Array(7)].map((_, i) => { const d = new Date(edtWeek); d.setDate(d.getDate() + i); return d; });
  const shown = days.slice(5).some((d) => edtOf(todayKey(d)).length) ? days : days.slice(0, 5);
  const fd = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const fs = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

  const byDay = shown.map((d) => { const iso = todayKey(d), evs = edtOf(iso); return { d, iso, all: evs.filter((e) => e.allday), tm: evs.filter((e) => !e.allday) }; });
  const timedAll = byDay.flatMap((x) => x.tm);
  const dayStart = timedAll.length ? Math.min(8, ...timedAll.map((e) => Math.floor(toMin(e.s) / 60))) : 8;
  const dayEnd = timedAll.length ? Math.max(19, ...timedAll.map((e) => Math.ceil(toMin(e.e) / 60))) : 19;
  const spanMin = (dayEnd - dayStart) * 60, gridH = (dayEnd - dayStart) * EDT_HOUR_PX;
  const hours = [...Array(dayEnd - dayStart + 1)].map((_, i) => dayStart + i);

  // Assigne une "voie" à chaque créneau pour gérer les chevauchements horaires
  const lanes = (tm) => {
    const sorted = [...tm].sort((a, b) => toMin(a.s) - toMin(b.s));
    const active = [];
    const placed = sorted.map((e) => {
      const s = toMin(e.s), en = toMin(e.e);
      for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= s) active.splice(i, 1);
      const used = new Set(active.map((a) => a.lane));
      let lane = 0; while (used.has(lane)) lane++;
      active.push({ end: en, lane });
      return { e, lane };
    });
    const laneCount = Math.max(1, ...placed.map((x) => x.lane + 1));
    return placed.map(({ e, lane }) => ({ e, lane, laneCount }));
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayCol = ({ iso, tm, all }) => {
    const evHtml = lanes(tm).map(({ e, lane, laneCount }) => {
      const s = toMin(e.s), en = Math.max(toMin(e.e), s + 15);
      const top = ((s - dayStart * 60) / spanMin) * 100, h = ((en - s) / spanMin) * 100;
      const w = 100 / laneCount;
      return edtCard(e, now, top, h, lane * w, w, ((en - s) / 60) * EDT_HOUR_PX);
    }).join("");
    const nowLine = iso === today && nowMin >= dayStart * 60 && nowMin <= dayEnd * 60
      ? `<div class="edt-now" style="top:${((nowMin - dayStart * 60) / spanMin) * 100}%"></div>` : "";
    const empty = !tm.length && !all.length ? `<div class="tiny muted edt-empty">Libre</div>` : "";
    return `<div class="edt-gcol${iso === today ? " today" : ""}" style="height:${gridH}px">${empty}${evHtml}${nowLine}</div>`;
  };

  const heads = byDay.map(({ d, iso, all }) => `<div class="edt-gh${iso === today ? " today" : ""}"><h3>${fd.format(d)}</h3>${all.map((e) => `<span class="chip gr">${esc(edtLabel(e))}</span>`).join("")}</div>`).join("");
  const cols = byDay.map(dayCol).join("");
  const axisLabels = hours.map((h) => `<span style="top:${((h - dayStart) / (dayEnd - dayStart)) * 100}%">${h} h</span>`).join("");

  const wkEv = timedAll;
  const hrs = wkEv.reduce((a, e) => a + (toMin(e.e) - toMin(e.s)) / 60, 0);

  return {
    html: `<h1>Emploi du temps</h1>
    <div class="row" style="margin:6px 0 14px"><button class="btn sm" data-a="edtprev" aria-label="Semaine précédente">${icon("back")}</button><b style="min-width:170px;text-align:center">${fs.format(shown[0])} – ${fs.format(shown[shown.length - 1])}</b><button class="btn sm" data-a="edtnext" aria-label="Semaine suivante">${icon("arrow")}</button><button class="btn sm ghost" data-a="edttoday">Aujourd'hui</button><div class="sp"></div><span class="tiny muted">${plural(wkEv.length, "créneau", "créneaux")} · ${String(Math.round(hrs * 10) / 10).replace(".", ",")} h dans la semaine</span><button type="button" class="btn sm pri" data-a="addedt" aria-label="Ajouter un créneau">+</button></div>
    <div class="edt-wrap"><div class="edt-inner" style="--n:${shown.length};--hpx:${EDT_HOUR_PX}px">
      <div class="edt-corner"></div>${heads}
      <div class="edt-axis" style="height:${gridH}px">${axisLabels}</div>${cols}
    </div></div>
    <p class="tiny muted" style="margin-top:14px">Source : emploi du temps UPS (${esc(D.edt.source || "")}). Les horaires peuvent changer : vérifie sur l'ENT en cas de doute.</p>`,
  };
}
const EDT_TYPES = ["Cours", "TD", "TP", "Réunion", "Férié", "Fermeture"];
// Formulaire unique pour ajouter OU modifier un créneau à la main (bouton "+" du header, ou
// crayon sur une carte de la grille) — remplace l'ancien sélecteur "changer le type" isolé.
function edtEventForm(e) {
  const isNew = !e;
  const v = e || { id: "", d: todayKey(), s: "08:00", e: "10:00", t: "Cours", m: "", r: "", p: "", g: "", n: "", cc: false, allday: false };
  const ccMatiere = !isNew && v.cc ? (M(v.m) || matiereFromCCLabel(v.n)) : null;
  const ccLinked = !isNew && (D.cal.evenements.find((x) => x.edtId === v.id) || D.cal.evenements.find((x) => x.matiere === v.m && x.date === v.d));
  return `${ccMatiere ? `<div class="row" style="margin-bottom:12px">${ccLinked ? `<a class="btn sm ghost" href="#/cal">${icon("cal")}Voir dans Notes &amp; CC</a>` : `<button class="btn sm pri" type="button" data-a="addccsugg" data-m="${esc(ccMatiere.id)}" data-date="${v.d}" data-titre="${esc(v.n || "CC")}" data-edt-id="${esc(v.id)}">${icon("check")}Ajouter à mes échéances (${esc(ccMatiere.court)})</button>`}</div>` : ""}
  <form data-a="saveedt">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <div class="grid g2">
      <div class="field"><label>Matière</label><select name="m"><option value="">(aucune)</option>${D.matieres.map((mm) => `<option value="${esc(mm.id)}" ${v.m === mm.id ? "selected" : ""}>${esc(mm.nom)}</option>`).join("")}</select></div>
      <div class="field"><label>Type</label><select name="t">${EDT_TYPES.map((t) => `<option value="${t}" ${v.t === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Date</label><input type="date" name="d" required value="${esc(v.d || "")}"></div>
      <div class="field" style="align-self:end"><label class="row small" style="gap:6px"><input type="checkbox" name="allday" ${v.allday ? "checked" : ""}> Toute la journée</label></div>
      <div class="field"><label>Début</label><input type="time" name="s" value="${esc(v.s || "")}"></div>
      <div class="field"><label>Fin</label><input type="time" name="e" value="${esc(v.e || "")}"></div>
      <div class="field"><label>Salle</label><input type="text" name="r" value="${esc(v.r || "")}" placeholder="ex. B204"></div>
      <div class="field"><label>Groupe</label><input type="text" name="g" value="${esc(v.g || "")}" placeholder="ex. TD2"></div>
    </div>
    <label class="row small" style="gap:6px;margin-top:10px"><input type="checkbox" name="cc" ${v.cc ? "checked" : ""}> Contrôle continu pendant ce créneau</label>
    <div class="field" style="margin-top:10px"><label>Note</label><input type="text" name="n" value="${esc(v.n || "")}" placeholder="intitulé affiché sous le créneau, ou détails du CC"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Ajouter" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="deledt" data-id="${esc(v.id)}">Supprimer</button>`}
      <button class="btn ghost" type="button" data-a="canceledt">Annuler</button>
    </div>
  </form>`;
}
// Popup centrée (pas un panneau en bas de page) pour ajouter OU modifier un créneau — ouverte par
// le "+" de l'en-tête ou le crayon d'une carte, fermée par Annuler/Échap/clic hors de la boîte.
// Même mécanisme que l'overlay d'écriture manuscrite pour être retirée au changement de route :
// elle s'enregistre dans `cleanup`, rappelé au tout début de route().
function openEdtModal(e) {
  closeEdtModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${e ? "Modifier le créneau" : "Ajouter un créneau"}">
    <div class="row" style="margin-bottom:12px"><h3 style="margin:0">${e ? "Modifier le créneau" : "Ajouter un créneau"}</h3><div class="sp"></div><button type="button" class="btn sm ghost" data-a="canceledt" aria-label="Fermer">✕</button></div>
    ${edtEventForm(e)}
  </div>`;
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) closeEdtModal(); });
  document.addEventListener("keydown", edtModalEsc);
  document.body.appendChild(backdrop);
  $$('form[data-a="saveedt"]', backdrop).forEach((f) => f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    try {
      const d = fd.get("d");
      const id = await saveEdtEvent({ id: fd.get("id") || undefined, d, s: fd.get("s"), e: fd.get("e"), t: fd.get("t"), m: fd.get("m") || null, sid: e?.sid, r: fd.get("r"), p: fd.get("p"), g: fd.get("g"), n: fd.get("n"), cc: fd.get("cc") === "on", allday: fd.get("allday") === "on" });
      // Un créneau déplacé/modifié répercute sa date sur l'échéance CC liée (edtId), pour que les
      // deux restent coordonnés sans avoir à les modifier séparément à chaque changement d'horaire.
      const linkedCC = D.cal.evenements.find((x) => x.edtId === id);
      if (linkedCC && linkedCC.date !== d) await saveCCEvent({ ...linkedCC, date: d });
      // Même chose pour la séance de cours liée (lien explicite e.sid, plus besoin de deviner par
      // date+type+matière) : sans ça elle reste sur l'ancienne date, se détache du créneau dans
      // l'EDT (qui propose alors de "recréer" un cours) et continue de s'afficher à l'ancienne
      // date dans la vue matière.
      const linkedSeance = e?.sid && e.m ? C(e.m)?.seances.find((s) => s.id === e.sid) : null;
      if (linkedSeance && d !== e.d) await saveSeance(e.m, { ...linkedSeance, date: d });
      toast("Créneau enregistré");
      closeEdtModal();
      await loadData(); rerender();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
  cleanup = closeEdtModal;
}
function closeEdtModal() {
  $$(".modal-backdrop").forEach((b) => b.remove());
  document.removeEventListener("keydown", edtModalEsc);
  if (cleanup === closeEdtModal) cleanup = null;
}
const edtModalEsc = (ev) => { if (ev.key === "Escape") closeEdtModal(); };
// Un créneau d'EDT sans séance correspondante n'en crée plus une automatiquement au simple clic —
// juste regarder un créneau pour voir de quoi il s'agit ne doit jamais laisser une séance vide
// traîner dans la matière. On affiche un écran de confirmation ("Créer CM 3 ?") et seul un clic
// explicite sur le bouton crée réellement la séance (data-a="creerseance", plus bas).
function edtDraft(q) {
  const m = M(q.m), want = EDT_TYPE_MAP[q.t];
  if (!m || !want || !q.d) return { html: `<div class="empty">Créneau introuvable.</div>` };
  const sameType = C(q.m).seances.filter((x) => x.type === want);
  const numero = sameType.length ? Math.max(...sameType.map((x) => x.numero)) + 1 : 1;
  const meta = [q.r, q.p, q.g].filter(Boolean).join(" · ");
  return {
    html: `<div class="crumbs"><a href="#/edt">Emploi du temps</a> › ${esc(m.court)}</div>
    <h1>Créer ${esc(want)} ${numero} ?</h1>
    <div class="card" style="max-width:520px">
      <div class="row nowrap"><i class="dot" style="--c:${m.couleur}"></i><b>${esc(m.nom)}</b></div>
      <p class="muted" style="margin:10px 0 4px">${esc(fmtLong(q.d))} · ${esc(q.s)}–${esc(q.e)}${meta ? " · " + esc(meta) : ""}</p>
      <p class="small muted">Ce créneau n'a pas encore de séance dans l'appli. La créer ajoute « ${esc(want)} ${numero} » à la matière avec un espace de travail vide (notes, documents) — tu pourras rédiger le cours plus tard, ou juste y déposer des documents.</p>
      <div class="row" style="margin-top:16px">
        <button type="button" class="btn pri" data-a="creerseance" data-id="${esc(q.id || "")}" data-m="${esc(q.m)}" data-d="${esc(q.d)}" data-t="${esc(q.t)}">${icon("check")}Créer ${esc(want)} ${numero}</button>
        <a class="btn ghost" href="#/edt">Annuler</a>
      </div>
    </div>`,
  };
}

// ───────────────────────── Calendrier ─────────────────────────
// ── Ajout d'échéances CC : formulaire manuel, suggestions depuis l'EDT, analyse IA ──
// Case à cocher par séance (CM/TD/TP), groupée par type — "au programme" de ce CC, pour restreindre
// le calcul de préparation (ccReadiness) à ce périmètre plutôt qu'à toute la matière.
function ccSeancesPicker(mid, selected) {
  const c = C(mid);
  if (!c?.seances.length) return `<p class="tiny muted" style="margin:0">Aucune séance dans cette matière.</p>`;
  const sel = new Set(selected || []);
  const groups = {};
  c.seances.forEach((s) => (groups[s.type] || (groups[s.type] = [])).push(s));
  return Object.entries(groups).map(([type, list]) => `
    <div class="tiny muted" style="margin:8px 0 4px;text-transform:uppercase;letter-spacing:.04em">${esc(type)}</div>
    <div class="row" style="gap:10px;flex-wrap:wrap">${list.map((s) => `<label class="row small" style="gap:5px;min-width:0"><input type="checkbox" name="seances" value="${esc(s.id)}" ${sel.has(s.id) ? "checked" : ""}>${esc(s.type)} ${s.numero}</label>`).join("")}</div>`).join("");
}
function ccEntryForm(e) {
  const isNew = !e;
  const v = e || { id: "", matiere: D.matieres[0]?.id || "", titre: "", date: "", poids: "", type: "CC", statut: "", detail: "", edtId: "", seances: [] };
  if (!D.matieres.length) return `<p class="small muted">Crée d'abord une matière (Compte → Mes matières) avant d'ajouter une échéance.</p>`;
  return `<form data-a="savecc">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <input type="hidden" name="edtId" value="${esc(v.edtId || "")}">
    <div class="grid g2">
      <div class="field"><label>Matière</label><select name="matiere" required>${D.matieres.map((m) => `<option value="${esc(m.id)}" ${v.matiere === m.id ? "selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></div>
      <div class="field"><label>Date</label><input type="date" name="date" required value="${esc(v.date || "")}"></div>
      <div class="field"><label>Titre</label><input type="text" name="titre" required value="${esc(v.titre)}" placeholder="ex. CC1"></div>
      <div class="field"><label>Poids</label><input type="text" name="poids" value="${esc(v.poids)}" placeholder="ex. 20 %"></div>
    </div>
    <details style="margin-top:10px" ${v.seances?.length ? "open" : ""}><summary>Séances au programme <span class="tiny muted">(score de préparation)</span></summary>
      <div id="ccSeancesPick" style="margin-top:6px">${ccSeancesPicker(v.matiere, v.seances)}</div>
    </details>
    <details style="margin-top:10px"><summary>Options avancées</summary>
      <div class="grid g2" style="margin-top:10px">
        <div class="field"><label>Type</label><select name="type"><option value="CC" ${v.type !== "2e" ? "selected" : ""}>Normal</option><option value="2e" ${v.type === "2e" ? "selected" : ""}>2e chance</option></select></div>
        <div class="field"><label>Statut</label><select name="statut"><option value="" ${!v.statut ? "selected" : ""}>Confirmé</option><option value="provisoire" ${v.statut === "provisoire" ? "selected" : ""}>Date provisoire</option></select></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Détail</label><input type="text" name="detail" value="${esc(v.detail)}"></div>
    </details>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Ajouter" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="delcc" data-id="${esc(v.id)}">Supprimer</button>`}
      <button class="btn ghost" type="button" data-a="cancelcc">Annuler</button>
    </div>
  </form>`;
}
// Les événements CC importés depuis l'ICS n'ont pas de matière rattachée (e.m est null :
// le résumé ne correspond pas au format d'un cours/TD/TP) mais leur libellé (ex. « Bas — CC »)
// contient le nom de la matière avant le tiret : on essaie de le retrouver par ce nom.
function matiereFromCCLabel(n) {
  if (!n) return null;
  const name = n.split(/\s[-–—]\s/)[0].trim().toLowerCase();
  return D.matieres.find((m) => m.nom.toLowerCase() === name || m.court.toLowerCase() === name) || null;
}
function ccSuggestionsHtml() {
  const linked = new Set(D.cal.evenements.map((e) => e.edtId).filter(Boolean));
  const have = new Set(D.cal.evenements.map((e) => e.matiere + "|" + e.date));
  const sugg = D.edt.events
    .filter((e) => e.cc && !linked.has(e.id))
    .map((e) => ({ e, mid: e.m || matiereFromCCLabel(e.n)?.id }))
    .filter(({ e, mid }) => mid && !have.has(mid + "|" + e.d));
  if (!sugg.length) return "";
  return `<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">Suggestions depuis ton emploi du temps</h3>
    <div class="list">${sugg.map(({ e, mid }) => `<div class="item"><div class="sp"><b>${esc(M(mid)?.court || "")}</b> — ${esc((e.n || "Examen").replace(/^.*?[-–—]\s*/, ""))}<div class="tiny muted">${fmtLong(e.d)} · ${e.s}–${e.e}</div></div><button class="btn sm" data-a="addccsugg" data-m="${esc(mid)}" data-date="${e.d}" data-titre="${esc(e.n || "CC")}" data-edt-id="${esc(e.id)}">${icon("check")}Ajouter</button></div>`).join("")}</div></div>`;
}
// Relie une échéance CC (cc_events, saisie dans Notes & CC) au cours qui la contient, si on en
// trouve un : d'abord le créneau EDT marqué cc=true pour cette matière/date (le lien le plus
// précis, posé depuis le crayon de l'EDT), sinon à défaut une séance de la même matière ce jour-là.
function ccSeance(ev) {
  const edt = (ev.edtId && D.edt.events.find((x) => x.id === ev.edtId)) || D.edt.events.find((x) => x.cc && x.m === ev.matiere && x.d === ev.date);
  if (edt) { const s = seanceFor(edt); if (s) return s; }
  return C(ev.matiere)?.seances.find((s) => s.date === ev.date) || null;
}
// Popup centrée pour ajouter OU modifier une échéance CC — même mécanisme que openEdtModal/
// closeEdtModal (voir plus haut) : overlay ajouté directement au body, fermé par Annuler/Échap/
// clic hors de la boîte, et enregistré dans `cleanup` pour disparaître au changement de route.
function openCCModal(e) {
  closeCCModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${e ? "Modifier l'échéance" : "Ajouter une échéance"}">
    <div class="row" style="margin-bottom:12px"><h3 style="margin:0">${e ? "Modifier l'échéance" : "Ajouter une échéance"}</h3><div class="sp"></div><button type="button" class="btn sm ghost" data-a="cancelcc" aria-label="Fermer">✕</button></div>
    ${ccEntryForm(e)}
  </div>`;
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) closeCCModal(); });
  document.addEventListener("keydown", ccModalEsc);
  document.body.appendChild(backdrop);
  // Les séances cochées appartiennent à l'ancienne matière : changer de matière réinitialise la
  // sélection plutôt que de laisser des ids d'une autre matière traîner dans le formulaire.
  $('select[name="matiere"]', backdrop)?.addEventListener("change", (ev) => {
    const pick = $("#ccSeancesPick", backdrop);
    if (pick) pick.innerHTML = ccSeancesPicker(ev.target.value, []);
  });
  $$('form[data-a="savecc"]', backdrop).forEach((f) => f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    try {
      await saveCCEvent({ id: fd.get("id") || undefined, matiere: fd.get("matiere"), date: fd.get("date"), titre: fd.get("titre"), poids: fd.get("poids"), type: fd.get("type"), statut: fd.get("statut"), detail: fd.get("detail"), edtId: fd.get("edtId") || null, seances: fd.getAll("seances") });
      toast("Échéance enregistrée");
      closeCCModal();
      await loadData(); rerender();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
  cleanup = closeCCModal;
}
function closeCCModal() {
  $$(".modal-backdrop").forEach((b) => b.remove());
  document.removeEventListener("keydown", ccModalEsc);
  if (cleanup === closeCCModal) cleanup = null;
}
const ccModalEsc = (ev) => { if (ev.key === "Escape") closeCCModal(); };
// Popup déclenchée en cliquant une échéance CC dans la grille mensuelle (remplace l'ancien
// panneau générique #evd, qui n'avait ni la même DA que les autres popups ni de vraie mise en
// forme). Réutilise closeCCModal/ccModalEsc, génériques (ferment n'importe quel .modal-backdrop).
function openCCInfoModal(ev) {
  closeCCModal();
  const m = M(ev.matiere), sc = ccSeance(ev), rd = ccReadiness(ev);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${esc(ev.titre)}" style="border-left:4px solid ${m.couleur}">
    <div class="row nowrap" style="margin-bottom:4px"><i class="dot" style="--c:${m.couleur}"></i><b>${esc(m.nom)}</b><div class="sp"></div><button type="button" class="btn sm ghost" data-a="cancelcc" aria-label="Fermer">✕</button></div>
    <h3 style="margin:4px 0 2px">${esc(ev.titre)}</h3>
    <div class="row small muted" style="gap:6px;flex-wrap:wrap">${esc(fmtLong(ev.date))}<span class="chip gr">${esc(fmtPoids(ev.poids))}</span>${ev.type === "2e" ? '<span class="chip wa">2e chance</span>' : ""}${ev.statut === "provisoire" ? '<span class="chip wa">date provisoire</span>' : ""}<span class="chip ${daysUntil(ev.date) < 0 ? "gr" : "ok"}">${cd(ev)}</span>${daysUntil(ev.date) < 0 && ccNote(ev) ? ccNoteChip(ccNote(ev)) : ""}</div>
    ${rd ? `<div class="row small" style="margin-top:8px;gap:6px"><span class="muted">Préparation (${ev.seances.length} séance${ev.seances.length > 1 ? "s" : ""})</span><span class="chip ${rd.tier.cls}">${rd.rating} · ${esc(rd.tier.name)}</span></div>` : ""}
    ${ev.detail ? `<p class="small" style="margin-top:10px">${esc(ev.detail)}</p>` : ""}
    ${sc ? `<a class="btn sm ghost" style="margin-top:6px" href="#/m/${ev.matiere}">${icon("book")}Voir la matière</a>` : ""}
    <div class="row" style="margin-top:14px">
      <a class="btn sm pri" href="#/eval?m=${ev.matiere}">Éval blanche</a>
      <a class="btn sm" href="#/qcm?m=${ev.matiere}">QCM</a>
      <a class="btn sm" href="#/m/${ev.matiere}/cc">Fiche CC</a>
      <div class="sp"></div>
      <button type="button" class="btn sm ghost" data-a="editcc" data-id="${esc(ev.id)}" aria-label="Modifier ${esc(ev.titre)}">${icon("edit")}</button>
    </div>
  </div>`;
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) closeCCModal(); });
  document.addEventListener("keydown", ccModalEsc);
  document.body.appendChild(backdrop);
  cleanup = closeCCModal;
}
// Note obtenue à une épreuve CC, retrouvée dans le calculateur (state.notes) : on rapproche le
// code du titre (« CC2 », « CCI1 », « Note 3 »…, avant le tiret) de celui des champs du
// calculateur ; si plusieurs champs partagent le code (Algo CC1 — QCM 1 / QCM 2), on départage
// avec le reste du titre. Renvoie { v, max } ou null si pas de champ ou pas de note saisie.
function ccNote(ev) {
  const K = CALC[ev.matiere]; if (!K) return null;
  const nm = (x) => norm(x || "").replace(/\s+/g, " ").trim();
  // Le code d'une échéance ("CC1", "CCI2", "Note 3"…) n'est pas toujours suivi d'un tiret dans le
  // titre saisi à la main ("CC1 Système" vs "CC1 — QCM 1") : on extrait lettres+chiffre en tête
  // de chaîne plutôt que de dépendre d'un séparateur, et on ramène "CCI" (libellés du
  // calculateur) à "CC" (libellés des échéances) pour que les deux conventions se rejoignent.
  const codeMatch = (s) => nm(s).match(/^([a-zéèêàù]+)\s?(\d+(?:\.\d+)?)?/);
  const codeOf = (m) => (m ? m[1].replace(/^cci/, "cc") + (m[2] || "") : "");
  const tm = codeMatch(ev.titre), titreCode = codeOf(tm);
  const tail = tm ? nm(ev.titre).slice(tm[0].length).trim() : "";
  let cands = K.champs.filter(([, l]) => codeOf(codeMatch(l.split(/\s[-–—]\s|\s\(/)[0])) === titreCode);
  if (cands.length > 1) cands = cands.filter(([, l]) => tail && nm(l).includes(tail));
  if (cands.length !== 1) return null;
  const [k, , mx] = cands[0], v = state.notes[ev.matiere]?.v?.[k];
  return v === "" || v === null || v === undefined || isNaN(+v) ? null : { v: +v, max: mx || 20 };
}
const ccNoteChip = (n) => `<span class="chip ${n.v >= n.max / 2 ? "ok" : "ko"}">${fmt1(n.v)}/${n.max}</span>`;
let calMonth = null, calSeances = false;
function calendar(q) {
  if (!sync.user) return { html: `<h1>Calendrier</h1><div class="empty">Connecte-toi pour voir ton calendrier.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
  if (!calMonth) { const t = new Date(); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); const has = D.cal.evenements.some((e) => { const d = parseDay(e.date); return d.getFullYear() === calMonth.getFullYear() && d.getMonth() === calMonth.getMonth(); }); const nx = nextEvents(1)[0]; if (!has && nx) { const d = parseDay(nx.date); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); } }
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  const first = new Date(y, mo, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const evs = D.cal.evenements;
  const ses = calSeances ? IDS.flatMap((id) => C(id).seances.map((s) => ({ ...s, mid: id }))) : [];
  const today = todayKey();
  let cells = "";
  for (let i = 0; i < off; i++) cells += `<div class="d out"></div>`;
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const e = evs.filter((x) => x.date === iso), s = ses.filter((x) => x.date === iso);
    cells += `<div class="d ${iso === today ? "today" : ""}"><b>${d}</b>${e.map((x) => `<button class="ev" style="--c:${M(x.matiere).couleur}" data-a="evt" data-id="${x.id}" title="${esc(M(x.matiere).court + " — " + x.titre)}">${esc(M(x.matiere).court)} · ${esc(x.titre.split(" — ")[0])}</button>`).join("")}${s.map((x) => `<a class="ev se" style="--c:${M(x.mid).couleur}" href="#/c/${x.mid}/${x.id}">${esc(M(x.mid).court)} ${x.type}${x.numero}</a>`).join("")}</div>`;
  }
  const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(calMonth);
  const upcoming = D.cal.evenements.filter((e) => daysUntil(e.date) >= 0);
  const past = D.cal.evenements.filter((e) => daysUntil(e.date) < 0);
  const line = (e) => { const sc = ccSeance(e), nt = daysUntil(e.date) < 0 ? ccNote(e) : null, rd = !nt ? ccReadiness(e) : null; return `<div class="item cc-line" style="--c:${M(e.matiere).couleur}"><span class="badge" style="background:color-mix(in srgb,${M(e.matiere).couleur} 15%,var(--surface));color:${M(e.matiere).couleur};font-size:.66rem">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(M(e.matiere).court)}</b> — ${esc(e.titre)} <span class="chip gr">${esc(fmtPoids(e.poids))}</span>${e.type === "2e" ? ' <span class="chip wa">2e chance</span>' : ""}${e.statut && e.poids !== "à confirmer" ? ` <span class="chip wa">${e.statut === "provisoire" ? "date provisoire" : "à confirmer"}</span>` : ""}${rd ? ` <span class="chip ${rd.tier.cls}" title="Préparation sur les séances au programme">${rd.rating} Elo</span>` : ""}<div class="tiny muted">${fmtLong(e.date)} · ${esc(e.detail)}</div></div>${nt ? ccNoteChip(nt) : `<span class="count small muted">${daysUntil(e.date) >= 0 ? "J-" + daysUntil(e.date) : "passé"}</span>`}${sc ? `<a class="btn sm ghost" href="#/m/${e.matiere}" aria-label="Voir la matière">${icon("book")}</a>` : ""}<button type="button" class="btn sm ghost" data-a="editcc" data-id="${esc(e.id)}" aria-label="Modifier ${esc(e.titre)}">${icon("edit")}</button><button type="button" class="btn sm ghost" data-a="delcc" data-id="${esc(e.id)}" aria-label="Supprimer ${esc(e.titre)}">✕</button></div>`; };
  return {
    html: `<h1>Calendrier</h1>
    ${ccSuggestionsHtml()}
    <div class="row" style="margin:6px 0 14px"><button class="btn sm" data-a="calprev" aria-label="Mois précédent">${icon("back")}</button><b style="min-width:150px;text-align:center;text-transform:capitalize">${monthName}</b><button class="btn sm" data-a="calnext" aria-label="Mois suivant">${icon("arrow")}</button><button class="btn sm ghost" data-a="caltoday">Aujourd'hui</button><div class="sp"></div><label class="row small"><input type="checkbox" data-a="calses" ${calSeances ? "checked" : ""}> Afficher les séances</label><button class="btn sm" data-a="ics">${icon("dl")}Export .ics</button></div>
    <div class="cal">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells}</div>
    <div class="row" style="align-items:center;margin:0"><h2 style="margin:0">À venir</h2><div class="sp"></div><button type="button" class="btn sm pri" data-a="addcc" aria-label="Ajouter une échéance">+</button></div>
    <div class="card list">${upcoming.map(line).join("") || '<div class="empty">Rien à venir.</div>'}</div>
    ${D.cal.remarques.length ? `<div class="warn prose" style="margin-top:14px;padding:12px 16px"><b>À compléter —</b><ul>${D.cal.remarques.map((r) => `<li><b>${esc(M(r.matiere).court)}</b> : ${esc(r.texte)}</li>`).join("")}</ul></div>` : ""}
    ${past.length ? `<details><summary>Épreuves passées (${past.length})</summary><div class="list">${past.map(line).join("")}</div></details>` : ""}`,
  };
}
function icsExport() {
  const pad = (n) => String(n).padStart(2, "0");
  const ev = D.cal.evenements.map((e) => { const d = parseDay(e.date), n = new Date(d.getTime() + 864e5); const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`; return ["BEGIN:VEVENT", `UID:${e.id}@revisions-l1s1`, `DTSTAMP:${f(new Date())}T000000Z`, `DTSTART;VALUE=DATE:${f(d)}`, `DTEND;VALUE=DATE:${f(n)}`, `SUMMARY:${M(e.matiere).court} — ${e.titre} (${e.poids})`, `DESCRIPTION:${e.detail.replace(/[,;]/g, " ")}`, "END:VEVENT"].join("\r\n"); });
  download("calendrier-CC-S1.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Revisions L1 S1//FR", ...ev, "END:VCALENDAR"].join("\r\n"), "text/calendar");
}

// ───────────────────────── Mes matières (admin) ─────────────────────────
function slugify(s, existingIds = D.matieres.map((m) => m.id)) {
  const base = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "item";
  let id = base, i = 2;
  while (existingIds.includes(id)) id = `${base}-${i++}`;
  return id;
}
const PALETTE = ["#1F3A5F", "#2E7D6B", "#7A5FB0", "#C28A1E", "#3457A6", "#2F8FBF", "#C0507F", "#B4432F", "#4B6B3A", "#8A5A44"];
function paletteHtml(v) {
  return `<div class="palette" role="radiogroup" aria-label="Couleur">${PALETTE.map((c) => `<label class="swatch" style="--c:${c}"><input type="radio" name="couleur" value="${c}" ${v === c ? "checked" : ""}><span></span></label>`).join("")}</div>`;
}
function matiereFormHtml(m) {
  const isNew = !m;
  const v = m || { id: "", nom: "", court: "", ue: "", couleur: PALETTE[0], desc: "", cc: "", pdfCC: "", ects: 0, periode: D.periodes.find((p) => p.statut === "actif")?.id || "", eval: { n: 15, minutes: 15 } };
  return `<form data-a="savematiere">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <div class="grid g2">
      <div class="field"><label>Nom</label><input type="text" name="nom" required value="${esc(v.nom)}" placeholder="ex. Philosophie"></div>
      <div class="field"><label>Période</label><select name="periode"><option value="">Aucune (toujours visible)</option>${D.periodes.map((p) => `<option value="${esc(p.id)}" ${v.periode === p.id ? "selected" : ""}>${esc(p.nom)}${p.statut === "termine" ? " (terminée)" : ""}</option>`).join("")}</select></div>
      <div class="field"><label>ECTS</label><input type="number" name="ects" min="0" step="1" value="${v.ects || 0}"></div>
      <div class="field"><label>Couleur</label>${paletteHtml(v.couleur)}</div>
    </div>
    <details style="margin-top:10px"><summary>Options avancées</summary>
      <div class="grid g2" style="margin-top:10px">
        <div class="field"><label>Nom court (menu)</label><input type="text" name="court" value="${esc(v.court)}" placeholder="par défaut : identique au nom"></div>
        <div class="field"><label>UE / sous-titre</label><input type="text" name="ue" value="${esc(v.ue)}"></div>
        <div class="field"><label>Description courte</label><input type="text" name="desc" value="${esc(v.desc)}"></div>
        <div class="field"><label>Barème CC (texte libre)</label><input type="text" name="cc" value="${esc(v.cc)}"></div>
        <div class="field"><label>PDF fiche CC (URL, optionnel)</label><input type="text" name="pdfCC" value="${esc(v.pdfCC || "")}"></div>
        <div class="field"><label>Questions par éval blanche</label><input type="number" name="evaln" min="1" value="${v.eval.n}"></div>
        <div class="field"><label>Durée éval blanche (min)</label><input type="number" name="evalmin" min="1" value="${v.eval.minutes}"></div>
      </div>
    </details>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Créer la matière" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="delmatiere" data-mid="${esc(v.id)}">Supprimer</button>`}
    </div>
  </form>`;
}
function bindMM(el) {
  $$('form[data-a="savematiere"]', el).forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f), nom = String(fd.get("nom") || "").trim();
    if (!nom) return toast("Le nom est requis");
    const id = String(fd.get("id") || "").trim() || slugify(nom);
    try {
      await saveMatiere({ id, nom, court: fd.get("court") || nom, ue: fd.get("ue"), couleur: fd.get("couleur") || PALETTE[0], desc: fd.get("desc"), cc: fd.get("cc"), pdfCC: fd.get("pdfCC"), ects: Math.max(0, +fd.get("ects") || 0), periode: fd.get("periode") || null, eval: { n: +fd.get("evaln") || 15, minutes: +fd.get("evalmin") || 15 } });
      toast("Matière enregistrée");
      await loadData(); refreshShell();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
}
// ───────────────────────── Mes périodes (semestres, années…) ─────────────────────────
function periodeFormHtml(p) {
  const isNew = !p;
  const v = p || { id: "", nom: "", statut: "actif" };
  return `<form data-a="saveperiode">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <input type="hidden" name="statut" value="${esc(v.statut)}">
    <div class="field"><label>Nom</label><input type="text" name="nom" required value="${esc(v.nom)}" placeholder="ex. L3 — Semestre 1"></div>
    <div class="row" style="margin-top:10px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Créer la période" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="toggleperiode" data-pid="${esc(v.id)}" data-statut="${v.statut}">${v.statut === "actif" ? "Marquer comme terminée" : "Remettre active"}</button><button class="btn" type="button" data-a="delperiode" data-pid="${esc(v.id)}">Supprimer</button>`}
    </div>
  </form>`;
}
function periodesAdminHtml() {
  const sansPeriode = D.matieres.filter((m) => !m.periode);
  return `<p class="small muted">Une période terminée sort ses matières du menu principal (elles restent consultables dans les archives). Créer une période ne fait rien à elle seule : il faut ensuite lui rattacher des matières (à la création d'une matière, ou en une fois avec le bouton ci-dessous).</p>
    ${D.periodes.map((p) => `<div class="card" style="margin-bottom:10px">
      <div class="row nowrap"><b>${esc(p.nom)}</b><span class="chip ${p.statut === "actif" ? "ok" : "gr"}">${p.statut === "actif" ? "Active" : "Terminée"}</span><div class="sp"></div><span class="tiny muted">${plural(D.matieres.filter((m) => m.periode === p.id).length, "matière")}</span></div>
      ${sansPeriode.length ? `<div class="tiny muted" style="margin-top:8px">${plural(sansPeriode.length, "matière")} pas encore rattachée à une période.</div><button class="btn sm" style="margin-top:6px" data-a="assignall" data-pid="${esc(p.id)}">${icon("edit")}Y rattacher ces ${sansPeriode.length} matière${sansPeriode.length > 1 ? "s" : ""}</button>` : ""}
      <details style="margin-top:10px"><summary>Modifier</summary><div style="margin-top:10px">${periodeFormHtml(p)}</div></details>
    </div>`).join("")}
    <details ${D.periodes.length ? "" : "open"}><summary>Ajouter une période</summary><div class="card" style="margin-top:10px">${periodeFormHtml(null)}</div></details>`;
}
function bindPeriodes(el) {
  $$('form[data-a="saveperiode"]', el).forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f), nom = String(fd.get("nom") || "").trim();
    if (!nom) return toast("Le nom est requis");
    const id = String(fd.get("id") || "").trim() || slugify(nom, D.periodes.map((p) => p.id));
    try {
      await savePeriode({ id, nom, statut: fd.get("statut") || "actif" });
      toast("Période enregistrée");
      await loadData(); refreshShell();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
}
function matiereAdminCard(m) {
  const p = D.periodes.find((x) => x.id === m.periode);
  return `<div class="card" style="margin-bottom:10px">
      <div class="row nowrap"><i class="dot" style="--c:${m.couleur}"></i><div class="sp"><b>${esc(m.nom)}</b><div class="tiny muted">${plural(C(m.id).seances.length, "séance")}${p ? ` · ${esc(p.nom)}` : ""}</div></div></div>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">
        <a class="btn sm" href="#/mm/${m.id}">${icon("book")}Séances</a>
        <a class="btn sm" href="#/aq/${m.id}">${icon("check")}QCM</a>
        <a class="btn sm" href="#/af/${m.id}">${icon("cards")}Cartes</a>
        <a class="btn sm" href="#/ax/${m.id}">${icon("edit")}Exercices</a>
      </div>
      <details style="margin-top:10px"><summary>Modifier</summary><div style="margin-top:10px">${matiereFormHtml(m)}</div></details>
    </div>`;
}
function matieresAdminHtml() {
  const archived = archivedMatieres();
  const byPeriode = new Map();
  archived.forEach((m) => { const k = m.periode; if (!byPeriode.has(k)) byPeriode.set(k, []); byPeriode.get(k).push(m); });
  const archivedHtml = [...byPeriode.entries()].map(([pid, ms]) => {
    const p = D.periodes.find((x) => x.id === pid);
    return `<details style="margin-bottom:10px"><summary>${esc(p ? p.nom : "Sans période")} — ${plural(ms.length, "matière archivée", "matières archivées")}</summary><div style="margin-top:10px">${ms.map(matiereAdminCard).join("")}</div></details>`;
  }).join("");
  return `${activeMatieres().map(matiereAdminCard).join("")}
    ${archivedHtml ? `<h3 style="margin:18px 0 10px;font-size:.95rem">Matières archivées</h3>${archivedHtml}` : ""}
    <details ${D.matieres.length ? "" : "open"}><summary>Ajouter une matière</summary><div class="card" style="margin-top:10px">${matiereFormHtml(null)}</div></details>`;
}
function mmSeances(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const c = C(mid);
  return {
    html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)}</div>
    <h1 style="margin:0">${esc(m.nom)} — séances</h1>
    <div class="card list" style="margin-top:14px">${c.seances.map((s) => `<a class="item" href="#/mm/${mid}/${s.id}"><span class="badge">${s.type}<br>${s.numero}</span><div class="sp"><b>${esc(s.titre) || "(sans titre)"}</b><div class="tiny muted">${s.date ? fmtDate(s.date) : "date non fixée"}${s.resume ? " · " + esc(s.resume) : ""}</div></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucune séance pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/mm/${mid}/new">${icon("edit")}Nouvelle séance</a></div>`,
  };
}
function bindSeanceForm(mid) {
  return (el) => {
    $('form[data-a="saveseance"]', el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), id = String(fd.get("id") || "").trim();
      if (!id) return toast("Identifiant requis");
      try {
        await saveSeance(mid, { id, type: fd.get("type"), numero: +fd.get("numero") || 1, date: fd.get("date") || null, titre: fd.get("titre"), resume: fd.get("resume"), contenu: fd.get("contenu"), pdf: fd.get("pdf") });
        toast("Séance enregistrée");
        await loadData();
        // replaceState (pas location.hash) : remplace l'entrée d'édition dans l'historique au lieu
        // d'en empiler une nouvelle, sinon "Retour" (history.back) atterrit sur le formulaire au
        // lieu de la page d'où l'utilisateur avait cliqué "Modifier".
        history.replaceState(null, "", `#/c/${mid}/${id}`);
        rerender();
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}
function mmSeanceForm(mid, sid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = !sid || sid === "new";
  const s = isNew ? null : seanceOf(mid, sid);
  if (!isNew && !s) return { html: `<div class="empty">Séance introuvable.</div>` };
  const nextNum = Math.max(0, ...C(mid).seances.map((x) => x.numero || 0)) + 1;
  const v = s || { id: "", type: "CM", numero: nextNum, date: "", titre: "", resume: "", contenu: "", pdf: "" };
  return {
    html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/mm/${mid}">${esc(m.court)}</a> › ${isNew ? "Nouvelle séance" : `${v.type} ${v.numero}`}</div>
    <h1 style="margin:0">${isNew ? "Nouvelle séance" : "Modifier la séance"}</h1>
    <form class="card" data-a="saveseance" style="margin-top:14px">
      ${isNew ? "" : `<input type="hidden" name="id" value="${esc(v.id)}">`}
      <div class="grid g3">
        ${isNew ? `<div class="field"><label>Identifiant (ex. cm-4)</label><input type="text" name="id" required pattern="[a-z0-9][a-z0-9-]{1,30}"></div>` : ""}
        <div class="field"><label>Type</label><select name="type"><option value="CM" ${v.type === "CM" ? "selected" : ""}>CM</option><option value="TD" ${v.type === "TD" ? "selected" : ""}>TD</option><option value="TP" ${v.type === "TP" ? "selected" : ""}>TP</option></select></div>
        <div class="field"><label>Numéro</label><input type="number" name="numero" min="1" value="${v.numero}"></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${v.date || ""}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Titre</label><input type="text" name="titre" required value="${esc(v.titre)}"></div>
      <div class="field" style="margin-top:10px"><label>Résumé (une phrase)</label><input type="text" name="resume" value="${esc(v.resume)}"></div>
      <div class="field" style="margin-top:10px"><label>PDF (URL, optionnel)</label><input type="text" name="pdf" value="${esc(v.pdf || "")}"></div>
      <div class="field" style="margin-top:10px"><label>Contenu du cours — HTML (paragraphes, &lt;h2&gt;, &lt;div class="def"&gt;…&lt;/div&gt; pour les encadrés, \\( \\) pour les maths)</label><textarea name="contenu" rows="16" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font:.88rem/1.5 ui-monospace,monospace">${esc(v.contenu)}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        <a class="btn ghost" data-a="navreplace" href="${isNew ? `#/mm/${mid}` : `#/c/${mid}/${esc(v.id)}`}">Annuler</a>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delseance" data-mid="${mid}" data-sid="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`,
    after: bindSeanceForm(mid),
  };
}

// ───────────────────────── QCM, cartes, exercices (édition) ─────────────────────────
const TA_STYLE = "width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font:.88rem/1.5 ui-monospace,monospace";
function seanceOptions(mid, selected) {
  return `<option value="">—</option>${C(mid).seances.map((s) => `<option value="${s.id}" ${selected === s.id ? "selected" : ""}>${s.type} ${s.numero} — ${esc(s.titre)}</option>`).join("")}`;
}
function strip(s) { return String(s || "").replace(/<[^>]+>/g, ""); }

function qcmAdminList(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const items = C(mid).qcm;
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)} › QCM</div>
    <h1 style="margin:0">${esc(m.nom)} — QCM</h1>
    <div class="card list" style="margin-top:14px">${items.map((it) => `<a class="item" href="#/aq/${mid}/${it.id}"><div class="sp"><b>${esc(strip(it.q)) || "(sans texte)"}</b><div class="tiny muted">${it.choix.length} choix · niveau ${it.niveau}</div></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucune question pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/aq/${mid}/new">${icon("edit")}Nouvelle question</a></div>` };
}
function bindQcmForm(mid, id) {
  return (el) => {
    $('form[data-a="saveqcm"]', el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const checked = new Set(fd.getAll("correct").map(Number));
      const pairs = fd.getAll("choix").map((s, i) => ({ text: String(s).trim(), ok: checked.has(i) })).filter((p) => p.text);
      const choix = pairs.map((p) => p.text);
      const rep = pairs.map((p, i) => (p.ok ? i : -1)).filter((i) => i >= 0);
      if (!choix.length) return toast("Au moins un choix est requis");
      if (!rep.length) return toast("Coche au moins une bonne réponse");
      try {
        await saveItem("qcm", { id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, type: rep.length > 1 ? "multiple" : "unique", q: fd.get("q"), choix, rep, expl: fd.get("expl"), niveau: +fd.get("niveau") || 1 });
        toast("Question enregistrée");
        await loadData();
        location.hash = `#/aq/${mid}`;
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}
function qcmAdminForm(mid, id) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = id === "new";
  const it = isNew ? null : C(mid).qcm.find((x) => x.id === id);
  if (!isNew && !it) return { html: `<div class="empty">Question introuvable.</div>` };
  const v = it || { seance: "", q: "", choix: ["", "", "", ""], rep: [], expl: "", niveau: 1 };
  const slots = Math.max(4, v.choix.length);
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/aq/${mid}">${esc(m.court)} — QCM</a> › ${isNew ? "Nouvelle" : "Modifier"}</div>
    <h1 style="margin:0">${isNew ? "Nouvelle question" : "Modifier la question"}</h1>
    <form class="card" data-a="saveqcm" style="margin-top:14px">
      <div class="field"><label>Question</label><textarea name="q" rows="2" required style="${TA_STYLE}">${esc(v.q)}</textarea></div>
      <div class="grid g3" style="margin-top:10px">
        <div class="field"><label>Séance (optionnel)</label><select name="seance">${seanceOptions(mid, v.seance)}</select></div>
        <div class="field"><label>Niveau</label><input type="number" name="niveau" min="1" max="5" value="${v.niveau}"></div>
      </div>
      <p class="small muted" style="margin:14px 0 4px">Choix de réponse — coche la ou les bonnes réponses :</p>
      ${Array.from({ length: slots }, (_, i) => `<div class="row nowrap" style="margin-top:6px"><label class="row small" style="gap:6px"><input type="checkbox" name="correct" value="${i}" ${v.rep.includes(i) ? "checked" : ""}></label><input type="text" name="choix" placeholder="Choix ${i + 1}" value="${esc(v.choix[i] || "")}" style="flex:1"></div>`).join("")}
      <div class="field" style="margin-top:10px"><label>Explication (affichée après réponse)</label><textarea name="expl" rows="3" style="${TA_STYLE}">${esc(v.expl)}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delqcm" data-mid="${mid}" data-id="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`, after: bindQcmForm(mid, id) };
}

function flashAdminList(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const items = C(mid).flashcards;
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)} › Cartes</div>
    <h1 style="margin:0">${esc(m.nom)} — Cartes</h1>
    <div class="card list" style="margin-top:14px">${items.map((it) => `<a class="item" href="#/af/${mid}/${it.id}"><div class="sp"><b>${esc(strip(it.recto)) || "(sans texte)"}</b></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucune carte pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/af/${mid}/new">${icon("edit")}Nouvelle carte</a></div>` };
}
function bindFlashForm(mid, id) {
  return (el) => {
    $('form[data-a="saveflash"]', el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!String(fd.get("recto") || "").trim()) return toast("Le recto est requis");
      try {
        await saveItem("carte", { id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, recto: fd.get("recto"), verso: fd.get("verso") });
        toast("Carte enregistrée");
        await loadData();
        location.hash = `#/af/${mid}`;
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}
function flashAdminForm(mid, id) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = id === "new";
  const it = isNew ? null : C(mid).flashcards.find((x) => x.id === id);
  if (!isNew && !it) return { html: `<div class="empty">Carte introuvable.</div>` };
  const v = it || { seance: "", recto: "", verso: "" };
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/af/${mid}">${esc(m.court)} — Cartes</a> › ${isNew ? "Nouvelle" : "Modifier"}</div>
    <h1 style="margin:0">${isNew ? "Nouvelle carte" : "Modifier la carte"}</h1>
    <form class="card" data-a="saveflash" style="margin-top:14px">
      <div class="field"><label>Séance (optionnel)</label><select name="seance">${seanceOptions(mid, v.seance)}</select></div>
      <div class="field" style="margin-top:10px"><label>Recto (question)</label><textarea name="recto" rows="2" required style="${TA_STYLE}">${esc(v.recto)}</textarea></div>
      <div class="field" style="margin-top:10px"><label>Verso (réponse)</label><textarea name="verso" rows="3" style="${TA_STYLE}">${esc(v.verso)}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delflash" data-mid="${mid}" data-id="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`, after: bindFlashForm(mid, id) };
}

function exoAdminList(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const items = C(mid).exercices;
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)} › Exercices</div>
    <h1 style="margin:0">${esc(m.nom)} — Exercices</h1>
    <div class="card list" style="margin-top:14px">${items.map((it) => `<a class="item" href="#/ax/${mid}/${it.id}"><div class="sp"><b>${esc(strip(it.titre)) || "(sans titre)"}</b><div class="tiny muted">difficulté ${it.difficulte} · ${it.type === "code" ? "code Python" : it.type === "texte" ? "réponse courte" : "ancien format"}</div></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucun exercice pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/ax/${mid}/new">${icon("edit")}Nouvel exercice</a></div>` };
}
function bindExoForm(mid, id) {
  return (el) => {
    const f = $('form[data-a="saveexo"]', el);
    const toggleType = () => {
      $$(".exo-code-field", el).forEach((x) => (x.style.display = f?.type.value === "code" ? "" : "none"));
      $$(".exo-texte-field", el).forEach((x) => (x.style.display = f?.type.value === "texte" ? "" : "none"));
    };
    f?.type.addEventListener("change", toggleType);
    toggleType();
    f?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!String(fd.get("titre") || "").trim()) return toast("Le titre est requis");
      try {
        const reponses = String(fd.get("reponses") || "").split("\n").map((s) => s.trim()).filter(Boolean);
        await saveItem("exercice", { id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, titre: fd.get("titre"), difficulte: +fd.get("difficulte") || 1, enonce: fd.get("enonce"), indice: fd.get("indice"), corrige: fd.get("corrige"), type: fd.get("type") || "texte", codeStarter: fd.get("code_starter"), codeTests: fd.get("code_tests"), reponse: "", reponses });
        toast("Exercice enregistré");
        await loadData();
        location.hash = `#/ax/${mid}`;
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}
function exoAdminForm(mid, id) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = id === "new";
  const it = isNew ? null : C(mid).exercices.find((x) => x.id === id);
  if (!isNew && !it) return { html: `<div class="empty">Exercice introuvable.</div>` };
  const v = it || { seance: "", titre: "", difficulte: 1, enonce: "", indice: "", corrige: "", type: "texte", codeStarter: "", codeTests: "", reponse: "", reponses: [] };
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/ax/${mid}">${esc(m.court)} — Exercices</a> › ${isNew ? "Nouveau" : "Modifier"}</div>
    <h1 style="margin:0">${isNew ? "Nouvel exercice" : "Modifier l'exercice"}</h1>
    <p class="small muted">Chaque exercice est corrigé automatiquement par l'app : une réponse courte comparée au texte attendu, ou du code Python vérifié par des tests.</p>
    <form class="card" data-a="saveexo" style="margin-top:14px">
      <div class="field"><label>Titre</label><input type="text" name="titre" required value="${esc(v.titre)}"></div>
      <div class="grid g3" style="margin-top:10px">
        <div class="field"><label>Séance (optionnel)</label><select name="seance">${seanceOptions(mid, v.seance)}</select></div>
        <div class="field"><label>Difficulté</label><input type="number" name="difficulte" min="1" max="3" value="${v.difficulte}"></div>
        <div class="field"><label>Type</label><select name="type">${v.type === "redaction" ? '<option value="redaction" selected disabled>Rédaction (ancien format, à convertir)</option>' : ""}<option value="texte" ${v.type === "texte" ? "selected" : ""}>Zone de texte (réponse courte, corrigée auto)</option><option value="code" ${v.type === "code" ? "selected" : ""}>Code Python (corrigé auto par des tests)</option></select></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Énoncé — HTML</label><textarea name="enonce" rows="8" style="${TA_STYLE}">${esc(v.enonce)}</textarea></div>
      <div class="field" style="margin-top:10px"><label>Indice (optionnel) — HTML</label><textarea name="indice" rows="3" style="${TA_STYLE}">${esc(v.indice)}</textarea></div>
      <div class="field" style="margin-top:10px"><label>Corrigé — HTML (explication, affichée après correction)</label><textarea name="corrige" rows="8" style="${TA_STYLE}">${esc(v.corrige)}</textarea></div>
      <div class="field exo-texte-field" style="margin-top:10px"><label>Réponses attendues — une par ligne si l'énoncé a plusieurs sous-questions (une zone par ligne sera affichée à l'étudiant), plusieurs formes acceptées par ligne séparées par « | » (ex. <code>6|6.0|six</code>)</label><textarea name="reponses" rows="3" style="${TA_STYLE}">${esc((v.reponses?.length ? v.reponses : v.reponse ? [v.reponse] : []).join("\n"))}</textarea></div>
      <div class="field exo-code-field" style="margin-top:10px"><label>Code de départ (affiché à l'étudiant)</label><textarea name="code_starter" rows="4" style="${TA_STYLE}">${esc(v.codeStarter)}</textarea></div>
      <div class="field exo-code-field" style="margin-top:10px"><label>Tests — un appel à <code>check("description", condition)</code> par ligne</label><textarea name="code_tests" rows="6" style="${TA_STYLE}">${esc(v.codeTests)}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delexo" data-mid="${mid}" data-id="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`, after: bindExoForm(mid, id) };
}

// ───────────────────────── Notes ─────────────────────────
function notesCard(mid) {
  const K = CALC[mid], m = M(mid), v = state.notes[mid]?.v || {};
  return `<div class="card notes" data-m="${mid}" style="--acc:${m.couleur}"><p class="small muted" style="margin-top:0">${esc(K.formule)}</p>
    <div class="row">${K.champs.map(([k, l, mx]) => `<div class="field"><label for="n-${mid}-${k}">${esc(l)}</label><input id="n-${mid}-${k}" type="number" inputmode="decimal" min="0" max="${mx || 20}" step="0.25" data-k="${k}" value="${v[k] ?? ""}" placeholder="—"></div>`).join("")}</div>
    <div class="nres" style="margin-top:12px"></div></div>`;
}
function calcRes(mid, v) {
  const r = CALC[mid].calc(v);
  if (!r) return `<span class="muted small">Saisis tes notes (/20) pour voir ta moyenne.</span>`;
  const pass = r.note >= 10;
  return `<div class="row"><div class="score" style="font-size:2rem;color:${pass ? "var(--ok)" : "var(--ko)"}">${fmt1(r.note)}<span class="muted" style="font-size:1rem"> / 20</span></div>
    <span class="chip ${r.complet ? (pass ? "ok" : "ko") : "wa"}">${r.complet ? (pass ? "UE validée" : "sous la moyenne") : `estimation partielle (${r.poids} % du total saisi)`}</span></div>`;
}
function bindNotes(el) {
  $$(".notes", el).forEach((card) => {
    const mid = card.dataset.m, out = $(".nres", card);
    const cur = () => Object.fromEntries($$("input", card).map((i) => [i.dataset.k, i.value]));
    out.innerHTML = calcRes(mid, cur());
    card.addEventListener("input", () => { const v = cur(); out.innerHTML = calcRes(mid, v); setEntry("notes", mid, { v }); commit(); });
  });
}
function notes() {
  return { html: `<h1>Notes &amp; CC</h1><p class="muted">Entre tes notes au fil du semestre : le calcul suit exactement la formule de chaque UE (les deuxièmes chances remplacent les notes plus faibles). Tout est sauvegardé.</p>
    ${D.matieres.filter((m) => CALC[m.id]).map((m) => `<h2 style="display:flex;gap:10px;align-items:center"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.nom)}</h2>${notesCard(m.id)}`).join("") || '<div class="empty">Aucune formule de calcul disponible pour tes matières.</div>'}`, after: bindNotes };
}

// ───────────────────────── Recherche ─────────────────────────
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
async function buildIndex() {
  if (D.idx) return D.idx;
  const out = [];
  IDS.forEach((mid) => C(mid).seances.forEach((s) => { const t = document.createElement("div"); t.innerHTML = s.contenu || ""; out.push({ kind: "Cours", mid, sid: s.id, title: `${s.type} ${s.numero} — ${s.titre}`, text: t.textContent.replace(/\s+/g, " ") }); }));
  D.F.forEach((f) => out.push({ kind: "Carte", mid: f.mid, sid: f.seance, title: f.recto.replace(/<[^>]+>/g, ""), text: f.verso.replace(/<[^>]+>/g, "") }));
  D.E.forEach((e) => out.push({ kind: "Exercice", mid: e.mid, sid: e.seance, title: e.titre.replace(/<[^>]+>/g, ""), text: e.enonce.replace(/<[^>]+>/g, " "), ex: e.id }));
  out.forEach((o) => (o.n = norm(o.title + " " + o.text)));
  return (D.idx = out);
}
async function search(qs) {
  const idx = await buildIndex(), terms = norm(qs).split(/\s+/).filter(Boolean);
  const res = terms.length ? idx.map((o) => ({ o, sc: terms.every((t) => o.n.includes(t)) ? terms.reduce((a, t) => a + (norm(o.title).includes(t) ? 5 : 1) + (o.n.split(t).length - 1), 0) : 0 })).filter((x) => x.sc).sort((a, b) => b.sc - a.sc).slice(0, 40) : [];
  const snip = (o) => { const i = o.n.indexOf(terms[0]); const t = o.text.replace(/\\[()\[\]]/g, ""); if (i < 0) return esc(t.slice(0, 120)); const a = Math.max(0, i - 50); return (a ? "…" : "") + esc(t.slice(a, a + 160)) + "…"; };
  return { html: `<h1>Recherche</h1><form class="row" id="sf2" style="margin-bottom:14px"><input type="text" name="q" value="${esc(qs)}" placeholder="ex. contraposée, pipe, dérivée…" style="max-width:420px"><button class="btn pri">Chercher</button></form>
    ${terms.length ? `<p class="muted">${plural(res.length, "résultat")} pour « ${esc(qs)} »</p>` : ""}<div class="card list">${res.map(({ o }) => `<a class="item" href="${o.ex ? `#/m/${o.mid}/exos?s=${o.sid}` : `#/c/${o.mid}/${o.sid}`}"><span class="badge" style="font-size:.62rem">${o.kind}</span><div class="sp"><b>${esc(o.title)}</b><div class="tiny muted">${tag(o.mid)} ${snip(o)}</div></div></a>`).join("") || (terms.length ? '<div class="empty">Rien trouvé.</div>' : '<div class="empty">Tape un mot pour chercher dans tous les cours, cartes et exercices.</div>')}</div>`,
    after: (el) => $("#sf2", el).addEventListener("submit", (e) => { e.preventDefault(); location.hash = "#/search?q=" + encodeURIComponent(e.target.q.value.trim()); }) };
}

// ───────────────────────── Compte ─────────────────────────
let icsPreview = null;
function edtImportHtml() {
  if (icsPreview) {
    const a = icsPreview;
    return `<p class="small muted">${plural(a.events.length, "créneau")} détecté${a.events.length > 1 ? "s" : ""}${a.range ? ` du ${fmtDate(a.range[0])} au ${fmtDate(a.range[1])}` : ""}.</p>
    <div class="card list" style="margin:10px 0">${a.courses.map((c) => `<div class="item"><div class="sp"><b>${esc(c.nom)}</b><div class="tiny muted">${c.cm} CM · ${c.td} TD · ${c.tp} TP</div></div></div>`).join("") || '<div class="tiny muted">Aucune matière détectée.</div>'}</div>
    ${a.ccCount ? `<p class="tiny muted">${plural(a.ccCount, "créneau marqué CC", "créneaux marqués CC")} — vérifie-les dans l'emploi du temps, le crayon permet d'ajouter l'échéance correspondante.</p>` : ""}
    <div class="row"><button class="btn pri" data-a="confirmics">${icon("check")}Importer (remplace l'EDT actuel)</button><button class="btn ghost" data-a="cancelics">Annuler</button></div>`;
  }
  return `<p class="small muted">Fichier .ics exporté depuis ton emploi du temps en ligne (Celcat ou autre) :</p>
  <label class="btn pri">${icon("dl")}Choisir un fichier .ics<input type="file" accept=".ics,text/calendar" data-a="icsfile" class="sr"></label>`;
}
// Section repliable de la page Compte (mémorise l'état ouvert/fermé entre deux rendus).
const sectionOpen = { sync: true, periodes: true, matieres: true, edt: true, apparence: true, donnees: true };
function sectionCard(key, title, body) {
  return `<details class="card" style="margin-top:14px" ${sectionOpen[key] ? "open" : ""} data-section="${key}"><summary>${title}</summary><div style="margin-top:12px">${body}</div></details>`;
}
function account() {
  const st = { ok: "synchronisé", sync: "synchronisation…", error: "erreur", off: "connecté" }[sync.status] || "";
  const login = !sync.configured
    ? `<div class="note prose" style="padding:12px 16px"><b>Mode local —</b> la progression est enregistrée dans ce navigateur uniquement. Pour la retrouver sur ton téléphone et ton ordinateur, configure Supabase (voir le fichier <code>README.md</code>, étape 2), puis renseigne <code>js/config.js</code>.</div>`
    : sync.user
      ? `<p>Connecté en tant que <b>${esc(sync.user.email)}</b> · <span class="chip ${sync.status === "error" ? "ko" : "ok"}">${st}</span></p>${sync.error ? `<p class="small" style="color:var(--ko)">${esc(sync.error)}</p>` : ""}<div class="row"><button class="btn" data-a="pull">Récupérer depuis le cloud</button><button class="btn" data-a="push">Envoyer maintenant</button><button class="btn ghost" data-a="logout">Se déconnecter</button></div>${sync.last ? `<p class="tiny muted">Dernière synchro : ${new Date(sync.last).toLocaleTimeString("fr-FR")}</p>` : ""}`
      : `<form id="lf" class="grid" style="gap:10px;max-width:380px"><div class="field"><label for="le">Email</label><input id="le" type="email" name="email" required autocomplete="email"></div><div class="field"><label for="lp">Mot de passe</label><input id="lp" type="password" name="pw" minlength="6" autocomplete="current-password"></div><div class="row"><button class="btn pri" data-a="login" type="submit">Se connecter</button><button class="btn" type="button" data-a="signup">Créer le compte</button><button class="btn ghost" type="button" data-a="magic">Lien magique</button></div><div class="small muted" id="lmsg"></div></form>`;
  const pp = sync.user
    ? sectionCard("periodes", "Mes périodes", `${!D.periodes.length ? `<p class="small muted">Aucune période créée. Sans période, tes matières restent toujours visibles dans le menu — crées-en une seulement quand tu veux pouvoir archiver un semestre terminé.</p>` : ""}${periodesAdminHtml()}`)
    : "";
  const mm = sync.user
    ? sectionCard("matieres", "Mes matières", `${!D.matieres.length ? `<p class="small muted">Aucune matière pour l'instant. Crée ta première matière ci-dessous.</p>` : ""}${matieresAdminHtml()}`)
    : "";
  const edtCard = sync.user
    ? sectionCard("edt", "Emploi du temps", `${D.edt.events.length ? `<p class="small muted">${plural(D.edt.events.length, "créneau")} importé${D.edt.events.length > 1 ? "s" : ""}.</p>` : ""}${edtImportHtml()}`)
    : "";
  const apparenceBody = `<div class="field" style="max-width:220px"><label for="th">Thème</label><select id="th" data-a="theme"><option value="auto" ${state.prefs.theme === "auto" ? "selected" : ""}>Automatique</option><option value="light" ${state.prefs.theme === "light" ? "selected" : ""}>Clair</option><option value="dark" ${state.prefs.theme === "dark" ? "selected" : ""}>Sombre</option></select></div>`;
  const donneesBody = `<p class="small muted">Sauvegarde ou restaure ta progression (QCM, cartes, notes) dans un fichier.</p><div class="row"><button class="btn" data-a="export">${icon("dl")}Exporter</button><label class="btn">Importer<input type="file" accept="application/json" data-a="import" class="sr"></label><button class="btn ghost" data-a="reset" style="color:var(--ko)">Tout effacer</button></div>`;
  return { html: `<h1>Compte &amp; données</h1>
    ${sectionCard("sync", "Synchronisation", login)}
    ${pp}
    ${mm}
    ${edtCard}
    ${sectionCard("apparence", "Apparence", apparenceBody)}
    ${sectionCard("donnees", "Mes données", donneesBody)}`,
    after: (el) => {
      const f = $("#lf", el);
      if (f) f.addEventListener("submit", async (e) => { e.preventDefault(); await doAuth("login", f); });
      $$("details[data-section]", el).forEach((d) => d.addEventListener("toggle", () => { sectionOpen[d.dataset.section] = d.open; }));
      bindPeriodes(el);
      bindMM(el);
    } };
}
async function doAuth(kind, f) {
  const msg = $("#lmsg"), email = f.email.value.trim(), pw = f.pw.value;
  msg.textContent = "…";
  try {
    let r;
    if (kind === "magic") r = await magicLink(email);
    else if (!pw) { msg.textContent = "Entre un mot de passe (6 caractères minimum)."; return; }
    else r = kind === "signup" ? await signUp(email, pw) : await signIn(email, pw);
    if (r.error) msg.textContent = r.error.message;
    else msg.textContent = kind === "magic" ? "Lien envoyé : ouvre ton email sur cet appareil." : kind === "signup" ? "Compte créé. Si Supabase demande une confirmation, clique sur le lien reçu par email, puis connecte-toi." : "";
  } catch (e) { msg.textContent = e.message; }
}
function applyTheme() {
  const t = state.prefs.theme;
  if (t && t !== "auto") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("l1s1_theme", t || "auto"); } catch (e) {}
}

// ───────────────────────── Actions ─────────────────────────
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-a]"); if (!t || t.tagName === "SELECT" || (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "file")) return;
  const a = t.dataset.a;
  if (["calfilter", "calses", "import", "icsfile"].includes(a)) return; // gérés par change
  if (a === "navback") { history.back(); }
  // Bascule lecture/édition d'une séance : remplace l'entrée d'historique au lieu d'en empiler une
  // nouvelle, pour que "Retour" retrouve la page d'où on a cliqué "Modifier", pas le formulaire.
  else if (a === "navreplace") { e.preventDefault(); history.replaceState(null, "", t.getAttribute("href")); rerender(); }
  else if (a === "read") { const k = t.dataset.k, cur = state.read[k]?.v; setEntry("read", k, { v: !cur }); if (!cur) bump(3, "lecture"); commit(); const [mid, sid] = k.split("/"); const s = seanceOf(mid, sid); t.textContent = !cur ? "✓ Lu" : "Marquer comme lu"; t.classList.toggle("pri", cur); toast(!cur ? "Marqué comme lu" : "Marqué comme non lu"); }
  else if (a === "choose") { const x = Q.qs[Q.i]; if (x.checked) return; const i = +t.dataset.i; if (x.q.type === "multiple") { x.ans.has(i) ? x.ans.delete(i) : x.ans.add(i); } else { x.ans = new Set([i]); } rerenderKeep(); }
  else if (a === "check") { const x = Q.qs[Q.i]; if (!x.ans.size) return; x.checked = true; rerenderKeep(); }
  else if (a === "next") { if (Q.i < Q.qs.length - 1) { Q.i++; rerender(); } }
  else if (a === "prev") { if (Q.i > 0) { Q.i--; rerender(); } }
  else if (a === "goto") { Q.i = +t.dataset.i; rerender(); }
  else if (a === "flag") { Q.qs[Q.i].flag = !Q.qs[Q.i].flag; rerenderKeep(); }
  else if (a === "finish") { const un = Q.qs.filter((x) => !x.ans.size).length; if (Q.mode === "exam" && un && !(await appConfirm(`${un} question(s) sans réponse. Terminer quand même ?`))) return; finishQuiz(false); }
  else if (a === "retry") { const w = Q.qs.filter((x) => !okQ(x)).map((x) => x.q); startQuiz(shuffle(w), { mode: "train", title: "Mes erreurs", mid: null }); }
  else if (a === "enext") { if (EV.i < EV.items.length - 1) { EV.i++; rerender(); } }
  else if (a === "eprev") { if (EV.i > 0) { EV.i--; rerender(); } }
  else if (a === "egoto") { EV.i = +t.dataset.i; rerender(); }
  else if (a === "efinish") { const un = EV.items.length; if (!(await appConfirm(`Terminer l'épreuve (${EV.i + 1}/${un}) ?`))) return; finishEval(false); }
  else if (a === "emark") {
    const it = EV.items[+t.dataset.i]; it.mark = t.dataset.v;
    await saveEvalRecord();
    state.exos[it.e.id] = { v: it.mark, ts: Date.now() };
    await saveResult("exercice", it.e.id, { v: it.mark }, EV.id);
    snapshotElo(it.e.mid);
    rerenderKeep();
  }
  else if (a === "runcode") {
    const id = t.dataset.id, exo = D.E.find((x) => x.id === id);
    if (!exo) return;
    const ta = document.querySelector(`textarea[data-code-id="${id}"]`);
    const code = ta ? ta.value : (state.reponses[id]?.value ?? exo.codeStarter ?? "");
    setEntry("reponses", id, { value: code });
    commit();
    const resEl = document.getElementById(`pyres-${id}`);
    if (resEl) resEl.innerHTML = '<p class="tiny muted" style="margin-top:8px">Chargement de Python (~10 Mo au premier lancement)…</p>';
    t.disabled = true;
    try {
      const { runPythonExercise } = await import("./pyrun.js");
      const r = await runPythonExercise(code, exo.codeTests);
      codeResults[id] = r;
      if (resEl) resEl.innerHTML = codeResultHtml(r);
      const ran = r.results.length || r.error;
      if (ran) await autoMark(id, !r.error && r.results.every((x) => x.ok));
    } catch (err) {
      if (resEl) resEl.innerHTML = `<div class="warn prose" style="padding:8px 12px;margin-top:8px">Erreur de chargement de Python : ${esc(err.message)}</div>`;
    }
    t.disabled = false;
  }
  else if (a === "checktexte") {
    const id = t.dataset.id, exo = D.E.find((x) => x.id === id);
    if (!exo) return;
    const answers = expectedAnswers(exo);
    const inputs = $$(`input[data-texte-id="${id}"]`).sort((x, y) => (+x.dataset.texteIdx || 0) - (+y.dataset.texteIdx || 0));
    const values = inputs.map((inp) => inp.value);
    const oks = answers.map((a, i) => checkTextAnswer(values[i] ?? "", a));
    const ok = answers.length > 0 && oks.every(Boolean);
    setEntry("reponses", id, { values, oks, ok });
    commit();
    const resEl = document.getElementById(`txres-${id}`);
    if (resEl) resEl.innerHTML = texteResultHtml(oks);
    await autoMark(id, ok);
  }
  else if (a === "flip") { FC.flip = !FC.flip; rerender(); }
  else if (a === "rate") rate(t.dataset.r);
  else if (a === "exo") { state.exos[t.dataset.id] = { v: t.dataset.v, ts: Date.now() }; await saveResult("exercice", t.dataset.id, { v: t.dataset.v }); bump(2, "exercice"); commit(); toast(t.dataset.v === "ok" ? "Bien joué" : "Noté à refaire"); }
  else if (a === "toggleexo") { openExoId = openExoId === t.dataset.id ? null : t.dataset.id; rerenderKeep(); }
  else if (a === "calprev") { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); rerender(); }
  else if (a === "calnext") { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); rerender(); }
  else if (a === "caltoday") { calMonth = null; rerender(); }
  else if (a === "ics") icsExport();
  else if (a === "edtprev") { edtWeek.setDate(edtWeek.getDate() - 7); rerender(); }
  else if (a === "edtnext") { edtWeek.setDate(edtWeek.getDate() + 7); rerender(); }
  else if (a === "edttoday") { edtWeek = mondayOf(new Date()); rerender(); }
  else if (a === "edtedit") { const ev = D.edt.events.find((x) => x.id === t.dataset.id); if (ev) openEdtModal(ev); }
  else if (a === "addedt") { openEdtModal(null); }
  else if (a === "canceledt") { closeEdtModal(); }
  else if (a === "deledt") {
    if (await appConfirm("Supprimer ce créneau ?")) {
      try { await deleteEdtEvent(t.dataset.id); toast("Créneau supprimé"); closeEdtModal(); await loadData(); rerender(); }
      catch (err) { toast("Erreur : " + err.message); }
    }
  }
  else if (a === "creerseance") {
    const mid = t.dataset.m, d = t.dataset.d, want = EDT_TYPE_MAP[t.dataset.t];
    let s = C(mid).seances.find((x) => x.type === want && x.date === d);
    try {
      if (!s) {
        const sameType = C(mid).seances.filter((x) => x.type === want);
        const numero = sameType.length ? Math.max(...sameType.map((x) => x.numero)) + 1 : 1;
        const id = `${want.toLowerCase()}-${numero}`;
        await saveSeance(mid, { id, type: want, numero, date: d, titre: `${want} ${numero}`, resume: "", contenu: "" });
        s = { id };
      }
      // Pose le lien explicite EDT → séance sur le créneau d'origine, pour que seanceFor()
      // n'ait plus besoin de deviner par date+type+matière.
      const edtEv = D.edt.events.find((x) => x.id === t.dataset.id);
      if (edtEv && edtEv.sid !== s.id) await saveEdtEvent({ ...edtEv, sid: s.id });
      await loadData();
      location.hash = `#/c/${mid}/${s.id}`;
    } catch (err) { toast("Erreur : " + err.message); }
  }
  else if (a === "evt") { const ev = D.cal.evenements.find((x) => x.id === t.dataset.id); if (ev) openCCInfoModal(ev); }
  else if (a === "login") { /* submit géré */ }
  else if (a === "signup") doAuth("signup", $("#lf"));
  else if (a === "magic") doAuth("magic", $("#lf"));
  else if (a === "logout") { await signOut(); rerender(); }
  else if (a === "pull") { await pull(); rerender(); toast("Données récupérées"); }
  else if (a === "push") { await push(); rerender(); toast("Données envoyées"); }
  else if (a === "export") download("progression-l1s1.json", exportJSON(), "application/json");
  else if (a === "delmatiere") { if (await appConfirm("Supprimer cette matière et toutes ses séances ?")) { await deleteMatiere(t.dataset.mid); toast("Matière supprimée"); await loadData(); location.hash = "#/compte"; refreshShell(); } }
  else if (a === "toggleperiode") {
    const newStatut = t.dataset.statut === "actif" ? "termine" : "actif";
    try { await savePeriode({ id: t.dataset.pid, nom: D.periodes.find((p) => p.id === t.dataset.pid)?.nom || "", statut: newStatut }); toast(newStatut === "termine" ? "Période marquée comme terminée" : "Période remise active"); await loadData(); refreshShell(); }
    catch (err) { toast("Erreur : " + err.message); }
  }
  else if (a === "delperiode") { if (await appConfirm("Supprimer cette période ? Les matières associées ne sont pas supprimées, juste détachées.")) { try { await deletePeriode(t.dataset.pid); toast("Période supprimée"); await loadData(); refreshShell(); } catch (err) { toast("Erreur : " + err.message); } } }
  else if (a === "assignall") {
    const sans = D.matieres.filter((m) => !m.periode);
    if (!sans.length) return;
    if (!(await appConfirm(`Rattacher ${plural(sans.length, "matière")} à cette période ?`))) return;
    toast("Mise à jour…");
    try {
      for (const m of sans) await saveMatiere({ ...m, periode: t.dataset.pid });
      toast("Matières rattachées");
      await loadData(); refreshShell();
    } catch (err) { toast("Erreur : " + err.message); }
  }
  else if (a === "delseance") { if (await appConfirm("Supprimer cette séance ?")) { await deleteSeance(t.dataset.mid, t.dataset.sid); toast("Séance supprimée"); await loadData(); location.hash = `#/m/${t.dataset.mid}`; } }
  else if (a === "delqcm") { if (await appConfirm("Supprimer cette question ?")) { await deleteItem("qcm", t.dataset.id); toast("Question supprimée"); await loadData(); location.hash = `#/aq/${t.dataset.mid}`; } }
  else if (a === "delflash") { if (await appConfirm("Supprimer cette carte ?")) { await deleteItem("carte", t.dataset.id); toast("Carte supprimée"); await loadData(); location.hash = `#/af/${t.dataset.mid}`; } }
  else if (a === "delexo") { if (await appConfirm("Supprimer cet exercice ?")) { await deleteItem("exercice", t.dataset.id); toast("Exercice supprimé"); await loadData(); location.hash = `#/ax/${t.dataset.mid}`; } }
  else if (a === "confirmics") { if (!icsPreview) return; toast("Import en cours…"); try { const r = await commitIcsImport(icsPreview, D.matieres); icsPreview = null; toast(`Importé : ${plural(r.matieresCreees, "matière créée", "matières créées")}, ${plural(r.evenements, "créneau")}`); await loadData(); refreshShell(); } catch (err) { toast("Erreur : " + err.message); } }
  else if (a === "cancelics") { icsPreview = null; rerender(); }
  else if (a === "editcc") { const ev = D.cal.evenements.find((x) => x.id === t.dataset.id); if (ev) openCCModal(ev); }
  else if (a === "addcc") { openCCModal(null); }
  else if (a === "cancelcc") { closeCCModal(); }
  else if (a === "delcc") { if (await appConfirm("Supprimer cette échéance ?")) { try { await deleteCCEvent(t.dataset.id); toast("Échéance supprimée"); closeCCModal(); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); } } }
  else if (a === "delevaL") {
    if (await appConfirm("Supprimer cet essai d'éval blanche ? (abandonné, test, ou à ne pas garder dans l'historique)")) {
      // Les résultats d'exercice encore liés à cet eval sont supprimés en cascade côté base
      // (FK eval_id, voir supabase/schema_results.sql) : loadData() les recharge donc déjà à jour.
      await deleteEval(t.dataset.id);
      toast("Essai supprimé");
      await loadData();
      rerender();
    }
  }
  else if (a === "deltodo") { if (await appConfirm("Supprimer cette tâche ?")) { try { await deleteTodo(t.dataset.id); toast("Tâche supprimée"); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); } } }
  else if (a === "caltodo") {
    const todo = D.todos.find((x) => x.id === t.dataset.id); if (!todo) return;
    try { await setTodoDone(todo.id, !todo.done); todo.done = !todo.done; rerender(); } catch (err) { toast("Erreur : " + err.message); }
  }
  else if (a === "todoprev") { todoMonth = new Date(todoMonth.getFullYear(), todoMonth.getMonth() - 1, 1); rerender(); }
  else if (a === "todonext") { todoMonth = new Date(todoMonth.getFullYear(), todoMonth.getMonth() + 1, 1); rerender(); }
  else if (a === "todotoday") { todoMonth = null; rerender(); }
  else if (a === "deldoc") { if (await appConfirm(`Supprimer « ${t.dataset.nom} » ?`)) { try { await deleteSeanceDoc({ id: t.dataset.id, path: t.dataset.path }); const sid = CURRENT_DOCS.find((d) => d.id === t.dataset.id)?.sid; if (sid && !CURRENT_DOCS.some((d) => d.sid === sid && d.id !== t.dataset.id)) D.docSids.delete(sid); toast("Document supprimé"); rerender(); } catch (err) { toast("Erreur : " + err.message); } } }
  else if (a === "opennote") { openWriteOverlay(document, t.dataset.mid, t.dataset.sid); }
  else if (a === "editnote") { openWriteOverlay(document, t.dataset.mid, t.dataset.sid, CURRENT_DOCS.find((d) => d.id === t.dataset.id)); }
  else if (a === "wtool") { if (DRAW) { DRAW.tool = t.dataset.tool; syncWriteToolbar(DRAW.el); } }
  else if (a === "wcolor") { if (DRAW) { DRAW.color = t.dataset.c; syncWriteToolbar(DRAW.el); } }
  else if (a === "wpaper") { if (DRAW) { DRAW.paper = t.dataset.paper; syncWriteToolbar(DRAW.el); redrawAll(); } }
  else if (a === "wzoomreset") { resetZoomView(); }
  else if (a === "wundo") { undoStroke(); }
  else if (a === "wredo") { redoStroke(); }
  else if (a === "wsave") { await saveWriteNote(); }
  else if (a === "wclose") { if (DRAW?.dirty && !(await appConfirm("Fermer sans enregistrer cette page ?"))) return; if (DRAW) closeWriteOverlay(DRAW.el); }
  else if (a === "addccsugg") {
    try { await saveCCEvent({ matiere: t.dataset.m, date: t.dataset.date, titre: t.dataset.titre, poids: "", edtId: t.dataset.edtId || null }); toast("Échéance ajoutée"); await loadData(); rerender(); }
    catch (err) { toast("Erreur : " + err.message); }
  }
  else if (a === "reset") {
    const msg = sync.user
      ? "Tout effacer ? Supprime IMMÉDIATEMENT et définitivement (y compris dans le cloud) toutes tes matières, séances/cours et ton emploi du temps, en plus de ta progression locale. Irréversible."
      : "Effacer toute ta progression sur cet appareil ?";
    if (!(await appConfirm(msg))) return;
    resetAll();
    if (sync.user) {
      try { await wipeAccount(); } catch (err) { toast("Erreur : " + err.message); }
      await loadData(); refreshShell();
    } else rerender();
    toast("Tout a été effacé");
  }
});
document.addEventListener("input", (e) => {
  // Retour en direct pendant le glissé du curseur de taille (avant même l'évènement "change").
  if (e.target.dataset?.a === "wsizeslider" && DRAW) { DRAW.size = +e.target.value; syncWriteToolbar(DRAW.el); }
});
document.addEventListener("change", (e) => {
  const t = e.target, a = t.dataset?.a;
  if (t.dataset.codeId) { setEntry("reponses", t.dataset.codeId, { value: t.value }); commit(); return; }
  if (t.dataset.texteId) {
    const id = t.dataset.texteId, idx = +t.dataset.texteIdx || 0, cur = state.reponses[id] || {};
    const values = [...(cur.values || [])]; values[idx] = t.value;
    setEntry("reponses", id, { values, oks: cur.oks });
    commit();
    return;
  }
  if (t.dataset.noteKey) { setEntry("seanceNotes", t.dataset.noteKey, { text: t.value }); commit(); return; }
  if (t.dataset.ccnoteId) {
    const ev = D.edt.events.find((x) => x.id === t.dataset.ccnoteId);
    if (ev) { ev.n = t.value; saveEdtEvent(ev).catch((err) => toast("Erreur : " + err.message)); }
    return;
  }
  if (a === "wcustomcolor") { if (DRAW) { DRAW.color = t.value; syncWriteToolbar(DRAW.el); } return; }
  if (a === "wsizeslider") { if (DRAW) { DRAW.size = +t.value; syncWriteToolbar(DRAW.el); } return; }
  if (a === "calses") { calSeances = t.checked; rerender(); }
  else if (a === "theme") { state.prefs.theme = t.value; state.prefs.ts = Date.now(); applyTheme(); commit(); }
  else if (a === "import") { const f = t.files[0]; if (!f) return; f.text().then((s) => { try { importJSON(s); toast("Progression importée"); rerender(); } catch (err) { toast("Fichier invalide"); } }); }
  else if (a === "icsfile") { const f = t.files[0]; if (!f) return; f.text().then((s) => { try { icsPreview = analyzeIcs(s); rerender(); } catch (err) { toast("Fichier .ics invalide"); } }); }
  else if (a === "adddoc") {
    const files = [...t.files]; if (!files.length) return;
    const { mid, sid } = t.dataset;
    (async () => {
      let ok = 0;
      for (const f of files) {
        try { await uploadSeanceDoc(mid, sid, f); D.docSids.add(sid); ok++; } catch (err) { toast("Erreur sur " + f.name + " : " + err.message); }
      }
      if (ok) toast(plural(ok, "document ajouté", "documents ajoutés"));
      rerender();
    })();
  } else if (a === "todotoggle") {
    const id = t.dataset.id, done = t.checked;
    (async () => {
      try {
        await setTodoDone(id, done);
        const todo = D.todos.find((x) => x.id === id); if (todo) todo.done = done;
        rerender();
      } catch (err) { toast("Erreur : " + err.message); }
    })();
  }
});
function rerenderKeep() { const y = window.scrollY; rerender().then?.(() => 0); requestAnimationFrame(() => window.scrollTo(0, y)); }

// ───────────────────────── Démarrage ─────────────────────────
let lastUid = null;
async function boot() {
  applyTheme();
  await initSync();
  lastUid = sync.user ? sync.user.id : null;
  try { await loadData(); } catch (e) { $("#app").innerHTML = `<div class="empty" style="padding:3rem"><h2>Impossible de charger les données</h2><p>${esc(e.message)}</p><p class="small">Ouvre le site via un serveur web (GitHub Pages, ou <code>python3 -m http.server</code>), pas en double-cliquant sur index.html.</p></div>`; return; }
  shell();
  let sig = "";
  onChange(async () => {
    syncLabel();
    applyTheme(); // une synchro (pull) peut changer state.prefs.theme : il faut réappliquer le rendu
    const uid = sync.user ? sync.user.id : null;
    if (uid !== lastUid) {
      lastUid = uid; D.idx = null;
      // shell() reconstruit aussi la sidebar (liste des matières) : route()/rerender() seul
      // ne touche qu'au contenu de la page, pas au menu de gauche.
      resetContent(); shell(); await route(); // efface tout de suite : jamais de données de l'ancien compte à l'écran, même si le rechargement plante
      try { await loadData(); } catch (e) { console.error("loadData", e); }
      shell(); await route();
      return;
    }
    const s = (sync.user ? sync.user.id : "-") + sync.status + (sync.error || "");
    if (s !== sig) { sig = s; const p0 = parse().parts[0] || ""; if (["", "compte"].includes(p0) && !Q?.qs?.length) rerender(); else if (p0 === "compte") rerender(); }
  });
  window.addEventListener("hashchange", () => { navCount++; route(); });
  await route();
  syncLabel();
}
boot();
window.__app = { D, state, route };
