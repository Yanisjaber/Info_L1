// Dispatch central des évènements : les écrans posent un attribut data-a="nom" sur leurs boutons /
// champs, et chaque fonctionnalité déclare dans son fichier *.actions.js quoi faire pour ce nom.
// Un seul écouteur par type d'évènement sur le document (pas un par bouton).
const click = new Map();
const change = new Map();
const input = new Map();
const rules = [];

// Actions gérées par l'évènement "change" (pas par le clic) : on ne les traite pas au clic.
const CHANGE_ONLY = ["calfilter", "calses", "import", "icsfile"];

export function initActions(list) {
  for (const a of list) {
    for (const [k, fn] of Object.entries(a.click || {})) click.set(k, fn);
    for (const [k, fn] of Object.entries(a.change || {})) change.set(k, fn);
    for (const [k, fn] of Object.entries(a.input || {})) input.set(k, fn);
    for (const r of a.rules || []) rules.push(r);
  }
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-a]"); if (!t || t.tagName === "SELECT" || (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "file")) return;
  const a = t.dataset.a;
  if (CHANGE_ONLY.includes(a)) return;
  const fn = click.get(a);
  if (fn) await fn(t, e);
});

document.addEventListener("input", (e) => {
  const fn = input.get(e.target.dataset?.a);
  if (fn) fn(e.target, e);
});

document.addEventListener("change", (e) => {
  const t = e.target, a = t.dataset?.a;
  for (const r of rules) if (r.match(t, a)) { r.run(t, e, a); return; }
  const fn = change.get(a);
  if (fn) fn(t, e);
});
