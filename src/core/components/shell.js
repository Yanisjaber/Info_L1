import { icon } from "./icons.js";
import { M, activeMatieres, archivedMatieres, periodeLabel } from "../services/app-data.js";
import { sync } from "../services/store.js";
import { $, $$, esc } from "../utils/dom.js";

// Logo « Révise » (livre ouvert + signet)
const BRAND_LOGO = `<svg viewBox="0 0 256 256" aria-hidden="true"><rect width="256" height="256" rx="58" fill="#1F3A5F"/><path d="M128 88C106 68 74 66 46 76V190C74 180 106 184 128 204Z" fill="#fff"/><path d="M128 88C150 68 182 66 210 76V190C182 180 150 184 128 204Z" fill="#fff" fill-opacity=".86"/><path d="M150 70H178V130L164 118L150 130Z" fill="#6FD6B5"/></svg>`;

export function shell() {
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

export function setNav(path) {
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

export function syncLabel() {
  const el = $("#syncl"); if (!el) return;
  el.textContent = !sync.configured ? "Compte (local)" : sync.user ? { ok: "Compte", sync: "Synchro…", error: "Erreur synchro", off: "Connecté" }[sync.status] || "Connecté" : "Se connecter";
}
