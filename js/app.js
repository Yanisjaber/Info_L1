import { $, $$, esc, icon, fmtDate, fmtLong, parseDay, startOfDay, daysUntil, pct, shuffle, plural, fmtMMSS, fmt1, toast, appConfirm, renderMath, download } from "./util.js";
import { state, commit, bump, setEntry, onChange, sync, initSync, pull, push, signIn, signUp, magicLink, signOut, exportJSON, importJSON, resetAll, todayKey } from "./store.js";
import { CALC } from "./grades.js";
import { loadMatieres, loadSeances, saveMatiere, deleteMatiere, saveSeance, deleteSeance, loadEdt, updateEdtEvent, analyzeIcs, commitIcsImport, loadPeriodes, savePeriode, deletePeriode, wipeAccount, loadCC, saveCCEvent, deleteCCEvent, loadQCM, saveQCM, deleteQCM, loadFlashcards, saveFlashcard, deleteFlashcard, loadExercices, saveExercice, deleteExercice } from "./content.js";

const D = { matieres: [], periodes: [], cal: { evenements: [], remarques: [] }, edt: { events: [] }, content: {}, Q: [], F: [], E: [], idx: null };
let IDS = [];
const TYPES = { CM: "Cours magistraux", TD: "Travaux dirigés", TP: "Travaux pratiques" };
const view = () => $("#view");
let cleanup = null;
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
  return noms.length === 1 ? noms[0] : "Mes révisions";
}

