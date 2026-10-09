import { toast } from "./toast.js";

// Calendrier et heure de toute l'appli : la bibliothèque Flatpickr (vendor/flatpickr, chargée dans index.html),
// habillée aux couleurs du thème (voir « Flatpickr » dans style.css). Rien à câbler à la main : `initDatePickers()`
// surveille la page et transforme chaque `<input type="date">` et `<input type="time">` qui apparaît (pop-up, page
// redessinée…). La valeur envoyée au formulaire reste « AAAA-MM-JJ » et « HH:MM », comme avec les champs natifs.
const OPTS = {
  date: { dateFormat: "Y-m-d", altInput: true, altFormat: "l j F Y", disableMobile: true },
  time: { dateFormat: "H:i", enableTime: true, noCalendar: true, time_24hr: true, minuteIncrement: 5, allowInput: true, disableMobile: true },
};

function upgrade(input) {
  if (input._flatpickr || !window.flatpickr) return;
  const kind = input.type;
  const fp = window.flatpickr(input, { ...OPTS[kind], locale: window.flatpickr.l10ns.fr, defaultDate: input.value || null, static: false });
  // Le champ visible reprend le « required » du vrai champ (devenu caché) pour que le formulaire refuse un champ vide.
  // (le champ visible est en lecture seule : le navigateur ne le contrôle plus, d'où la vérification à l'envoi plus bas)
  if (fp.altInput && input.required) { fp.altInput.required = true; fp.altInput.dataset.req = "1"; input.required = false; }
  if (fp.altInput) fp.altInput.classList.add("fp-input");
}

const scan = (root) => root.querySelectorAll?.('input[type="date"],input[type="time"]').forEach(upgrade);

export function initDatePickers() {
  scan(document);
  // Un champ date/heure obligatoire resté vide bloque l'envoi du formulaire (avant tout autre gestionnaire).
  document.addEventListener("submit", (e) => {
    const vide = [...e.target.querySelectorAll("input.fp-input[data-req]")].find((i) => !i.value);
    if (!vide) return;
    e.preventDefault(); e.stopImmediatePropagation();
    vide.focus(); toast("Choisis une date");
  }, true);
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches?.('input[type="date"],input[type="time"]')) upgrade(n); scan(n); } }))).observe(document.body, { childList: true, subtree: true });
}

// Champ date en ligne (largeur fixe, à côté d'un autre champ) : utilisé par la liste de tâches.
export const datePickerHtml = (name, value) => `<input type="date" class="fp-inline" name="${name}" value="${value || ""}" required>`;

// Change la date d'un champ déjà transformé (le texte affiché suit) ; `locked` : la date vient d'ailleurs, on ne peut plus l'ouvrir.
export function setDateValue(input, iso, locked = false) {
  const fp = input._flatpickr;
  if (!fp) { input.value = iso || ""; return; }
  if (iso) fp.setDate(iso, true); else fp.clear();
  fp.set("clickOpens", !locked);
  fp.altInput?.classList.toggle("fp-locked", locked);
}
