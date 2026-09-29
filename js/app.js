import { $, $$, esc, icon, fmtDate, fmtLong, parseDay, startOfDay, daysUntil, pct, shuffle, plural, fmtMMSS, fmt1, toast, renderMath, download } from "./util.js";
import { state, commit, bump, setEntry, onChange, sync, initSync, pull, push, signIn, signUp, magicLink, signOut, exportJSON, importJSON, resetAll, todayKey } from "./store.js";
import { CALC } from "./grades.js";

const D = { matieres: [], cal: { evenements: [], remarques: [] }, edt: { events: [] }, content: {}, Q: [], F: [], E: [], frag: {}, idx: null };
const IDS = ["algo1", "bas", "devenir", "bases2", "calc1", "sn"];
const TYPES = { CM: "Cours magistraux", TD: "Travaux dirigés", TP: "Travaux pratiques" };
const view = () => $("#view");
let cleanup = null;
let Q = null; // session QCM / éval
let FC = null; // session flashcards

const M = (id) => D.matieres.find((m) => m.id === id);
const C = (id) => D.content[id];
const sKey = (mid, sid) => mid + "/" + sid;
const seanceOf = (mid, sid) => C(mid).seances.find((s) => s.id === sid);
const tag = (mid) => `<span class="chip" style="--acc:${M(mid).couleur}"><i class="dot" style="--c:${M(mid).couleur}"></i>${esc(M(mid).court)}</span>`;
const isRef = (q) => q.choix.some((c) => /(toutes? les|aucune? (des|de ces)|les deux|ci-dessus|ci-dessous|\b[A-D] et [A-D]\b|réponses? [a-d1-4]\b|réponses? précédentes?)/i.test(c));

