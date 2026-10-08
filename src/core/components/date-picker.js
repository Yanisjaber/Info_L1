import { icon } from "./icons.js";
import { todayKey } from "../services/store.js";
import { $, $$ } from "../utils/dom.js";
import { fmtDate, parseDay } from "../utils/format.js";

// Sélecteur de date "maison" (remplace le widget natif du navigateur, trop éloigné du reste de
// l'appli) : un bouton qui affiche la date choisie, un `<input type="hidden">` qui porte la vraie
// valeur pour le formulaire, et une pastille calendrier (mêmes classes `.cal`/`.d`/`.dh` que les
// autres calendriers de l'appli) qui s'ouvre en dessous. Générique : plusieurs instances peuvent
// coexister sur une même page (`data-datepicker` + `wireDatePickers` les câble toutes).
export function datePickerHtml(name, value) {
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

export function wireDatePickers(el) {
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