// ───────────────────────── Données ─────────────────────────
// Vide tout le contenu propre à un compte (matières, cours, EDT). Toujours synchrone et
// appelé AVANT toute requête réseau : si le rechargement qui suit échoue, l'écran reste
// vide (sûr) plutôt que de garder affichées les données du compte précédent (pas sûr).
function resetContent() {
  D.matieres = []; D.periodes = []; D.content = {}; D.Q = []; D.F = []; D.E = []; IDS = []; D.edt = { events: [] }; D.cal = { evenements: [], remarques: [] };
}
async function loadData() {
  resetContent();
  if (sync.user) {
    D.edt = await loadEdt();
    D.periodes = await loadPeriodes();
    D.matieres = await loadMatieres();
    const allIds = D.matieres.map((m) => m.id);
    const [allSeances, allQcm, allFlash, allExo] = await Promise.all([
      Promise.all(allIds.map((id) => loadSeances(id))),
      loadQCM(), loadFlashcards(), loadExercices(),
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
function streak() {
  let d = startOfDay(), n = 0;
  const key = (x) => todayKey(x);
  if (!state.activity[key(d)]?.n) d = new Date(d.getTime() - 864e5);
  while (state.activity[key(d)]?.n) { n++; d = new Date(d.getTime() - 864e5); }
  return n;
}
function heatmap() {
  const today = startOfDay();
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime() - (dow + 15 * 7) * 864e5);
  let h = "";
  for (let i = 0; i < 16 * 7; i++) {
    const d = new Date(start.getTime() + i * 864e5);
    if (d > today) { h += `<i style="visibility:hidden"></i>`; continue; }
    const n = state.activity[todayKey(d)]?.n || 0;
    const l = n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4;
    h += `<i data-l="${l}" title="${fmtDate(todayKey(d))} : ${n} action${n > 1 ? "s" : ""}"></i>`;
  }
  return `<div class="heat" role="img" aria-label="Activité des 16 dernières semaines">${h}</div>`;
}
const ring = (v, c) => `<div class="ring" style="--v:${v};${c ? "--acc:" + c : ""}" data-t="${v}%"></div>`;

// ───────────────────────── Elo ─────────────────────────
// Système de niveau par matière inspiré du classement Elo des jeux à somme nulle : chaque
// question/exercice répondu est un « match » contre un adversaire dont la force dépend de sa
// difficulté (niveau/étoiles). Réussir un exercice difficile fait plus progresser qu'un facile ;
// wchouer contre un exercice facile fait plus reculer. Le rang maximum est en plus conditionné à
// une couverture quasi totale des notions du cours (§ tierFor) : un excellent score sur 3
// questions ne suffit pas à être déclaré « Maître » d'une matière de 100 notions.
const ELO_TIERS = [
  { name: "Débutant", min: 0, cls: "gr" },
  { name: "Apprenti", min: 1000, cls: "gr" },
  { name: "Confirmé", min: 1200, cls: "wa" },
  { name: "Avancé", min: 1400, cls: "wa" },
  { name: "Expert", min: 1650, cls: "ok" },
  { name: "Maître", min: 1850, cls: "ok" },
];
function eloStep(rating, niveau, correct) {
  const oppDiff = 800 + (niveau || 1) * 300; // "force" de l'adversaire selon la difficulté (1 à 3 étoiles)
  const E = 1 / (1 + Math.pow(10, (oppDiff - rating) / 400));
  const K = 24;
  return Math.max(400, Math.min(2200, Math.round(rating + K * ((correct ? 1 : 0) - E))));
}
// Initialise le rating d'une matière à partir de l'historique déjà accumulé (QCM/exercices déjà
// faits avant l'arrivée de cette fonctionnalité), pour ne pas repartir de zéro injustement.
// L'ordre de rejeu n'est pas le vrai ordre chronologique (non conservé) mais converge vers un
// rating cohérent avec le niveau de réussite global.
function seedElo(mid) {
  const c = C(mid);
  let rating = 1000;
  c.qcm.forEach((q) => { const s = state.qcm[q.id]; if (s) rating = eloStep(rating, q.niveau, !!s.last); });
  c.exercices.forEach((e) => { const s = state.exos[e.id]; if (s) rating = eloStep(rating, e.difficulte, s.v === "ok"); });
  return rating;
}
function getElo(mid) {
  const stored = state.elo[mid];
  return stored ? stored.rating : seedElo(mid);
}
// Enregistre un événement noté (QCM, exercice, éval) : met à jour le rating et empile un point
// d'historique (au plus un par jour par matière, pour garder un historique compact et lisible).
function recordElo(mid, niveau, correct) {
  if (!mid) return;
  if (!state.elo[mid]) state.elo[mid] = { rating: seedElo(mid), history: [] };
  const cur = state.elo[mid];
  cur.rating = eloStep(cur.rating, niveau, correct);
  const last = cur.history[cur.history.length - 1];
  if (last && todayKey(new Date(last.ts)) === todayKey()) last.rating = cur.rating;
  else cur.history.push({ ts: Date.now(), rating: cur.rating });
  if (cur.history.length > 120) cur.history.shift();
  commit();
}
// Part des notions du cours (QCM/exercices/cartes) effectivement maîtrisées — condition du rang max.
function coverage(mid) {
  const c = C(mid);
  const totalQ = c.qcm.length, okQ = c.qcm.filter((q) => state.qcm[q.id]?.last).length;
  const totalE = c.exercices.length, okE = c.exercices.filter((e) => state.exos[e.id]?.v === "ok").length;
  const totalF = c.flashcards.length, okF = c.flashcards.filter((f) => state.cards[f.id]?.box >= 4).length;
  const total = totalQ + totalE + totalF;
  return total ? (okQ + okE + okF) / total : 0;
}
function tierFor(rating, cov) {
  let idx = 0;
  for (let i = 0; i < ELO_TIERS.length; i++) if (rating >= ELO_TIERS[i].min) idx = i;
  if (idx === ELO_TIERS.length - 1 && cov < 0.9) idx--; // rang maximum réservé à qui maîtrise (quasi) tout le cours
  return ELO_TIERS[idx];
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
  const rating = getElo(m.id), cov = coverage(m.id), tier = tierFor(rating, cov);
  const hist = (state.elo[m.id]?.history || []).slice(-24);
  const pts = hist.map((h) => ({ ts: h.ts, v: h.rating }));
  const delta = pts.length > 1 ? rating - pts[0].v : 0;
  return `<a class="card" href="#/elo/${m.id}" style="--acc:${m.couleur};display:block;text-decoration:none;color:inherit">
    <div class="row nowrap"><i class="dot" style="--c:${m.couleur}"></i><b>${esc(m.court)}</b><div class="sp"></div><span class="chip ${tier.cls}">${esc(tier.name)}</span></div>
    <div class="row nowrap" style="margin-top:10px;align-items:baseline;gap:8px"><div style="font-size:1.9rem;font-weight:800">${rating}</div>${pts.length > 1 ? `<span class="tiny" style="color:${delta >= 0 ? "var(--ok)" : "var(--ko)"}">${delta >= 0 ? "+" : ""}${delta}</span>` : ""}</div>
    <div class="bar" style="margin-top:10px"><i style="width:${Math.round(cov * 100)}%;background:${m.couleur}"></i></div>
    <div class="tiny muted" style="margin-top:4px">${Math.round(cov * 100)}% des notions maîtrisées</div>
    <div style="margin-top:10px">${pts.length > 1 ? sparklineSvg(pts, { w: 280, h: 46 }) : `<div class="tiny muted">Entraîne-toi pour voir ta progression.</div>`}</div>
  </a>`;
}
function eloPage() {
  if (!sync.user) return { html: `<h1>Elo</h1><div class="empty">Connecte-toi pour voir ton niveau.</div>` };
  const ms = activeMatieres();
  if (!ms.length) return { html: `<h1>Elo</h1><div class="empty">Ajoute une matière (et entraîne-toi) pour voir ton niveau.</div>` };
  const ratings = ms.map((m) => getElo(m.id));
  const covs = ms.map((m) => coverage(m.id));
  const avg = Math.round(ratings.reduce((a, r) => a + r, 0) / ratings.length);
  const avgCov = covs.reduce((a, c) => a + c, 0) / covs.length;
  const avgTier = tierFor(avg, avgCov);
  return {
    html: `<h1>Elo</h1><p class="muted">Ton niveau estimé, matière par matière — calculé comme un classement Elo à partir de tes QCM, exercices et évals blanches, pondéré par la difficulté de chaque question. Le rang maximum n'est atteint que si tu maîtrises la quasi-totalité des notions du cours.</p>
    <div class="card row" style="gap:22px;margin:16px 0;align-items:center">
      <div style="font-size:2.6rem;font-weight:800">${avg}</div>
      <div><span class="chip ${avgTier.cls}">${esc(avgTier.name)}</span><div class="tiny muted" style="margin-top:4px">Niveau global (moyenne des matières actives)</div></div>
    </div>
    <div class="grid g2" style="gap:14px">${ms.map(eloCardHtml).join("")}</div>`,
  };
}
function eloDetail(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const rating = getElo(mid), cov = coverage(mid), tier = tierFor(rating, cov);
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
  }).filter((x) => x.total > 0).sort((a, b) => a.pct - b.pct);
  return {
    html: `<div class="crumbs"><a href="#/elo">Elo</a> › ${esc(m.court)}</div>
    <h1 style="margin:0">${esc(m.nom)}</h1>
    <div class="card row" style="gap:26px;margin:14px 0;align-items:center"><div><div style="font-size:2.6rem;font-weight:800">${rating}</div><span class="chip ${tier.cls}">${esc(tier.name)}</span></div>
      <div class="sp"></div><div style="text-align:right"><div class="tiny muted">Notions maîtrisées</div><div style="font-size:1.5rem;font-weight:700">${Math.round(cov * 100)}%</div></div></div>
    <h3>Évolution du niveau</h3>
    <div class="card">${sparklineSvg(pts, { w: 800, h: 180 })}</div>
    ${evalPts.length > 1 ? `<h3 style="margin-top:20px">Notes aux évals blanches (/20)</h3><div class="card">${sparklineSvg(evalPts, { w: 800, h: 140, min: 0, max: 20 })}</div>` : ""}
    <h3 style="margin-top:20px">Par séance <span class="tiny muted">(les moins maîtrisées d'abord)</span></h3>
    <div class="card list">${seances.map(({ s, pct }) => `<a class="item" href="#/c/${mid}/${s.id}"><div class="sp"><b>${esc(s.type)} ${s.numero}</b> — ${esc(strip(s.titre))}<div class="bar" style="margin-top:6px"><i style="width:${pct}%;background:${m.couleur}"></i></div></div><span class="tiny muted" style="margin-left:10px">${pct}%</span></a>`).join("") || '<div class="empty">Pas encore de données.</div>'}</div>`,
  };
}

// ───────────────────────── Coque ─────────────────────────
function shell() {
  const navSubj = activeMatieres().map((m) => `<a href="#/m/${m.id}" data-nav="m/${m.id}"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.court)}</a>`).join("");
  const brandLabel = periodeLabel();
  const brandMark = (brandLabel !== "Mes révisions" ? brandLabel.replace(/[^A-Za-zÀ-ÿ0-9]/g, "") : "R").slice(0, 2).toUpperCase() || "R";
  $("#app").innerHTML = `
  <aside id="side">
    <a class="brand" href="#/"><span class="logo">${esc(brandMark)}</span><span>${esc(brandLabel)}</span></a>
    <form class="sform" role="search"><input type="text" name="q" placeholder="Rechercher…" aria-label="Rechercher"></form>
    <nav class="nav" aria-label="Navigation">
      <a href="#/" data-nav="">${icon("home")}Accueil</a>
      <a href="#/edt" data-nav="edt">${icon("grid")}Emploi du temps</a>
      <a href="#/cal" data-nav="cal">${icon("cal")}Calendrier</a>
      <a href="#/notes" data-nav="notes">${icon("chart")}Notes &amp; CC</a>
      <a href="#/elo" data-nav="elo">${icon("flag")}Elo</a>
      <div class="sep">Matières</div>${navSubj}
      ${archivedMatieres().length ? `<a href="#/archives" data-nav="archives">${icon("book")}Archives</a>` : ""}
      <div class="sep">S'entraîner</div>
      <a href="#/qcm" data-nav="qcm">${icon("check")}QCM</a>
      <a href="#/eval" data-nav="eval">${icon("clock")}Éval blanche</a>
      <a href="#/cards" data-nav="cards">${icon("cards")}Flashcards</a>
    </nav>
    <div class="side-foot">
      <a class="nav-a btn ghost sm" href="#/compte" data-nav="compte">${icon("user")}<span id="syncl">Compte</span></a>
    </div>
  </aside>
  <div id="main">
    <header id="topbar"><a class="brand" href="#/"><span class="logo">${esc(brandMark)}</span></a><form class="sform" role="search"><input type="text" name="q" placeholder="Rechercher…" aria-label="Rechercher"></form><a href="#/compte" class="btn ghost sm" aria-label="Compte">${icon("user")}</a></header>
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
  el.textContent = !sync.configured ? "Compte (local)" : sync.user ? { ok: "Synchronisé", sync: "Synchro…", error: "Erreur synchro", off: "Connecté" }[sync.status] || "Connecté" : "Se connecter";
}

// ───────────────────────── Routeur ─────────────────────────
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
    else if (p[0] === "eval") ({ html, after } = p[1] === "run" && EV ? evalRunView() : evalSetup(r.q));
    else if (p[0] === "cards") ({ html, after } = p[1] === "run" && FC ? cardsView() : cardsSetup(r.q));
    else if (p[0] === "edt") ({ html, after } = edt());
    else if (p[0] === "todo") ({ html, after } = edtDraft(r.q));
    else if (p[0] === "cal") ({ html, after } = calendar(r.q));
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
  el.innerHTML = html;
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
const cd = (e) => { const d = daysUntil(e.date); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : `dans ${d} jours`; };
function home() {
  const t = totals(), ne = nextEvents(1)[0];
  const dueTot = t.due, wrongTot = t.wrong, st = streak();
  const hero = ne
    ? `<div class="hero" style="--acc:${M(ne.matiere).couleur}"><div class="tiny" style="opacity:.85;text-transform:uppercase;letter-spacing:.06em">Prochaine échéance</div><h1>${esc(M(ne.matiere).court)} — ${esc(ne.titre)}</h1><p>${fmtLong(ne.date)} · <b class="count">${cd(ne)}</b> · poids ${esc(ne.poids)}</p><p class="small">${esc(ne.detail)}</p><div class="row" style="margin-top:12px"><a class="btn" href="#/eval?m=${ne.matiere}">${icon("clock")}Éval blanche ${esc(M(ne.matiere).court)}</a><a class="btn" href="#/qcm?m=${ne.matiere}">${icon("check")}QCM</a><a class="btn" href="#/cal">${icon("cal")}Calendrier</a></div></div>`
    : `<div class="hero"><h1>${esc(periodeLabel())}</h1><p>Plus d'échéance à venir dans le calendrier.</p></div>`;
  const subj = activeMatieres().map((m) => {
    const s = stats(m.id);
    return `<a class="card subj" href="#/m/${m.id}" style="--c:${m.couleur};--acc:${m.couleur}"><div class="row nowrap"><div><h3>${esc(m.court)}</h3><div class="muted small">${esc(m.ue)}</div></div><div class="sp"></div>${ring(s.prog, m.couleur)}</div>
      <div class="muted small">${plural(s.seances, "séance")} · ${plural(s.nq, "QCM", "QCM")} · ${plural(s.nf, "carte")}</div>
      <div class="bar"><i style="width:${s.prog}%;background:${m.couleur}"></i></div>
      <div class="tiny muted">Lu ${s.read}/${s.seances} · QCM ${s.right}/${s.nq} maîtrisés · cartes ${s.mastered}/${s.nf}</div></a>`;
  }).join("");
  const up = nextEvents(5).map((e) => `<a class="item" href="#/cal"><span class="badge" style="--acc:${M(e.matiere).couleur};background:color-mix(in srgb,${M(e.matiere).couleur} 15%,var(--surface));color:${M(e.matiere).couleur}">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(M(e.matiere).court)}</b> — ${esc(e.titre)}<div class="tiny muted">${esc(e.poids)} · ${cd(e)}${e.statut && e.poids !== "à confirmer" ? " · <span class='chip wa'>date provisoire</span>" : ""}</div></div></a>`).join("");
  const onboard = !sync.user
    ? `<div class="card" style="margin-bottom:16px;border-left:4px solid var(--acc)"><b>Connecte-toi pour voir tes matières et tes cours.</b><p class="small muted" style="margin:4px 0 10px">Chaque compte a ses propres matières, cours, QCM et emploi du temps.</p><a class="btn pri" href="#/compte">${icon("user")}Se connecter / créer un compte</a></div>`
    : !activeMatieres().length
      ? `<div class="card" style="margin-bottom:16px;border-left:4px solid var(--acc)"><b>${D.matieres.length ? "Aucune matière active." : "Aucune matière pour l'instant."}</b><p class="small muted" style="margin:4px 0 10px">${D.matieres.length ? "Toutes tes matières sont archivées — remets-en une active, ou crées-en une nouvelle." : "Ajoute ta première matière depuis les paramètres."}</p><a class="btn pri" href="#/compte">${icon("edit")}${D.matieres.length ? "Gérer mes matières" : "Ajouter une matière"}</a></div>`
      : "";
  return {
    html: `${onboard}${hero}
    ${edtHome()}
    <div class="grid g4 keep2" style="margin:16px 0">
      <div class="card stat"><b>${t.read}<small class="muted">/${t.seances}</small></b><span>séances lues</span></div>
      <div class="card stat"><b>${pct(t.ok, t.n)}<small class="muted"> %</small></b><span>réussite aux QCM (${t.answered}/${t.nq} vus)</span></div>
      <div class="card stat"><b>${t.mastered}<small class="muted">/${t.nf}</small></b><span>cartes maîtrisées</span></div>
      <div class="card stat"><b>${st}<small class="muted"> j</small></b><span>jours d'affilée</span></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3 style="margin-top:0">À faire maintenant</h3><div class="list">
        <a class="item" href="#/cards?mode=due"><span class="badge">${icon("cards")}</span><div class="sp"><b>${plural(dueTot, "carte")} à revoir</b><div class="tiny muted">${dueTot ? "révision espacée : c'est le bon moment" : "rien de dû — ajoute des cartes nouvelles"}</div></div>${icon("arrow")}</a>
        <a class="item" href="#/qcm?wrong=1"><span class="badge">${icon("flag")}</span><div class="sp"><b>${plural(wrongTot, "question ratée", "questions ratées")}</b><div class="tiny muted">refais tes erreurs</div></div>${icon("arrow")}</a>
        <a class="item" href="#/qcm"><span class="badge">${icon("check")}</span><div class="sp"><b>Nouveau QCM</b><div class="tiny muted">${D.Q.length} questions avec correction</div></div>${icon("arrow")}</a>
      </div></div>
      <div class="card"><h3 style="margin-top:0">Prochaines échéances</h3><div class="list">${up || '<div class="empty">Aucune échéance.</div>'}</div><a class="btn sm ghost" href="#/cal">Tout le calendrier ${icon("arrow")}</a></div>
    </div>
    <h2>Matières</h2><div class="grid g3">${subj}</div>
    <h2>Activité</h2><div class="card">${heatmap()}<div class="tiny muted" style="margin-top:8px">16 dernières semaines — chaque action (QCM, carte, exercice, cours lu) compte.</div></div>`,
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
    const weak = c.seances.map((x) => { const qs = c.qcm.filter((q) => q.seance === x.id && state.qcm[q.id]); const n = qs.reduce((a, q) => a + state.qcm[q.id].n, 0), ok = qs.reduce((a, q) => a + state.qcm[q.id].ok, 0); return { x, n, acc: pct(ok, n) }; }).filter((w) => w.n >= 3).sort((a, b) => a.acc - b.acc).slice(0, 3);
    const hist = Object.values(state.evals).filter((e) => e.mid === mid).sort((a, b) => b.ts - a.ts).slice(0, 5);
    body = `<div class="grid g3">
      <div class="card"><h3 style="margin-top:0">${icon("check")} QCM</h3><p class="small muted">${plural(s.nq, "question")} avec correction détaillée. ${s.answered} déjà vues, ${s.acc}% de réussite.</p><a class="btn pri" href="#/qcm?m=${mid}">Lancer un QCM</a></div>
      <div class="card"><h3 style="margin-top:0">${icon("clock")} Éval blanche</h3><p class="small muted">Sujet chronométré d'exercices à réponse rédigée, ${m.eval.minutes} min par défaut, noté sur 20.</p><a class="btn pri" href="#/eval?m=${mid}">Passer l'éval</a></div>
      <div class="card"><h3 style="margin-top:0">${icon("cards")} Flashcards</h3><p class="small muted">${plural(s.nf, "carte")} · ${s.due} à revoir · ${s.mastered} maîtrisées.</p><a class="btn pri" href="#/cards?m=${mid}">Réviser</a></div></div>
      ${weak.length ? `<h3>Points faibles</h3><div class="card list">${weak.map((w) => `<a class="item" href="#/qcm?m=${mid}&s=${w.x.id}"><span class="badge">${w.x.type}<br>${w.x.numero}</span><div class="sp"><b>${w.x.titre}</b><div class="tiny muted">${w.acc}% de réussite sur ${w.n} réponses</div></div><span class="chip ko">${w.acc}%</span></a>`).join("")}</div>` : ""}
      ${hist.length ? `<h3>Dernières évals blanches</h3><div class="card list">${hist.map((e) => `<div class="item"><span class="badge">${fmt1(e.score20)}</span><div class="sp"><b>${fmt1(e.score20)} / 20</b> — ${e.ok}/${e.n} bonnes réponses<div class="tiny muted">${new Date(e.ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} · ${Math.round(e.dur / 60)} min</div></div></div>`).join("")}</div>` : ""}`;
  } else if (tab === "exos") {
    body = exosHtml(mid, "");
  } else {
    const evs = D.cal.evenements.filter((e) => e.matiere === mid);
    const rem = D.cal.remarques.filter((r) => r.matiere === mid);
    body = `<div class="card"><p class="muted small" style="margin-top:0">${esc(m.cc)}</p>
      <div class="list">${evs.map((e) => `<div class="item"><span class="badge" style="font-size:.66rem">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(e.titre)}</b> <span class="chip gr">${esc(e.poids)}</span>${e.type === "2e" ? ' <span class="chip wa">2e chance</span>' : ""}<div class="tiny muted">${esc(e.detail)}</div></div></div>`).join("") || '<div class="muted small">Pas de date fixée pour l\'instant.</div>'}</div>
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
async function cours(mid, sid) {
  const m = M(mid), s = m && seanceOf(mid, sid);
  if (!s) return { html: `<div class="empty">Séance introuvable.</div>` };
  const c = C(mid), i = c.seances.findIndex((x) => x.id === sid);
  const prev = c.seances[i - 1], next = c.seances[i + 1];
  const nq = c.qcm.filter((q) => q.seance === sid).length, nf = c.flashcards.filter((f) => f.seance === sid).length, ne = c.exercices.filter((e) => e.seance === sid).length;
  const rd = state.read[sKey(mid, sid)]?.v;
  return {
    html: `<div class="crumbs"><a href="#/m">Matières</a> › <a href="#/m/${mid}">${esc(m.court)}</a> › ${s.type} ${s.numero}</div>
    <div class="row"><div><h1 style="margin:0">${s.titre}</h1><div class="muted">${fmtLong(s.date)} · ${TYPES[s.type]}</div></div><div class="sp"></div>
      ${s.pdf ? `<a class="btn sm" href="${s.pdf}" download>${icon("dl")}PDF</a>` : ""}<a class="btn sm" href="#/mm/${mid}/${sid}">${icon("edit")}Modifier</a><button class="btn sm ${rd ? "" : "pri"}" data-a="read" data-k="${sKey(mid, sid)}">${rd ? "✓ Lu" : "Marquer comme lu"}</button></div>
    <p class="muted">${s.resume}</p>
    <div class="doc-layout"><article class="prose" id="doc">${s.contenu}</article><aside class="toc" id="toc"></aside></div>
    <div class="card" style="margin-top:26px"><h3 style="margin-top:0">S'entraîner sur cette séance</h3><div class="row">
      ${nq ? `<a class="btn pri" href="#/qcm?m=${mid}&s=${sid}">${icon("check")}${nq} QCM</a>` : ""}
      ${nf ? `<a class="btn" href="#/cards?m=${mid}&s=${sid}">${icon("cards")}${nf} cartes</a>` : ""}
      ${ne ? `<a class="btn" href="#/m/${mid}/exos?s=${sid}">${icon("edit")}${ne} exercices</a>` : ""}</div></div>
    <div class="row" style="margin-top:16px">${prev ? `<a class="btn" href="#/c/${mid}/${prev.id}">${icon("back")}${prev.type} ${prev.numero}</a>` : ""}<div class="sp"></div>${next ? `<a class="btn" href="#/c/${mid}/${next.id}">${next.type} ${next.numero}${icon("arrow")}</a>` : ""}</div>`,
    after: (el) => {
      const hs = $$("#doc h2, #doc h3", el);
      $("#toc", el).innerHTML = hs.length > 2 ? `<b>Sommaire</b>` + hs.map((h, k) => { h.id = "s" + k; const cl = h.cloneNode(true); $$(".katex-mathml", cl).forEach((n) => n.remove()); return `<a class="${h.tagName === "H3" ? "l3" : ""}" href="#/c/${mid}/${sid}" data-scroll="s${k}">${esc(cl.textContent.replace(/\s+/g, " ").trim())}</a>`; }).join("") : "";
      $$("[data-scroll]", el).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.getElementById(a.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" }); }));
    },
  };
}

// ───────────────────────── Exercices ─────────────────────────
function exosHtml(mid, sid0) {
  const q = parse().q, sid = sid0 || q.s || "";
  const c = C(mid);
  const L = c.exercices.filter((e) => !sid || e.seance === sid);
  return `<div class="row"><div class="field"><label for="exs">Séance</label><select id="exs" data-a="exfilter" data-m="${mid}"><option value="">Toutes (${c.exercices.length})</option>${c.seances.filter((s) => c.exercices.some((e) => e.seance === s.id)).map((s) => `<option value="${s.id}" ${sid === s.id ? "selected" : ""}>${s.type} ${s.numero} — ${s.titre.replace(/<[^>]+>/g, "")}</option>`).join("")}</select></div><div class="sp"></div><span class="muted small">${L.length} exercices · ${c.exercices.filter((e) => state.exos[e.id]?.v === "ok").length} réussis</span></div>
  ${L.map((e) => { const st = state.exos[e.id]?.v; const s = seanceOf(mid, e.seance); const isCode = e.type === "code", isTexte = e.type === "texte", isAuto = isCode || isTexte; return `<div class="card" style="margin:14px 0" id="${e.id}"><div class="row"><span class="chip gr">${s.type} ${s.numero}</span><span class="chip" title="difficulté">${"★".repeat(e.difficulte)}${"·".repeat(3 - e.difficulte)}</span>${isCode ? '<span class="chip gr">code Python</span>' : isTexte ? '<span class="chip gr">réponse courte</span>' : ""}<div class="sp"></div>${st === "ok" ? '<span class="chip ok">réussi</span>' : st === "redo" ? '<span class="chip wa">à refaire</span>' : ""}</div><h3 style="margin:.6em 0 .3em">${e.titre}</h3><div class="prose">${e.enonce}</div>
    ${e.indice ? `<details><summary>Indice</summary><div class="prose">${e.indice}</div></details>` : ""}
    ${isCode ? codeBlockHtml(e) : isTexte ? texteBlockHtml(e, true) : ""}
    <details><summary>Voir le corrigé</summary><div class="prose">${e.corrige}</div>${isAuto ? "" : `<div class="row" style="margin-top:12px"><span class="small muted">Alors ?</span><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="ok">Je l'avais</button><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="redo">À refaire</button></div>`}</details></div>`; }).join("") || '<div class="empty">Aucun exercice pour cette séance.</div>'}`;
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
function texteBlockHtml(e, checked) {
  const saved = state.reponses[e.id];
  const value = saved?.value ?? "";
  const showResult = checked && saved && saved.ok !== undefined;
  return `<div class="field" style="margin-top:10px"><label>Ta réponse</label>
    <div class="row nowrap"><input type="text" data-texte-id="${e.id}" value="${esc(value)}" style="flex:1" placeholder="Ta réponse…">
    <button class="btn sm pri" data-a="checktexte" data-id="${e.id}">${icon("check")}Vérifier</button></div></div>
    <div id="txres-${e.id}">${showResult ? texteResultHtml(saved.ok) : ""}</div>`;
}
function texteResultHtml(ok) {
  return `<div class="item" style="margin-top:8px"><span class="chip ${ok ? "ok" : "ko"}">${ok ? "✓ Bonne réponse" : "✗ Ce n'est pas ça"}</span></div>`;
}
// Note le résultat d'une correction automatique (code ou texte) : progression + éval en cours si active.
function autoMark(id, ok) {
  setEntry("exos", id, { v: ok ? "ok" : "redo" });
  const ex = D.E.find((e) => e.id === id);
  if (ex) recordElo(ex.mid, ex.difficulte, ok);
  if (EV) {
    const it = EV.items.find((x) => x.e.id === id);
    if (it) {
      it.mark = ok ? "ok" : "redo";
      saveEvalRecord();
      const idx = EV.items.indexOf(it);
      const card = document.getElementById(`ev-${idx}`);
      const chip = card?.querySelector(".chip");
      if (chip) { chip.className = `chip ${it.mark === "ok" ? "ok" : "wa"}`; chip.textContent = it.mark === "ok" ? "réussi" : "à refaire"; }
    }
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
const chipsFor = (name, items, sel) => `<div class="checks">${items.map(([v, l]) => `<label><input type="checkbox" name="${name}" value="${v}" ${sel.has(String(v)) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>`;
function seanceChips(mids, selS) {
  return mids.map((mid) => `<div class="small muted" style="margin:8px 0 4px"><i class="dot" style="--c:${M(mid).couleur};display:inline-block"></i> ${esc(M(mid).court)}</div>${chipsFor("s", C(mid).seances.filter((s) => C(mid).qcm.some((q) => q.seance === s.id)).map((s) => [sKey(mid, s.id), `${s.type} ${s.numero}`]), selS)}`).join("");
}
function quizSetup(q) {
  const selM = new Set(q.m ? q.m.split(",") : IDS);
  const selS = new Set(q.s && q.m ? q.s.split(",").map((s) => sKey(q.m, s)) : []);
  const wrong = q.wrong === "1";
  return {
    html: `<h1>QCM</h1><p class="muted">Entraîne-toi avec correction immédiate, ou passe en mode « examen » (correction à la fin).</p>
    <form class="card" id="qf" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><label>Matières</label>${chipsFor("m", D.matieres.map((m) => [m.id, esc(m.court)]), selM)}</div>
      <div class="field"><label>Séances <span class="tiny">(aucune coche = toutes)</span></label><div id="sc">${seanceChips([...selM], selS)}</div></div>
      <div class="row"><div class="field"><label>Niveau</label>${chipsFor("n", [[1, "Base"], [2, "Moyen"], [3, "Difficile"]], new Set(["1", "2", "3"]))}</div>
      <div class="field" style="max-width:160px"><label for="cnt">Nombre de questions</label><select id="cnt" name="cnt"><option>10</option><option selected>20</option><option>30</option><option>50</option><option value="0">Toutes</option></select></div>
      <div class="field" style="max-width:220px"><label for="mode">Mode</label><select id="mode" name="mode"><option value="train">Entraînement (correction directe)</option><option value="exam">Examen (correction à la fin)</option></select></div></div>
      <label class="row small"><input type="checkbox" name="wrong" ${wrong ? "checked" : ""}> Seulement les questions que j'ai ratées la dernière fois</label>
      <div class="row"><button class="btn pri" type="submit">Commencer</button><span class="muted small" id="pc"></span></div></form>`,
    after: (el) => {
      const f = $("#qf", el);
      const vals = () => { const fd = new FormData(f); return { mids: fd.getAll("m"), sids: new Set(fd.getAll("s")), niv: new Set(fd.getAll("n").map(Number)), wrong: fd.get("wrong") === "on", cnt: +fd.get("cnt"), mode: fd.get("mode") }; };
      const upd = () => { const v = vals(); $("#pc", el).textContent = `${poolQ(v).length} questions disponibles`; };
      f.addEventListener("change", (e) => {
        if (e.target.name === "m") { const cur = new Set(new FormData(f).getAll("s")); $("#sc", el).innerHTML = seanceChips(new FormData(f).getAll("m"), cur); }
        upd();
      });
      f.addEventListener("submit", (e) => {
        e.preventDefault(); const v = vals(); let pool = poolQ(v);
        if (!pool.length) return toast("Aucune question avec ces critères.");
        pool = shuffle(pool); if (v.cnt) pool = pool.slice(0, v.cnt);
        startQuiz(pool, { mode: v.mode, title: v.wrong ? "Mes erreurs" : "QCM", mid: null });
      });
      upd();
    },
  };
}
function poolQ({ mids, sids, niv, wrong }) {
  return D.Q.filter((q) => mids.includes(q.mid) && (!sids.size || sids.has(sKey(q.mid, q.seance))) && niv.has(q.niveau) && (!wrong || state.qcm[q.id]?.last === false));
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
function poolE({ mids, niv }) {
  // Priorise les exercices du niveau demandé ; complète avec les niveaux les plus proches
  // si le cours n'en a pas assez à ce niveau précis pour remplir la durée choisie.
  const all = D.E.filter((e) => mids.includes(e.mid));
  const exact = all.filter((e) => e.difficulte === niv);
  const rest = all.filter((e) => e.difficulte !== niv).sort((a, b) => Math.abs(a.difficulte - niv) - Math.abs(b.difficulte - niv));
  return [...exact, ...rest];
}
function evalSetup(q) {
  const mid = q.m && M(q.m) ? q.m : (IDS[0] || D.matieres[0]?.id);
  if (!mid) return { html: `<h1>Éval blanche</h1><div class="empty">Ajoute d'abord une matière avec des exercices.</div>` };
  const m = M(mid);
  const last = Object.values(state.evals).sort((a, b) => b.ts - a.ts).slice(0, 6);
  return {
    html: `<h1>Éval blanche</h1><p class="muted">Choisis une durée et un niveau : l'app compose un sujet d'exercices à réponse rédigée qui tient dans ce temps, sans correction avant la fin — pour te mettre en conditions d'examen.</p>
    <form class="card" id="ef" style="display:flex;flex-direction:column;gap:16px">
      <div class="row">
        <div class="field"><label for="em">Matière</label><select id="em" name="m">${D.matieres.map((x) => `<option value="${x.id}" ${x.id === mid ? "selected" : ""}>${esc(x.nom)}</option>`).join("")}</select></div>
        <div class="field" style="max-width:140px"><label for="et">Durée (min)</label><input id="et" type="number" name="t" min="10" max="180" step="5" value="${m.eval.minutes}"></div>
        <div class="field" style="max-width:180px"><label for="eniv">Niveau</label><select id="eniv" name="niv"><option value="1">Base</option><option value="2" selected>Moyen</option><option value="3">Difficile</option></select></div>
      </div>
      <div class="row"><button class="btn pri" type="submit">Démarrer l'épreuve</button><span class="muted small" id="epc"></span></div></form>
    ${last.length ? `<h3>Historique</h3><div class="card list">${last.map((e) => `<div class="item"><span class="badge">${fmt1(e.score20)}</span><div class="sp"><b>${esc(M(e.mid)?.court || e.mid)}</b> — ${fmt1(e.score20)}/20 (${e.ok}/${e.n})<div class="tiny muted">${new Date(e.ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</div></div></div>`).join("")}</div>` : ""}`,
    after: (el) => {
      const f = $("#ef", el);
      const estN = () => Math.max(1, Math.round((+f.t.value || 30) / EXO_MINUTES[+f.niv.value]));
      const upd = () => { const avail = poolE({ mids: [f.m.value], niv: +f.niv.value }).length; $("#epc", el).textContent = avail ? `~${Math.min(estN(), avail)} exercice(s) prévu(s) (${avail} au total pour cette matière)` : "Aucun exercice pour cette matière."; };
      f.m.addEventListener("change", () => { f.t.value = M(f.m.value).eval.minutes; upd(); });
      f.addEventListener("change", upd);
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const niv = +f.niv.value, mins = +f.t.value || 30;
        const pool = poolE({ mids: [f.m.value], niv });
        if (!pool.length) return toast("Aucun exercice disponible pour cette matière.");
        const n = Math.min(estN(), pool.length);
        const chosen = balanced(pool.slice(0, n), n);
        startEval(chosen, { minutes: mins, title: "Éval blanche — " + M(f.m.value).court, mid: f.m.value });
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
      const value = state.reponses[e.id]?.value ?? "";
      const ok = checkTextAnswer(value, e.reponse);
      setEntry("reponses", e.id, { value, ok });
      it.mark = ok ? "ok" : "redo";
    }
    if (it.mark) { setEntry("exos", e.id, { v: it.mark }); recordElo(e.mid, e.difficulte, it.mark === "ok"); }
  }
  saveEvalRecord();
  EV.grading = false;
  rerender();
}
function evalScore() {
  const n = EV.items.length, ok = EV.items.filter((it) => it.mark === "ok").length, marked = EV.items.filter((it) => it.mark).length;
  return { n, ok, marked };
}
function saveEvalRecord() {
  const { n, ok } = evalScore();
  const by = {}; EV.items.forEach((it) => { const s = by[it.e.seance] || (by[it.e.seance] = [0, 0]); s[1]++; if (it.mark === "ok") s[0]++; });
  const id = "ev" + EV.start;
  setEntry("evals", id, { id, mid: EV.mid, n, ok, score20: (ok / n) * 20, dur: Math.round(((EV.end || Date.now()) - EV.start) / 1000), seances: by });
  bump(3);
  commit();
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
function recordQ(x) {
  const cur = state.qcm[x.q.id] || { n: 0, ok: 0, last: false };
  const good = okQ(x);
  setEntry("qcm", x.q.id, { n: cur.n + 1, ok: cur.ok + (good ? 1 : 0), last: good });
  recordElo(x.q.mid, x.q.niveau, good);
  bump(1);
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
  if (exam) Q.qs.forEach((x) => { if (x.ans.size) { x.checked = true; recordQ(x); } });
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
function cardsSetup(q) {
  const selM = new Set(q.m ? q.m.split(",") : IDS);
  const selS = new Set(q.s && q.m ? q.s.split(",").map((s) => sKey(q.m, s)) : []);
  const t = totals();
  return {
    html: `<h1>Flashcards</h1><p class="muted">Répétition espacée : ce que tu connais revient de moins en moins souvent, ce que tu rates revient vite. <b>${t.due}</b> à revoir aujourd'hui · ${t.nf - t.seen} nouvelles.</p>
    <form class="card" id="cf" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><label>Matières</label>${chipsFor("m", D.matieres.map((m) => [m.id, esc(m.court)]), selM)}</div>
      <div class="field"><label>Séances <span class="tiny">(aucune coche = toutes)</span></label><div id="sc">${seanceChips2([...selM], selS)}</div></div>
      <div class="row"><div class="field" style="max-width:260px"><label for="cm">Cartes à travailler</label><select id="cm" name="mode"><option value="due" ${q.mode === "due" || !q.mode ? "selected" : ""}>À revoir + nouvelles</option><option value="new">Nouvelles seulement</option><option value="all">Toutes (révision libre)</option></select></div>
      <div class="field" style="max-width:140px"><label for="cc">Par session</label><select id="cc" name="cnt"><option>10</option><option selected>20</option><option>40</option><option value="0">Toutes</option></select></div></div>
      <div class="row"><button class="btn pri" type="submit">Commencer</button><span class="muted small" id="pc"></span></div></form>`,
    after: (el) => {
      const f = $("#cf", el);
      const vals = () => { const fd = new FormData(f); return { mids: fd.getAll("m"), sids: new Set(fd.getAll("s")), mode: fd.get("mode"), cnt: +fd.get("cnt") }; };
      const upd = () => { $("#pc", el).textContent = `${poolF(vals()).length} cartes dans cette session`; };
      f.addEventListener("change", (e) => { if (e.target.name === "m") { const cur = new Set(new FormData(f).getAll("s")); $("#sc", el).innerHTML = seanceChips2(new FormData(f).getAll("m"), cur); } upd(); });
      f.addEventListener("submit", (e) => { e.preventDefault(); const cards = poolF(vals()); if (!cards.length) return toast("Aucune carte à travailler avec ces critères."); FC = { cards, i: 0, flip: false, again: new Set(), good: 0, total: cards.length, done: false }; location.hash = "#/cards/run"; });
      upd();
    },
  };
}
const seanceChips2 = (mids, selS) => mids.map((mid) => `<div class="small muted" style="margin:8px 0 4px"><i class="dot" style="--c:${M(mid).couleur};display:inline-block"></i> ${esc(M(mid).court)}</div>${chipsFor("s", C(mid).seances.filter((s) => C(mid).flashcards.some((f) => f.seance === s.id)).map((s) => [sKey(mid, s.id), `${s.type} ${s.numero}`]), selS)}`).join("");
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
  setEntry("cards", f.id, { box, n: cur.n + 1, ok: cur.ok + (r === "again" ? 0 : 1), due: r === "again" ? Date.now() : Date.now() + DAYS[box] * 864e5 });
  bump(1);
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
// Associe un créneau de l'EDT à la séance de cours correspondante (même matière, même date, même type)
const EDT_TYPE_MAP = { Cours: "CM", TD: "TD", TP: "TP" };
function seanceFor(e) {
  const want = EDT_TYPE_MAP[e.t];
  if (!want || !e.m) return null;
  const c = C(e.m);
  if (!c) return null;
  const cands = c.seances.filter((s) => s.date === e.d && s.type === want).sort((a, b) => a.numero - b.numero);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  const sameDay = D.edt.events.filter((x) => x.d === e.d && x.m === e.m && x.t === e.t).sort((a, b) => toMin(a.s) - toMin(b.s));
  return cands[sameDay.indexOf(e)] ?? cands[0];
}
function draftHrefFor(e) {
  const want = EDT_TYPE_MAP[e.t];
  if (!want || !e.m) return null;
  return `#/todo?m=${e.m}&d=${e.d}&t=${encodeURIComponent(e.t)}&s=${e.s}&e=${e.e}&r=${encodeURIComponent(e.r || "")}&p=${encodeURIComponent(e.p || "")}&g=${encodeURIComponent(e.g || "")}`;
}
function edtCard(e, now, top, height, left, width, px) {
  const st = edtState(e, now), cc = e.t === "CC", sc = seanceFor(e);
  const compact = px < 58, micro = px < 32;
  const tt = esc([`${e.s}–${e.e}`, edtName(e), edtMetaRaw(e), e.n].filter(Boolean).join(" · "));
  const href = sc ? `#/c/${e.m}/${sc.id}` : draftHrefFor(e);
  const clickable = cc && !href && e.id;
  const tag = href ? "a" : "div";
  return `<${tag} class="edt-ev ${cc ? "cc " : ""}${st}${href || clickable ? " clickable" : ""}" style="--c:${edtColor(e)};top:${top}%;height:${height}%;left:${left}%;width:calc(${width}% - 3px)" title="${tt}"${href ? ` href="${href}"` : ""}${clickable ? ` data-a="edtev" data-id="${esc(e.id)}"` : ""}>
    <div class="edt-h"><b>${e.s}${micro ? "" : "–" + e.e}</b>${!micro ? `<span class="chip ${cc ? "wa" : "gr"}">${esc(e.t)}</span>` : ""}${!micro && st === "live" ? '<span class="chip ok">en cours</span>' : ""}</div>
    ${!micro ? `<div class="edt-t">${esc(edtName(e))}</div>` : ""}
    ${!compact && edtMeta(e) ? `<div class="tiny muted">${edtMeta(e)}</div>` : ""}${!compact && e.n ? `<div class="tiny edt-n">${esc(e.n)}</div>` : ""}
    ${!compact && sc ? `<span class="tiny edt-link">${icon("book")}${esc(sc.type)} ${sc.numero}</span>` : ""}${!compact && !sc && href ? `<span class="tiny edt-link">${icon("edit")}Rédiger ce cours</span>` : ""}</${tag}>`;
}
const edtRel = (iso) => { const d = daysUntil(iso); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : fmtLong(iso); };
function edtRow(e, now, rel) {
  const c = edtColor(e), st = edtState(e, now), sc = seanceFor(e);
  const href = sc ? `#/c/${e.m}/${sc.id}` : draftHrefFor(e) || "#/edt";
  return `<a class="item edt-row ${st}" href="${href}"><span class="badge" style="background:color-mix(in srgb,${c} 15%,var(--surface));color:${c}">${e.s}</span><div class="sp"><b>${esc(edtName(e))}</b> <span class="chip ${e.t === "CC" ? "wa" : "gr"}">${esc(e.t)}</span>${st === "live" ? ' <span class="chip ok">en cours</span>' : ""}<div class="tiny muted">${rel ? edtRel(e.d) + " · " : ""}${e.s}–${e.e}${edtMeta(e) ? " · " + edtMeta(e) : ""}${sc ? ` · ${esc(sc.type)} ${sc.numero}` : ""}</div></div></a>`;
}
function edtHome() {
  if (!D.edt.events.length) return "";
  const now = new Date(), iso = todayKey();
  const day = edtOf(iso), timed = day.filter((e) => !e.allday), off = day.find((e) => e.allday);
  const left = timed.some((e) => pd(e.d, e.e) > now);
  const nx = left ? null : D.edt.events.find((e) => !e.allday && e.t !== "Réunion" && pd(e.d, e.e) > now);
  const head = timed.length ? "" : `<div class="small muted" style="margin:4px 0 8px">${off ? esc(edtLabel(off)) + " aujourd'hui." : "Pas de cours aujourd'hui."}</div>`;
  const doneMsg = timed.length && !left ? '<div class="small muted" style="margin:4px 0 8px">Journée terminée.</div>' : "";
  return `<div class="card" style="margin-top:16px"><div class="row"><h3 style="margin:0">Aujourd'hui</h3><div class="sp"></div><a class="btn sm ghost" href="#/edt">${icon("grid")}Emploi du temps</a></div>
    ${head}<div class="list">${timed.map((e) => edtRow(e, now)).join("")}</div>${doneMsg}
    ${nx ? `<div class="tiny muted" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.06em">Prochain cours</div><div class="list">${edtRow(nx, now, true)}</div>` : ""}</div>`;
}
let edtWeek = null;
const mondayOf = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const EDT_HOUR_PX = 64;
function edt() {
  if (!D.edt.events.length) return { html: `<h1>Emploi du temps</h1><div class="empty">${sync.user ? `Aucun emploi du temps importé.<div style="margin-top:10px"><a class="btn pri" href="#/compte">${icon("dl")}Importer mon EDT</a></div>` : `Connecte-toi pour importer ton emploi du temps.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div>`}</div>` };
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
    html: `<h1 style="text-align:center">Emploi du temps</h1>
    <div class="row center" style="margin:6px 0 14px"><button class="btn sm" data-a="edtprev" aria-label="Semaine précédente">${icon("back")}</button><b style="min-width:170px;text-align:center">${fs.format(shown[0])} – ${fs.format(shown[shown.length - 1])}</b><button class="btn sm" data-a="edtnext" aria-label="Semaine suivante">${icon("arrow")}</button></div>
    <div class="tiny muted" style="margin:-6px 0 12px;text-align:center">${plural(wkEv.length, "créneau", "créneaux")} · ${String(Math.round(hrs * 10) / 10).replace(".", ",")} h dans la semaine</div>
    <div class="edt-wrap"><div class="edt-inner" style="--n:${shown.length};--hpx:${EDT_HOUR_PX}px">
      <div class="edt-corner"></div>${heads}
      <div class="edt-axis" style="height:${gridH}px">${axisLabels}</div>${cols}
    </div></div>
    <div id="edtd"></div>
    <p class="tiny muted" style="margin-top:14px">Source : emploi du temps UPS (${esc(D.edt.source || "")}). Les horaires peuvent changer : vérifie sur l'ENT en cas de doute.</p>`,
  };
}
function edtEventDetailHtml(e) {
  const m = matiereFromCCLabel(e.n);
  const types = ["Cours", "TD", "TP", "Réunion", "Férié"];
  return `<div class="card" style="margin-top:14px">
    <b>${esc(e.n || "Créneau")}</b>
    <div class="tiny muted">${fmtLong(e.d)} · ${e.s}–${e.e}${e.r ? " · " + esc(e.r) : ""}</div>
    ${m ? `<div class="row" style="margin-top:10px"><button class="btn sm pri" data-a="addccsugg" data-m="${esc(m.id)}" data-date="${e.d}" data-titre="${esc(e.n || "CC")}">${icon("check")}Ajouter à mes échéances (${esc(m.court)})</button></div>` : `<p class="tiny muted" style="margin-top:10px">Matière non reconnue automatiquement : ajoute cette échéance depuis le Calendrier si besoin.</p>`}
    <div class="row" style="margin-top:10px;align-items:center">
      <label class="small muted" for="edtd-type">Ce n'est pas un CC ?</label>
      <select id="edtd-type">${types.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
      <button class="btn sm" data-a="edtretype" data-id="${esc(e.id)}">Changer le type</button>
    </div>
  </div>`;
}
function edtDraft(q) {
  const m = M(q.m), want = EDT_TYPE_MAP[q.t];
  if (!m || !want || !q.d) return { html: `<div class="empty">Créneau introuvable.</div>` };
  const sameType = C(q.m).seances.filter((s) => s.type === want);
  const numero = sameType.length ? Math.max(...sameType.map((s) => s.numero)) + 1 : 1;
  const meta = [q.r, q.p, q.g].filter(Boolean).join(" · ");
  const reqText = `Écris le ${want} ${numero} de ${m.nom} (${fmtLong(q.d)}, ${q.s}–${q.e}${q.r ? ", " + q.r : ""}${q.p ? ", " + q.p : ""}) et ajoute-le au site, dans le style des séances existantes.`;
  return {
    html: `<div class="crumbs"><a href="#/edt">Emploi du temps</a> › ${esc(m.court)} · ${want} ${numero}</div>
    <h1 style="margin:0">${esc(m.nom)} — ${want} ${numero}</h1>
    <div class="muted" style="margin-bottom:4px">${fmtLong(q.d)} · ${q.s}–${q.e}${meta ? " · " + esc(meta) : ""}</div>
    <div class="card" style="margin-top:18px;border-left:4px solid ${m.couleur}">
      <p class="muted" style="margin-top:0">Ce cours n'a pas encore été rédigé.</p>
      <p>Copie cette demande et colle-la dans une conversation avec Claude : il rédigera le cours complet et l'ajoutera au site.</p>
      <textarea readonly style="width:100%;min-height:90px;resize:vertical;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface2);color:var(--text);font:inherit">${esc(reqText)}</textarea>
      <div class="row" style="margin-top:12px"><button class="btn pri" data-a="copyreq" data-text="${esc(reqText)}">${icon("edit")}Copier la demande</button></div>
    </div>`,
  };
}

// ───────────────────────── Calendrier ─────────────────────────
// ── Ajout d'échéances CC : formulaire manuel, suggestions depuis l'EDT, analyse IA ──
function ccEntryForm(e) {
  const isNew = !e;
  const v = e || { id: "", matiere: D.matieres[0]?.id || "", titre: "", date: "", poids: "", type: "CC", statut: "", detail: "" };
  if (!D.matieres.length) return `<p class="small muted">Crée d'abord une matière (Compte → Mes matières) avant d'ajouter une échéance.</p>`;
  return `<form data-a="savecc">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <div class="grid g2">
      <div class="field"><label>Matière</label><select name="matiere" required>${D.matieres.map((m) => `<option value="${esc(m.id)}" ${v.matiere === m.id ? "selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></div>
      <div class="field"><label>Date</label><input type="date" name="date" required value="${esc(v.date || "")}"></div>
      <div class="field"><label>Titre</label><input type="text" name="titre" required value="${esc(v.titre)}" placeholder="ex. CC1"></div>
      <div class="field"><label>Poids</label><input type="text" name="poids" value="${esc(v.poids)}" placeholder="ex. 20 %"></div>
    </div>
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
    </div>
  </form>`;
}
function ccAdminHtml() {
  return `${D.cal.evenements.map((e) => `<div class="card" style="margin-bottom:10px">
    <div class="row nowrap"><i class="dot" style="--c:${M(e.matiere)?.couleur || "#888"}"></i><div class="sp"><b>${esc(M(e.matiere)?.court || "?")}</b> — ${esc(e.titre)}<div class="tiny muted">${fmtLong(e.date)}${e.poids ? " · " + esc(e.poids) : ""}</div></div></div>
    <details style="margin-top:10px"><summary>Modifier</summary><div style="margin-top:10px">${ccEntryForm(e)}</div></details>
  </div>`).join("")}
  <details ${D.cal.evenements.length ? "" : "open"}><summary>Ajouter une échéance</summary><div class="card" style="margin-top:10px">${ccEntryForm(null)}</div></details>`;
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
  const have = new Set(D.cal.evenements.map((e) => e.matiere + "|" + e.date));
  const sugg = D.edt.events
    .filter((e) => e.t === "CC")
    .map((e) => ({ e, mid: e.m || matiereFromCCLabel(e.n)?.id }))
    .filter(({ e, mid }) => mid && !have.has(mid + "|" + e.d));
  if (!sugg.length) return "";
  return `<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">Suggestions depuis ton emploi du temps</h3>
    <div class="list">${sugg.map(({ e, mid }) => `<div class="item"><div class="sp"><b>${esc(M(mid)?.court || "")}</b> — ${esc((e.n || "Examen").replace(/^.*?[-–—]\s*/, ""))}<div class="tiny muted">${fmtLong(e.d)} · ${e.s}–${e.e}</div></div><button class="btn sm" data-a="addccsugg" data-m="${esc(mid)}" data-date="${e.d}" data-titre="${esc(e.n || "CC")}">${icon("check")}Ajouter</button></div>`).join("")}</div></div>`;
}
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
  const line = (e) => `<div class="item"><span class="badge" style="background:color-mix(in srgb,${M(e.matiere).couleur} 15%,var(--surface));color:${M(e.matiere).couleur};font-size:.66rem">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(M(e.matiere).court)}</b> — ${esc(e.titre)} <span class="chip gr">${esc(e.poids)}</span>${e.type === "2e" ? ' <span class="chip wa">2e chance</span>' : ""}${e.statut && e.poids !== "à confirmer" ? ` <span class="chip wa">${e.statut === "provisoire" ? "date provisoire" : "à confirmer"}</span>` : ""}<div class="tiny muted">${fmtLong(e.date)} · ${esc(e.detail)}</div></div><span class="count small muted">${daysUntil(e.date) >= 0 ? "J-" + daysUntil(e.date) : "passé"}</span></div>`;
  return {
    html: `<h1>Calendrier</h1>
    ${ccSuggestionsHtml()}
    <div class="row" style="margin:6px 0 14px"><button class="btn sm" data-a="calprev" aria-label="Mois précédent">${icon("back")}</button><b style="min-width:150px;text-align:center;text-transform:capitalize">${monthName}</b><button class="btn sm" data-a="calnext" aria-label="Mois suivant">${icon("arrow")}</button><button class="btn sm ghost" data-a="caltoday">Aujourd'hui</button><div class="sp"></div><label class="row small"><input type="checkbox" data-a="calses" ${calSeances ? "checked" : ""}> Afficher les séances</label><button class="btn sm" data-a="ics">${icon("dl")}Export .ics</button></div>
    <div class="cal">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells}</div>
    <div id="evd"></div>
    <h2>À venir</h2><div class="card list">${upcoming.map(line).join("") || '<div class="empty">Rien à venir.</div>'}</div>
    ${D.cal.remarques.length ? `<div class="warn prose" style="margin-top:14px;padding:12px 16px"><b>À compléter —</b><ul>${D.cal.remarques.map((r) => `<li><b>${esc(M(r.matiere).court)}</b> : ${esc(r.texte)}</li>`).join("")}</ul></div>` : ""}
    ${past.length ? `<details><summary>Épreuves passées (${past.length})</summary><div class="list">${past.map(line).join("")}</div></details>` : ""}
    <details class="card" style="margin-top:18px" data-section="ccadmin"><summary>Mes échéances (ajouter/modifier/supprimer)</summary><div style="margin-top:12px">${ccAdminHtml()}</div></details>`,
    after: (el) => {
      $$('form[data-a="savecc"]', el).forEach((f) => f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        try {
          await saveCCEvent({ id: fd.get("id") || undefined, matiere: fd.get("matiere"), date: fd.get("date"), titre: fd.get("titre"), poids: fd.get("poids"), type: fd.get("type"), statut: fd.get("statut"), detail: fd.get("detail") });
          toast("Échéance enregistrée");
          await loadData(); rerender();
        } catch (err) { toast("Erreur : " + err.message); }
      }));
    },
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
        location.hash = `#/mm/${mid}`;
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
        await saveQCM({ id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, type: rep.length > 1 ? "multiple" : "unique", q: fd.get("q"), choix, rep, expl: fd.get("expl"), niveau: +fd.get("niveau") || 1 });
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
        await saveFlashcard({ id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, recto: fd.get("recto"), verso: fd.get("verso") });
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
        await saveExercice({ id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, titre: fd.get("titre"), difficulte: +fd.get("difficulte") || 1, enonce: fd.get("enonce"), indice: fd.get("indice"), corrige: fd.get("corrige"), type: fd.get("type") || "texte", codeStarter: fd.get("code_starter"), codeTests: fd.get("code_tests"), reponse: fd.get("reponse") });
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
  const v = it || { seance: "", titre: "", difficulte: 1, enonce: "", indice: "", corrige: "", type: "texte", codeStarter: "", codeTests: "", reponse: "" };
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
      <div class="field exo-texte-field" style="margin-top:10px"><label>Réponse attendue — plusieurs formes acceptées possibles, séparées par « | » (ex. <code>6|6.0|six</code>)</label><input type="text" name="reponse" value="${esc(v.reponse)}"></div>
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
    ${a.ccCount ? `<p class="tiny muted">${plural(a.ccCount, "créneau d'examen détecté", "créneaux d'examen détectés")} (CC) — à vérifier toi-même dans le calendrier, pas encore ajoutés automatiquement.</p>` : ""}
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
  if (a === "read") { const k = t.dataset.k, cur = state.read[k]?.v; setEntry("read", k, { v: !cur }); if (!cur) bump(3); commit(); const [mid, sid] = k.split("/"); const s = seanceOf(mid, sid); t.textContent = !cur ? "✓ Lu" : "Marquer comme lu"; t.classList.toggle("pri", cur); toast(!cur ? "Marqué comme lu" : "Marqué comme non lu"); }
  else if (a === "choose") { const x = Q.qs[Q.i]; if (x.checked) return; const i = +t.dataset.i; if (x.q.type === "multiple") { x.ans.has(i) ? x.ans.delete(i) : x.ans.add(i); } else { x.ans = new Set([i]); } rerenderKeep(); }
  else if (a === "check") { const x = Q.qs[Q.i]; if (!x.ans.size) return; x.checked = true; recordQ(x); commit(); rerenderKeep(); }
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
    setEntry("exos", it.e.id, { v: it.mark });
    recordElo(it.e.mid, it.e.difficulte, it.mark === "ok");
    saveEvalRecord();
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
      if (ran) autoMark(id, !r.error && r.results.every((x) => x.ok));
    } catch (err) {
      if (resEl) resEl.innerHTML = `<div class="warn prose" style="padding:8px 12px;margin-top:8px">Erreur de chargement de Python : ${esc(err.message)}</div>`;
    }
    t.disabled = false;
  }
  else if (a === "checktexte") {
    const id = t.dataset.id, exo = D.E.find((x) => x.id === id);
    if (!exo) return;
    const input = document.querySelector(`input[data-texte-id="${id}"]`);
    const value = input ? input.value : (state.reponses[id]?.value ?? "");
    const ok = checkTextAnswer(value, exo.reponse);
    setEntry("reponses", id, { value, ok });
    commit();
    const resEl = document.getElementById(`txres-${id}`);
    if (resEl) resEl.innerHTML = texteResultHtml(ok);
    autoMark(id, ok);
  }
  else if (a === "flip") { FC.flip = !FC.flip; rerender(); }
  else if (a === "rate") rate(t.dataset.r);
  else if (a === "exo") { setEntry("exos", t.dataset.id, { v: t.dataset.v }); bump(2); commit(); toast(t.dataset.v === "ok" ? "Bien joué" : "Noté à refaire"); }
  else if (a === "calprev") { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); rerender(); }
  else if (a === "calnext") { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); rerender(); }
  else if (a === "caltoday") { calMonth = null; rerender(); }
  else if (a === "ics") icsExport();
  else if (a === "edtprev") { edtWeek.setDate(edtWeek.getDate() - 7); rerender(); }
  else if (a === "edtnext") { edtWeek.setDate(edtWeek.getDate() + 7); rerender(); }
  else if (a === "edtev") { const ev = D.edt.events.find((x) => x.id === t.dataset.id); if (ev) $("#edtd").innerHTML = edtEventDetailHtml(ev); }
  else if (a === "edtretype") {
    const sel = document.getElementById("edtd-type"), newType = sel?.value; if (!newType) return;
    try { await updateEdtEvent(t.dataset.id, { t: newType }); toast("Type mis à jour"); await loadData(); rerender(); }
    catch (err) { toast("Erreur : " + err.message); }
  }
  else if (a === "evt") { const ev = D.cal.evenements.find((x) => x.id === t.dataset.id); $("#evd").innerHTML = `<div class="card" style="margin-top:12px;border-left:4px solid ${M(ev.matiere).couleur}"><b>${esc(M(ev.matiere).nom)} — ${esc(ev.titre)}</b><div class="muted small">${fmtLong(ev.date)} · poids ${esc(ev.poids)} · ${cd(ev)}</div><p class="small">${esc(ev.detail)}</p><div class="row"><a class="btn sm pri" href="#/eval?m=${ev.matiere}">Éval blanche</a><a class="btn sm" href="#/qcm?m=${ev.matiere}">QCM</a><a class="btn sm" href="#/m/${ev.matiere}/cc">Fiche CC</a></div></div>`; }
  else if (a === "login") { /* submit géré */ }
  else if (a === "signup") doAuth("signup", $("#lf"));
  else if (a === "magic") doAuth("magic", $("#lf"));
  else if (a === "logout") { await signOut(); rerender(); }
  else if (a === "pull") { await pull(); rerender(); toast("Données récupérées"); }
  else if (a === "push") { await push(); rerender(); toast("Données envoyées"); }
  else if (a === "export") download("progression-l1s1.json", exportJSON(), "application/json");
  else if (a === "copyreq") { try { await navigator.clipboard.writeText(t.dataset.text); toast("Demande copiée — colle-la à Claude"); } catch (err) { toast("Copie impossible : sélectionne le texte à la main"); } }
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
  else if (a === "delseance") { if (await appConfirm("Supprimer cette séance ?")) { await deleteSeance(t.dataset.mid, t.dataset.sid); toast("Séance supprimée"); await loadData(); location.hash = `#/mm/${t.dataset.mid}`; } }
  else if (a === "delqcm") { if (await appConfirm("Supprimer cette question ?")) { await deleteQCM(t.dataset.id); toast("Question supprimée"); await loadData(); location.hash = `#/aq/${t.dataset.mid}`; } }
  else if (a === "delflash") { if (await appConfirm("Supprimer cette carte ?")) { await deleteFlashcard(t.dataset.id); toast("Carte supprimée"); await loadData(); location.hash = `#/af/${t.dataset.mid}`; } }
  else if (a === "delexo") { if (await appConfirm("Supprimer cet exercice ?")) { await deleteExercice(t.dataset.id); toast("Exercice supprimé"); await loadData(); location.hash = `#/ax/${t.dataset.mid}`; } }
  else if (a === "confirmics") { if (!icsPreview) return; toast("Import en cours…"); try { const r = await commitIcsImport(icsPreview, D.matieres); icsPreview = null; toast(`Importé : ${plural(r.matieresCreees, "matière créée", "matières créées")}, ${plural(r.evenements, "créneau")}`); await loadData(); refreshShell(); } catch (err) { toast("Erreur : " + err.message); } }
  else if (a === "cancelics") { icsPreview = null; rerender(); }
  else if (a === "delcc") { if (await appConfirm("Supprimer cette échéance ?")) { try { await deleteCCEvent(t.dataset.id); toast("Échéance supprimée"); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); } } }
  else if (a === "addccsugg") {
    try { await saveCCEvent({ matiere: t.dataset.m, date: t.dataset.date, titre: t.dataset.titre, poids: "" }); toast("Échéance ajoutée"); await loadData(); rerender(); }
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
document.addEventListener("change", (e) => {
  const t = e.target, a = t.dataset?.a;
  if (t.dataset.codeId) { setEntry("reponses", t.dataset.codeId, { value: t.value }); commit(); return; }
  if (t.dataset.texteId) { const cur = state.reponses[t.dataset.texteId]; setEntry("reponses", t.dataset.texteId, { value: t.value, ok: cur?.ok }); commit(); return; }
  if (a === "calses") { calSeances = t.checked; rerender(); }
  else if (a === "theme") { state.prefs.theme = t.value; state.prefs.ts = Date.now(); applyTheme(); commit(); }
  else if (a === "exfilter") { location.hash = `#/m/${t.dataset.m}/exos` + (t.value ? "?s=" + t.value : ""); }
  else if (a === "import") { const f = t.files[0]; if (!f) return; f.text().then((s) => { try { importJSON(s); toast("Progression importée"); rerender(); } catch (err) { toast("Fichier invalide"); } }); }
  else if (a === "icsfile") { const f = t.files[0]; if (!f) return; f.text().then((s) => { try { icsPreview = analyzeIcs(s); rerender(); } catch (err) { toast("Fichier .ics invalide"); } }); }
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
  window.addEventListener("hashchange", () => route());
  await route();
  syncLabel();
}
boot();
window.__app = { D, state, route };