// ───────────────────────── Données ─────────────────────────
async function j(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }
async function loadData() {
  D.matieres = await j("data/matieres.json");
  D.cal = await j("data/calendrier.json");
  try { D.edt = await j("data/edt.json"); } catch (e) { D.edt = { events: [] }; }
  const all = await Promise.all(IDS.map((id) => j(`data/content/${id}.json`)));
  IDS.forEach((id, i) => (D.content[id] = all[i]));
  IDS.forEach((id) => {
    C(id).qcm.forEach((q) => D.Q.push({ ...q, mid: id }));
    C(id).flashcards.forEach((f) => D.F.push({ ...f, mid: id }));
    C(id).exercices.forEach((e) => D.E.push({ ...e, mid: id }));
  });
}
async function fragment(s) {
  if (D.frag[s.fichier]) return D.frag[s.fichier];
  const r = await fetch(s.fichier);
  if (!r.ok) throw new Error(s.fichier);
  return (D.frag[s.fichier] = await r.text());
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
const totals = () => IDS.reduce((t, id) => { const s = stats(id); for (const k of ["read", "seances", "nq", "answered", "right", "n", "ok", "nf", "seen", "mastered", "due", "wrong"]) t[k] = (t[k] || 0) + s[k]; return t; }, {});
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

// ───────────────────────── Coque ─────────────────────────
function shell() {
  const navSubj = D.matieres.map((m) => `<a href="#/m/${m.id}" data-nav="m/${m.id}"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.court)}</a>`).join("");
  $("#app").innerHTML = `
  <aside id="side">
    <a class="brand" href="#/"><span class="logo">L1</span><span>Révisions S1</span></a>
    <form class="sform" role="search"><input type="text" name="q" placeholder="Rechercher…" aria-label="Rechercher"></form>
    <nav class="nav" aria-label="Navigation">
      <a href="#/" data-nav="">${icon("home")}Accueil</a>
      <a href="#/edt" data-nav="edt">${icon("grid")}Emploi du temps</a>
      <a href="#/cal" data-nav="cal">${icon("cal")}Calendrier</a>
      <a href="#/notes" data-nav="notes">${icon("chart")}Notes &amp; CC</a>
      <div class="sep">Matières</div>${navSubj}
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
    <header id="topbar"><a class="brand" href="#/"><span class="logo">L1</span></a><form class="sform" role="search"><input type="text" name="q" placeholder="Rechercher…" aria-label="Rechercher"></form><a href="#/compte" class="btn ghost sm" aria-label="Compte">${icon("user")}</a></header>
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
    else if (p[0] === "m") ({ html, after } = matiere(p[1], p[2] || "cours"));
    else if (p[0] === "c") ({ html, after } = await cours(p[1], p[2]));
    else if (p[0] === "qcm") ({ html, after } = p[1] === "run" && Q ? quizView() : quizSetup(r.q));
    else if (p[0] === "eval") ({ html, after } = p[1] === "run" && Q ? quizView() : evalSetup(r.q));
    else if (p[0] === "cards") ({ html, after } = p[1] === "run" && FC ? cardsView() : cardsSetup(r.q));
    else if (p[0] === "edt") ({ html, after } = edt());
    else if (p[0] === "cal") ({ html, after } = calendar(r.q));
    else if (p[0] === "notes") ({ html, after } = notes());
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
  document.title = (el.querySelector("h1")?.textContent || "Révisions") + " — L1 S1";
}
const rerender = () => route();

// ───────────────────────── Accueil ─────────────────────────
function nextEvents(n = 4) {
  return D.cal.evenements.filter((e) => daysUntil(e.date) >= 0).slice(0, n);
}
const cd = (e) => { const d = daysUntil(e.date); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : `dans ${d} jours`; };
function home() {
  const t = totals(), ne = nextEvents(1)[0];
  const dueTot = t.due, wrongTot = t.wrong, st = streak();
  const hero = ne
    ? `<div class="hero" style="--acc:${M(ne.matiere).couleur}"><div class="tiny" style="opacity:.85;text-transform:uppercase;letter-spacing:.06em">Prochaine échéance</div><h1>${esc(M(ne.matiere).court)} — ${esc(ne.titre)}</h1><p>${fmtLong(ne.date)} · <b class="count">${cd(ne)}</b> · poids ${esc(ne.poids)}</p><p class="small">${esc(ne.detail)}</p><div class="row" style="margin-top:12px"><a class="btn" href="#/eval?m=${ne.matiere}">${icon("clock")}Éval blanche ${esc(M(ne.matiere).court)}</a><a class="btn" href="#/qcm?m=${ne.matiere}">${icon("check")}QCM</a><a class="btn" href="#/cal">${icon("cal")}Calendrier</a></div></div>`
    : `<div class="hero"><h1>Révisions L1 — Semestre 1</h1><p>Plus d'échéance à venir dans le calendrier.</p></div>`;
  const subj = D.matieres.map((m) => {
    const s = stats(m.id);
    return `<a class="card subj" href="#/m/${m.id}" style="--c:${m.couleur};--acc:${m.couleur}"><div class="row nowrap"><div><h3>${esc(m.court)}</h3><div class="muted small">${esc(m.ue)}</div></div><div class="sp"></div>${ring(s.prog, m.couleur)}</div>
      <div class="muted small">${plural(s.seances, "séance")} · ${plural(s.nq, "QCM", "QCM")} · ${plural(s.nf, "carte")}</div>
      <div class="bar"><i style="width:${s.prog}%;background:${m.couleur}"></i></div>
      <div class="tiny muted">Lu ${s.read}/${s.seances} · QCM ${s.right}/${s.nq} maîtrisés · cartes ${s.mastered}/${s.nf}</div></a>`;
  }).join("");
  const up = nextEvents(5).map((e) => `<a class="item" href="#/cal"><span class="badge" style="--acc:${M(e.matiere).couleur};background:color-mix(in srgb,${M(e.matiere).couleur} 15%,var(--surface));color:${M(e.matiere).couleur}">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(M(e.matiere).court)}</b> — ${esc(e.titre)}<div class="tiny muted">${esc(e.poids)} · ${cd(e)}${e.statut && e.poids !== "à confirmer" ? " · <span class='chip wa'>date provisoire</span>" : ""}</div></div></a>`).join("");
  return {
    html: `${hero}
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
function subjects() {
  return { html: `<h1>Matières</h1><div class="grid g2" style="margin-top:14px">${D.matieres.map((m) => { const s = stats(m.id); return `<a class="card subj" href="#/m/${m.id}" style="--c:${m.couleur};--acc:${m.couleur}"><div class="row nowrap"><div><h3>${esc(m.nom)}</h3><div class="muted small">${esc(m.desc)}</div></div><div class="sp"></div>${ring(s.prog, m.couleur)}</div><div class="tiny muted">${plural(s.seances, "séance")} · ${plural(s.nq, "QCM", "QCM")} · ${plural(s.nf, "carte")} · ${plural(s.ne, "exercice")}</div></a>`; }).join("")}</div>` };
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
      <div class="card"><h3 style="margin-top:0">${icon("clock")} Éval blanche</h3><p class="small muted">Sujet chronométré de ${m.eval.n} questions en ${m.eval.minutes} min, noté sur 20.</p><a class="btn pri" href="#/eval?m=${mid}">Passer l'éval</a></div>
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
      <a class="btn sm" href="${m.pdfCC}" download>${icon("dl")}Fiche CC (PDF)</a></div>
      <h3>Calculateur de note</h3>${notesCard(mid)}`;
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
  const html = await fragment(s);
  const c = C(mid), i = c.seances.findIndex((x) => x.id === sid);
  const prev = c.seances[i - 1], next = c.seances[i + 1];
  const nq = c.qcm.filter((q) => q.seance === sid).length, nf = c.flashcards.filter((f) => f.seance === sid).length, ne = c.exercices.filter((e) => e.seance === sid).length;
  const rd = state.read[sKey(mid, sid)]?.v;
  return {
    html: `<div class="crumbs"><a href="#/m">Matières</a> › <a href="#/m/${mid}">${esc(m.court)}</a> › ${s.type} ${s.numero}</div>
    <div class="row"><div><h1 style="margin:0">${s.titre}</h1><div class="muted">${fmtLong(s.date)} · ${TYPES[s.type]}</div></div><div class="sp"></div>
      <a class="btn sm" href="${s.pdf}" download>${icon("dl")}PDF</a><button class="btn sm ${rd ? "" : "pri"}" data-a="read" data-k="${sKey(mid, sid)}">${rd ? "✓ Lu" : "Marquer comme lu"}</button></div>
    <p class="muted">${s.resume}</p>
    <div class="doc-layout"><article class="prose" id="doc">${html}</article><aside class="toc" id="toc"></aside></div>
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
  ${L.map((e) => { const st = state.exos[e.id]?.v; const s = seanceOf(mid, e.seance); return `<div class="card" style="margin:14px 0" id="${e.id}"><div class="row"><span class="chip gr">${s.type} ${s.numero}</span><span class="chip" title="difficulté">${"★".repeat(e.difficulte)}${"·".repeat(3 - e.difficulte)}</span><div class="sp"></div>${st === "ok" ? '<span class="chip ok">réussi</span>' : st === "redo" ? '<span class="chip wa">à refaire</span>' : ""}</div><h3 style="margin:.6em 0 .3em">${e.titre}</h3><div class="prose">${e.enonce}</div>
    ${e.indice ? `<details><summary>Indice</summary><div class="prose">${e.indice}</div></details>` : ""}
    <details><summary>Voir le corrigé</summary><div class="prose">${e.corrige}</div><div class="row" style="margin-top:12px"><span class="small muted">Alors ?</span><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="ok">Je l'avais</button><button class="btn sm" data-a="exo" data-id="${e.id}" data-v="redo">À refaire</button></div></details></div>`; }).join("") || '<div class="empty">Aucun exercice pour cette séance.</div>'}`;
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
function evalSetup(q) {
  const mid = q.m && M(q.m) ? q.m : "algo1";
  const m = M(mid), c = C(mid);
  const last = Object.values(state.evals).sort((a, b) => b.ts - a.ts).slice(0, 6);
  return {
    html: `<h1>Éval blanche</h1><p class="muted">Un sujet chronométré tiré de tout ton cours, sans correction avant la fin, noté sur 20 — pour te mettre en conditions.</p>
    <form class="card" id="ef" style="display:flex;flex-direction:column;gap:16px">
      <div class="row"><div class="field"><label for="em">Matière</label><select id="em" name="m">${D.matieres.map((x) => `<option value="${x.id}" ${x.id === mid ? "selected" : ""}>${esc(x.nom)}</option>`).join("")}</select></div>
      <div class="field" style="max-width:140px"><label for="en">Questions</label><input id="en" type="number" name="n" min="5" max="120" value="${Math.min(m.eval.n, c.qcm.length)}"></div>
      <div class="field" style="max-width:140px"><label for="et">Durée (min)</label><input id="et" type="number" name="t" min="5" max="180" value="${m.eval.minutes}"></div></div>
      <div class="field"><label>Séances incluses</label><div id="esc">${seanceChips([mid], new Set(c.seances.map((s) => sKey(mid, s.id))))}</div></div>
      <div class="row"><button class="btn pri" type="submit">Démarrer l'épreuve</button><span class="muted small" id="epc"></span></div></form>
    ${last.length ? `<h3>Historique</h3><div class="card list">${last.map((e) => `<div class="item"><span class="badge">${fmt1(e.score20)}</span><div class="sp"><b>${esc(M(e.mid)?.court || e.mid)}</b> — ${fmt1(e.score20)}/20 (${e.ok}/${e.n})<div class="tiny muted">${new Date(e.ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</div></div></div>`).join("")}</div>` : ""}`,
    after: (el) => {
      const f = $("#ef", el);
      const sel = () => new Set(new FormData(f).getAll("s"));
      const upd = () => { const cnt = poolQ({ mids: [f.m.value], sids: sel(), niv: new Set([1, 2, 3]) }).length; $("#epc", el).textContent = `${cnt} questions disponibles`; };
      f.m.addEventListener("change", () => { const x = M(f.m.value); f.n.value = Math.min(x.eval.n, C(x.id).qcm.length); f.t.value = x.eval.minutes; $("#esc", el).innerHTML = seanceChips([x.id], new Set(C(x.id).seances.map((s) => sKey(x.id, s.id)))); upd(); });
      f.addEventListener("change", upd);
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const pool = poolQ({ mids: [f.m.value], sids: sel(), niv: new Set([1, 2, 3]) });
        if (pool.length < 3) return toast("Sélectionne au moins une séance.");
        const n = Math.min(+f.n.value || 20, pool.length);
        startQuiz(balanced(pool, n), { mode: "exam", timed: true, minutes: +f.t.value || 30, title: "Éval blanche — " + M(f.m.value).court, mid: f.m.value, isEval: true });
      });
      upd();
    },
  };
}
function startQuiz(pool, opt) {
  Q = {
    ...opt, i: 0, done: false, start: Date.now(), deadline: opt.timed ? Date.now() + opt.minutes * 60000 : 0,
    qs: pool.map((q) => ({ q, order: isRef(q) ? q.choix.map((_, k) => k) : shuffle(q.choix.map((_, k) => k)), ans: new Set(), checked: false, flag: false })),
  };
  location.hash = opt.isEval ? "#/eval/run" : "#/qcm/run";
  if (location.hash.endsWith("/run")) rerender();
}
const okQ = (x) => x.ans.size === x.q.rep.length && x.q.rep.every((r) => x.ans.has(r));
function recordQ(x) {
  const cur = state.qcm[x.q.id] || { n: 0, ok: 0, last: false };
  const good = okQ(x);
  setEntry("qcm", x.q.id, { n: cur.n + 1, ok: cur.ok + (good ? 1 : 0), last: good });
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
    html: `<div class="qhead"><div class="crumbs" style="margin:0"><a href="#/${Q.isEval ? "eval" : "qcm"}">← Quitter</a></div><div class="sp"></div>${Q.timed ? `<span class="timer" id="tm" aria-live="off">--:--</span>` : ""}<span class="chip gr">${Q.i + 1} / ${n}</span></div>
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
  if (Q.isEval) {
    const by = {}; Q.qs.forEach((x) => { const s = by[x.q.seance] || (by[x.q.seance] = [0, 0]); s[1]++; if (okQ(x)) s[0]++; });
    const id = "ev" + Q.start;
    setEntry("evals", id, { id, mid: Q.mid, n, ok, score20: (ok / n) * 20, dur: Math.round((Q.end - Q.start) / 1000), seances: by });
    bump(3);
  }
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
    <div class="row"><button class="btn pri" data-a="retry" ${wrong.length ? "" : "disabled"}>Refaire mes ${wrong.length} erreurs</button><a class="btn" href="#/${Q.isEval ? "eval" : "qcm"}">Nouvelle session</a><a class="btn ghost" href="#/">Accueil</a></div>
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
const edtOf = (iso) => D.edt.events.filter((e) => e.d === iso).sort((a, b) => (a.s || "").localeCompare(b.s || ""));
const edtLabel = (e) => (e.t === "Férié" ? "Jour férié" : e.t === "Fermeture" ? "Université fermée" : e.t);
const edtColor = (e) => (e.m && M(e.m) ? M(e.m).couleur : "var(--muted)");
const edtName = (e) => (e.m && M(e.m) ? M(e.m).court : e.t);
const edtMeta = (e) => [e.r, e.p, e.g].filter(Boolean).map(esc).join(" · ");
const edtState = (e, now) => (e.e ? (pd(e.d, e.e) <= now ? "past" : pd(e.d, e.s) <= now ? "live" : "") : "");
function edtCard(e, now) {
  const st = edtState(e, now), cc = e.t === "CC";
  return `<div class="edt-ev ${cc ? "cc " : ""}${st}" style="--c:${edtColor(e)}">
    <div class="edt-h"><b>${e.s}–${e.e}</b><span class="chip ${cc ? "wa" : "gr"}">${esc(e.t)}</span>${st === "live" ? '<span class="chip ok">en cours</span>' : ""}</div>
    <div class="edt-t">${esc(edtName(e))}</div>
    ${edtMeta(e) ? `<div class="tiny muted">${edtMeta(e)}</div>` : ""}${e.n ? `<div class="tiny edt-n">${esc(e.n)}</div>` : ""}</div>`;
}
const edtRel = (iso) => { const d = daysUntil(iso); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : fmtLong(iso); };
function edtRow(e, now, rel) {
  const c = edtColor(e), st = edtState(e, now);
  return `<a class="item edt-row ${st}" href="#/edt"><span class="badge" style="background:color-mix(in srgb,${c} 15%,var(--surface));color:${c}">${e.s}</span><div class="sp"><b>${esc(edtName(e))}</b> <span class="chip ${e.t === "CC" ? "wa" : "gr"}">${esc(e.t)}</span>${st === "live" ? ' <span class="chip ok">en cours</span>' : ""}<div class="tiny muted">${rel ? edtRel(e.d) + " · " : ""}${e.s}–${e.e}${edtMeta(e) ? " · " + edtMeta(e) : ""}</div></div></a>`;
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
function edt() {
  if (!D.edt.events.length) return { html: `<h1>Emploi du temps</h1><div class="empty">Aucun emploi du temps chargé (data/edt.json).</div>` };
  if (!edtWeek) edtWeek = mondayOf(new Date());
  const now = new Date(), today = todayKey();
  const days = [...Array(7)].map((_, i) => { const d = new Date(edtWeek); d.setDate(d.getDate() + i); return d; });
  const shown = days.slice(5).some((d) => edtOf(todayKey(d)).length) ? days : days.slice(0, 5);
  const fd = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  const fs = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const cols = shown.map((d) => {
    const iso = todayKey(d), evs = edtOf(iso), all = evs.filter((e) => e.allday), tm = evs.filter((e) => !e.allday);
    return `<section class="edt-d${iso === today ? " today" : ""}${evs.length ? "" : " vide"}"><h3>${fd.format(d)}</h3>${all.map((e) => `<span class="chip gr">${esc(edtLabel(e))}</span>`).join("")}${tm.map((e) => edtCard(e, now)).join("") || (all.length ? "" : '<div class="tiny muted">Rien de prévu</div>')}</section>`;
  }).join("");
  const wkEv = shown.flatMap((d) => edtOf(todayKey(d))).filter((e) => !e.allday);
  const hrs = wkEv.reduce((a, e) => a + (pd(e.d, e.e) - pd(e.d, e.s)) / 36e5, 0);
  return {
    html: `<h1>Emploi du temps</h1>
    <div class="row" style="margin:6px 0 14px"><button class="btn sm" data-a="edtprev" aria-label="Semaine précédente">${icon("back")}</button><b style="min-width:170px;text-align:center">${fs.format(shown[0])} – ${fs.format(shown[shown.length - 1])}</b><button class="btn sm" data-a="edtnext" aria-label="Semaine suivante">${icon("arrow")}</button><button class="btn sm ghost" data-a="edttoday">Cette semaine</button><div class="sp"></div><button class="btn sm" data-a="edtics">${icon("dl")}Export .ics</button></div>
    <div class="tiny muted" style="margin:-6px 0 12px">${plural(wkEv.length, "créneau", "créneaux")} · ${String(Math.round(hrs * 10) / 10).replace(".", ",")} h dans la semaine · ${Object.entries(Object.fromEntries(D.matieres.map((m) => [m.id, m]))).filter(([id]) => wkEv.some((e) => e.m === id)).map(([, m]) => `<span class="chip" style="--acc:${m.couleur}"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.court)}</span>`).join(" ")}</div>
    <div class="edt" style="--n:${shown.length}">${cols}</div>
    <p class="tiny muted" style="margin-top:14px">Source : emploi du temps UPS (${esc(D.edt.source || "")}). Les horaires peuvent changer : vérifie sur l'ENT en cas de doute.</p>`,
  };
}
function edtIcs() {
  const pad = (n) => String(n).padStart(2, "0"), f = (d, hm) => d.replace(/-/g, "") + "T" + hm.replace(":", "") + "00";
  const esc2 = (s) => String(s || "").replace(/([,;\\])/g, "\\$1");
  const ev = D.edt.events.filter((e) => !e.allday).map((e, i) => ["BEGIN:VEVENT", `UID:edt${i}-${e.d}-${e.s}@revisions-l1s1`, `DTSTAMP:${f(todayKey(), "0000")}Z`, `DTSTART;TZID=Europe/Paris:${f(e.d, e.s)}`, `DTEND;TZID=Europe/Paris:${f(e.d, e.e)}`, `SUMMARY:${esc2(edtName(e) + " — " + e.t)}`, `LOCATION:${esc2(e.r)}`, `DESCRIPTION:${esc2([e.p, e.g, e.n].filter(Boolean).join(" · "))}`, "END:VEVENT"].join("\r\n"));
  download("emploi-du-temps-L1S1.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Revisions L1 S1//FR", "X-WR-TIMEZONE:Europe/Paris", ...ev, "END:VCALENDAR"].join("\r\n"), "text/calendar");
}

// ───────────────────────── Calendrier ─────────────────────────
let calMonth = null, calFilter = new Set(IDS), calSeances = false;
function calendar(q) {
  if (!calMonth) { const t = new Date(); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); const has = D.cal.evenements.some((e) => { const d = parseDay(e.date); return d.getFullYear() === calMonth.getFullYear() && d.getMonth() === calMonth.getMonth(); }); const nx = nextEvents(1)[0]; if (!has && nx) { const d = parseDay(nx.date); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); } }
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  const first = new Date(y, mo, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const evs = D.cal.evenements.filter((e) => calFilter.has(e.matiere));
  const ses = calSeances ? IDS.filter((id) => calFilter.has(id)).flatMap((id) => C(id).seances.map((s) => ({ ...s, mid: id }))) : [];
  const today = todayKey();
  let cells = "";
  for (let i = 0; i < off; i++) cells += `<div class="d out"></div>`;
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const e = evs.filter((x) => x.date === iso), s = ses.filter((x) => x.date === iso);
    cells += `<div class="d ${iso === today ? "today" : ""}"><b>${d}</b>${e.map((x) => `<button class="ev" style="--c:${M(x.matiere).couleur}" data-a="evt" data-id="${x.id}" title="${esc(M(x.matiere).court + " — " + x.titre)}">${esc(M(x.matiere).court)} · ${esc(x.titre.split(" — ")[0])}</button>`).join("")}${s.map((x) => `<a class="ev se" style="--c:${M(x.mid).couleur}" href="#/c/${x.mid}/${x.id}">${esc(M(x.mid).court)} ${x.type}${x.numero}</a>`).join("")}</div>`;
  }
  const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(calMonth);
  const upcoming = D.cal.evenements.filter((e) => calFilter.has(e.matiere) && daysUntil(e.date) >= 0);
  const past = D.cal.evenements.filter((e) => calFilter.has(e.matiere) && daysUntil(e.date) < 0);
  const line = (e) => `<div class="item"><span class="badge" style="background:color-mix(in srgb,${M(e.matiere).couleur} 15%,var(--surface));color:${M(e.matiere).couleur};font-size:.66rem">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(M(e.matiere).court)}</b> — ${esc(e.titre)} <span class="chip gr">${esc(e.poids)}</span>${e.type === "2e" ? ' <span class="chip wa">2e chance</span>' : ""}${e.statut && e.poids !== "à confirmer" ? ` <span class="chip wa">${e.statut === "provisoire" ? "date provisoire" : "à confirmer"}</span>` : ""}<div class="tiny muted">${fmtLong(e.date)} · ${esc(e.detail)}</div></div><span class="count small muted">${daysUntil(e.date) >= 0 ? "J-" + daysUntil(e.date) : "passé"}</span></div>`;
  return {
    html: `<h1>Calendrier</h1><div class="row" style="margin:6px 0 14px"><button class="btn sm" data-a="calprev" aria-label="Mois précédent">${icon("back")}</button><b style="min-width:150px;text-align:center;text-transform:capitalize">${monthName}</b><button class="btn sm" data-a="calnext" aria-label="Mois suivant">${icon("arrow")}</button><button class="btn sm ghost" data-a="caltoday">Aujourd'hui</button><div class="sp"></div><label class="row small"><input type="checkbox" data-a="calses" ${calSeances ? "checked" : ""}> Afficher les séances</label><button class="btn sm" data-a="ics">${icon("dl")}Export .ics</button></div>
    <div class="checks" style="margin-bottom:12px">${D.matieres.map((m) => `<label style="--acc:${m.couleur}"><input type="checkbox" data-a="calfilter" value="${m.id}" ${calFilter.has(m.id) ? "checked" : ""}><span><i class="dot" style="--c:${m.couleur};display:inline-block"></i> ${esc(m.court)}</span></label>`).join("")}</div>
    <div class="cal">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells}</div>
    <div id="evd"></div>
    <h2>À venir</h2><div class="card list">${upcoming.map(line).join("") || '<div class="empty">Rien à venir.</div>'}</div>
    ${D.cal.remarques.length ? `<div class="warn prose" style="margin-top:14px;padding:12px 16px"><b>À compléter —</b><ul>${D.cal.remarques.map((r) => `<li><b>${esc(M(r.matiere).court)}</b> : ${esc(r.texte)}</li>`).join("")}</ul></div>` : ""}
    ${past.length ? `<details><summary>Épreuves passées (${past.length})</summary><div class="list">${past.map(line).join("")}</div></details>` : ""}`,
  };
}
function icsExport() {
  const pad = (n) => String(n).padStart(2, "0");
  const ev = D.cal.evenements.map((e) => { const d = parseDay(e.date), n = new Date(d.getTime() + 864e5); const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`; return ["BEGIN:VEVENT", `UID:${e.id}@revisions-l1s1`, `DTSTAMP:${f(new Date())}T000000Z`, `DTSTART;VALUE=DATE:${f(d)}`, `DTEND;VALUE=DATE:${f(n)}`, `SUMMARY:${M(e.matiere).court} — ${e.titre} (${e.poids})`, `DESCRIPTION:${e.detail.replace(/[,;]/g, " ")}`, "END:VEVENT"].join("\r\n"); });
  download("calendrier-CC-S1.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Revisions L1 S1//FR", ...ev, "END:VCALENDAR"].join("\r\n"), "text/calendar");
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
    ${D.matieres.map((m) => `<h2 style="display:flex;gap:10px;align-items:center"><i class="dot" style="--c:${m.couleur}"></i>${esc(m.nom)}</h2>${notesCard(m.id)}`).join("")}`, after: bindNotes };
}

// ───────────────────────── Recherche ─────────────────────────
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
async function buildIndex() {
  if (D.idx) return D.idx;
  const out = [];
  await Promise.all(IDS.flatMap((mid) => C(mid).seances.map(async (s) => { try { const h = await fragment(s); const t = document.createElement("div"); t.innerHTML = h; out.push({ kind: "Cours", mid, sid: s.id, title: `${s.type} ${s.numero} — ${s.titre}`, text: t.textContent.replace(/\s+/g, " ") }); } catch (e) {} })));
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
function account() {
  const st = { ok: "synchronisé", sync: "synchronisation…", error: "erreur", off: "connecté" }[sync.status] || "";
  const login = !sync.configured
    ? `<div class="note prose" style="padding:12px 16px"><b>Mode local —</b> la progression est enregistrée dans ce navigateur uniquement. Pour la retrouver sur ton téléphone et ton ordinateur, configure Supabase (voir le fichier <code>README.md</code>, étape 2), puis renseigne <code>js/config.js</code>.</div>`
    : sync.user
      ? `<p>Connecté en tant que <b>${esc(sync.user.email)}</b> · <span class="chip ${sync.status === "error" ? "ko" : "ok"}">${st}</span></p>${sync.error ? `<p class="small" style="color:var(--ko)">${esc(sync.error)}</p>` : ""}<div class="row"><button class="btn" data-a="pull">Récupérer depuis le cloud</button><button class="btn" data-a="push">Envoyer maintenant</button><button class="btn ghost" data-a="logout">Se déconnecter</button></div>${sync.last ? `<p class="tiny muted">Dernière synchro : ${new Date(sync.last).toLocaleTimeString("fr-FR")}</p>` : ""}`
      : `<form id="lf" class="grid" style="gap:10px;max-width:380px"><div class="field"><label for="le">Email</label><input id="le" type="email" name="email" required autocomplete="email"></div><div class="field"><label for="lp">Mot de passe</label><input id="lp" type="password" name="pw" minlength="6" autocomplete="current-password"></div><div class="row"><button class="btn pri" data-a="login" type="submit">Se connecter</button><button class="btn" type="button" data-a="signup">Créer le compte</button><button class="btn ghost" type="button" data-a="magic">Lien magique</button></div><div class="small muted" id="lmsg"></div></form>`;
  return { html: `<h1>Compte &amp; données</h1>
    <div class="card"><h3 style="margin-top:0">Synchronisation</h3>${login}</div>
    <div class="card" style="margin-top:14px"><h3 style="margin-top:0">Apparence</h3><div class="field" style="max-width:220px"><label for="th">Thème</label><select id="th" data-a="theme"><option value="auto" ${state.prefs.theme === "auto" ? "selected" : ""}>Automatique</option><option value="light" ${state.prefs.theme === "light" ? "selected" : ""}>Clair</option><option value="dark" ${state.prefs.theme === "dark" ? "selected" : ""}>Sombre</option></select></div></div>
    <div class="card" style="margin-top:14px"><h3 style="margin-top:0">Mes données</h3><p class="small muted">Sauvegarde ou restaure ta progression (QCM, cartes, notes) dans un fichier.</p><div class="row"><button class="btn" data-a="export">${icon("dl")}Exporter</button><label class="btn">Importer<input type="file" accept="application/json" data-a="import" class="sr"></label><button class="btn ghost" data-a="reset" style="color:var(--ko)">Tout effacer</button></div></div>`,
    after: (el) => {
      const f = $("#lf", el);
      if (f) f.addEventListener("submit", async (e) => { e.preventDefault(); await doAuth("login", f); });
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
  if (["calfilter", "calses", "import"].includes(a)) return; // gérés par change
  if (a === "read") { const k = t.dataset.k, cur = state.read[k]?.v; setEntry("read", k, { v: !cur }); if (!cur) bump(3); commit(); const [mid, sid] = k.split("/"); const s = seanceOf(mid, sid); t.textContent = !cur ? "✓ Lu" : "Marquer comme lu"; t.classList.toggle("pri", cur); toast(!cur ? "Marqué comme lu" : "Marqué comme non lu"); }
  else if (a === "choose") { const x = Q.qs[Q.i]; if (x.checked) return; const i = +t.dataset.i; if (x.q.type === "multiple") { x.ans.has(i) ? x.ans.delete(i) : x.ans.add(i); } else { x.ans = new Set([i]); } rerenderKeep(); }
  else if (a === "check") { const x = Q.qs[Q.i]; if (!x.ans.size) return; x.checked = true; recordQ(x); commit(); rerenderKeep(); }
  else if (a === "next") { if (Q.i < Q.qs.length - 1) { Q.i++; rerender(); } }
  else if (a === "prev") { if (Q.i > 0) { Q.i--; rerender(); } }
  else if (a === "goto") { Q.i = +t.dataset.i; rerender(); }
  else if (a === "flag") { Q.qs[Q.i].flag = !Q.qs[Q.i].flag; rerenderKeep(); }
  else if (a === "finish") { const un = Q.qs.filter((x) => !x.ans.size).length; if (Q.mode === "exam" && un && !confirm(`${un} question(s) sans réponse. Terminer quand même ?`)) return; finishQuiz(false); }
  else if (a === "retry") { const w = Q.qs.filter((x) => !okQ(x)).map((x) => x.q); startQuiz(shuffle(w), { mode: "train", title: "Mes erreurs", mid: null }); }
  else if (a === "flip") { FC.flip = !FC.flip; rerender(); }
  else if (a === "rate") rate(t.dataset.r);
  else if (a === "exo") { setEntry("exos", t.dataset.id, { v: t.dataset.v }); bump(2); commit(); toast(t.dataset.v === "ok" ? "Bien joué" : "Noté à refaire"); }
  else if (a === "calprev") { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); rerender(); }
  else if (a === "calnext") { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); rerender(); }
  else if (a === "caltoday") { calMonth = null; rerender(); }
  else if (a === "ics") icsExport();
  else if (a === "edtics") edtIcs();
  else if (a === "edtprev") { edtWeek.setDate(edtWeek.getDate() - 7); rerender(); }
  else if (a === "edtnext") { edtWeek.setDate(edtWeek.getDate() + 7); rerender(); }
  else if (a === "edttoday") { edtWeek = null; rerender(); }
  else if (a === "evt") { const ev = D.cal.evenements.find((x) => x.id === t.dataset.id); $("#evd").innerHTML = `<div class="card" style="margin-top:12px;border-left:4px solid ${M(ev.matiere).couleur}"><b>${esc(M(ev.matiere).nom)} — ${esc(ev.titre)}</b><div class="muted small">${fmtLong(ev.date)} · poids ${esc(ev.poids)} · ${cd(ev)}</div><p class="small">${esc(ev.detail)}</p><div class="row"><a class="btn sm pri" href="#/eval?m=${ev.matiere}">Éval blanche</a><a class="btn sm" href="#/qcm?m=${ev.matiere}">QCM</a><a class="btn sm" href="#/m/${ev.matiere}/cc">Fiche CC</a></div></div>`; }
  else if (a === "login") { /* submit géré */ }
  else if (a === "signup") doAuth("signup", $("#lf"));
  else if (a === "magic") doAuth("magic", $("#lf"));
  else if (a === "logout") { await signOut(); rerender(); }
  else if (a === "pull") { await pull(); rerender(); toast("Données récupérées"); }
  else if (a === "push") { await push(); rerender(); toast("Données envoyées"); }
  else if (a === "export") download("progression-l1s1.json", exportJSON(), "application/json");
  else if (a === "reset") { if (confirm("Effacer toute ta progression sur cet appareil ? (le cloud n'est pas touché tant que tu ne synchronises pas)")) { resetAll(); toast("Progression effacée"); rerender(); } }
});
document.addEventListener("change", (e) => {
  const t = e.target, a = t.dataset?.a;
  if (a === "calfilter") { t.checked ? calFilter.add(t.value) : calFilter.delete(t.value); rerender(); }
  else if (a === "calses") { calSeances = t.checked; rerender(); }
  else if (a === "theme") { state.prefs.theme = t.value; state.prefs.ts = Date.now(); applyTheme(); commit(); }
  else if (a === "exfilter") { location.hash = `#/m/${t.dataset.m}/exos` + (t.value ? "?s=" + t.value : ""); }
  else if (a === "import") { const f = t.files[0]; if (!f) return; f.text().then((s) => { try { importJSON(s); toast("Progression importée"); rerender(); } catch (err) { toast("Fichier invalide"); } }); }
});
function rerenderKeep() { const y = window.scrollY; rerender().then?.(() => 0); requestAnimationFrame(() => window.scrollTo(0, y)); }

// ───────────────────────── Démarrage ─────────────────────────
async function boot() {
  applyTheme();
  try { await loadData(); } catch (e) { $("#app").innerHTML = `<div class="empty" style="padding:3rem"><h2>Impossible de charger les données</h2><p>${esc(e.message)}</p><p class="small">Ouvre le site via un serveur web (GitHub Pages, ou <code>python3 -m http.server</code>), pas en double-cliquant sur index.html.</p></div>`; return; }
  shell();
  let sig = "";
  onChange(() => {
    syncLabel();
    const s = (sync.user ? sync.user.id : "-") + sync.status + (sync.error || "");
    if (s !== sig) { sig = s; const p0 = parse().parts[0] || ""; if (["", "compte"].includes(p0) && !Q?.qs?.length) rerender(); else if (p0 === "compte") rerender(); }
  });
  window.addEventListener("hashchange", () => route());
  await route();
  syncLabel();
  initSync().then(() => { syncLabel(); if (parse().parts[0] === "compte" || parse().parts.length === 0) rerender(); });
}
boot();
window.__app = { D, state, route };
