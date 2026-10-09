// Éditeur du calcul de la note d'une matière (page Notes & CC, et formulaire « matière » dans Compte).
// Produit la configuration lue par features/notes/grades.js (colonne `grading`).
import { $, $$, esc } from "../../core/utils/dom.js";
import { shareName, shareText } from "./grades.js";

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");

// Une ligne par épreuve : nom · poids · note sur · case « 2e chance » · retirer.
// La 2e chance est la ligne dont la case est cochée (une seule) : à 0 % elle est facultative,
// avec un pourcentage elle compte aussi dans la note.
function rowHtml(it, second = false) {
  const n = !second && it.parts && it.parts.length > 1 ? it.parts.length : 1;
  return `<div class="gr-row" data-item="${esc(JSON.stringify(it))}" style="margin-bottom:8px">
    <button type="button" class="gr-grip" aria-label="Déplacer l'épreuve : glisser, ou flèches haut et bas" title="Glisser pour déplacer">⋮⋮</button>
    <div class="gr-main">
    <div class="gr-grid">
      <input type="text" class="gr-label" value="${esc(it.label || "")}" placeholder="ex. CC1 — QCM" aria-label="Nom de l'épreuve">
      <input type="number" class="gr-w" min="0" step="any" value="${it.weight ?? ""}" placeholder="%" aria-label="Poids de l'épreuve, en pourcentage">
      <input type="number" class="gr-max" min="1" step="any" value="${it.max || 20}" aria-label="Note sur">
      <label class="gr-sec-toggle" title="Épreuve de rattrapage : elle remplace une note plus faible si elle est meilleure"><input type="checkbox" class="gr-sec" ${second ? "checked" : ""}>2e chance</label>
      <button type="button" class="btn sm ghost" data-gr="del" aria-label="Retirer cette épreuve">✕</button>
    </div>
    <div class="gr-adv tiny muted" ${n > 1 ? "" : "hidden"} style="margin:6px 0 0 2px">Cette épreuve est la moyenne de <input type="number" class="gr-n" min="1" max="8" step="1" value="${n}" style="width:64px;display:inline-block;padding:4px 8px" aria-label="Nombre de notes dont on fait la moyenne"> notes</div>
    </div>
  </div>`;
}

// `bare` : sans barre de titre cliquable (la page qui l'utilise l'ouvre et le ferme elle-même).
export function gradingEditorHtml(m, { open = false, bare = false, title = "Calcul de la note (page Notes &amp; CC)" } = {}) {
  const g = m && m.grading, items = (g && g.items) || [], sec = (g && g.second) || null;
  // Les lignes suivent l'ordre enregistré, la 2e chance comprise (sa place est `second.pos`, à la fin par défaut).
  const rows = items.map((it) => rowHtml(it));
  if (sec) rows.splice(Number.isInteger(sec.pos) ? Math.min(Math.max(sec.pos, 0), items.length) : items.length, 0, rowHtml({ ...sec, weight: sec.required ? sec.weight : "" }, true));
  return `<details class="gr-ed${bare ? " gr-bare" : ""}" ${open || bare ? "open" : ""} style="margin-top:10px" data-current="${esc(JSON.stringify(g || null))}"><summary ${bare ? "hidden" : ""}>${title}</summary>
    <div class="row" style="margin:12px 0 10px"><button type="button" class="btn sm" data-gr="add">+ Ajouter une épreuve</button></div>
    <div class="gr-grid gr-head tiny muted" style="margin-bottom:6px"><span>Épreuve</span><span>% de la note</span><span>Sur</span><span></span><span></span></div>
    <div class="gr-items">${(rows.length ? rows : [rowHtml({ label: "", weight: "", max: 20 })]).join("")}</div>
    <div class="card" style="margin:12px 0 0;padding:12px 14px"><span class="chip gr-total"></span><div class="gr-sum" style="margin-top:8px"></div></div>
  </details>`;
}

export function bindGradingEditor(form) {
  const box = $(".gr-items", form);
  if (!box) return;
  // Met à jour ce qui dépend de la saisie : total des poids et formule en clair.
  const refresh = () => {
    const tot = $(".gr-total", form), sum = $(".gr-sum", form);
    let g;
    try { g = readGradingEditor(form); } catch (err) { tot.className = "chip wa gr-total"; tot.textContent = "À compléter"; sum.textContent = err.message; return; }
    if (!g) { tot.className = "chip gr-total"; tot.textContent = "Aucune épreuve"; sum.textContent = "Ajoute une épreuve pour voir comment ta note sera calculée."; return; }
    const sec = g.second, w = g.items.reduce((s, it) => s + it.weight, 0) + (sec && sec.required ? sec.weight : 0);
    const ok = Math.abs(w - 100) < 0.01, part = (x) => Math.round((x / w) * 1000) / 10;
    tot.className = `chip ${ok ? "ok" : "wa"} gr-total`;
    tot.textContent = ok ? "Total : 100 %" : `Total : ${fmt(w)} (ramené à 100 %)`;
    // Une ligne par épreuve, dans l'ordre de tes lignes, avec la même règle d'affichage que la page Notes.
    let next = 0;
    const rows = $$(".gr-row", form).filter((r) => $(".gr-label", r).value.trim()).map((r) => {
      const it = sec && $(".gr-sec", r).checked ? sec : g.items[next++];
      return `<div class="gr-line"><span>${esc(shareName(it.label))}</span><b>${shareText(it === sec && !sec.required ? null : part(it.weight))}</b></div>`;
    });
    if (sec) rows.push(`<div class="tiny muted" style="padding-top:8px">La 2e chance remplace une note plus faible, si elle est meilleure.</div>`);
    sum.innerHTML = rows.join("");
  };
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gr]");
    if (!b) return;
    if (b.dataset.gr === "add") { box.insertAdjacentHTML("beforeend", rowHtml({ label: "", weight: "", max: 20 })); $$(".gr-label", box).pop().focus(); }
    else if (b.dataset.gr === "del") b.closest(".gr-row").remove();
    refresh();
  });
  // Déplacer une épreuve : on attrape la poignée (souris ou doigt) et on la fait glisser ; flèches haut/bas au clavier.
  box.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest(".gr-grip");
    if (!grip) return;
    e.preventDefault();
    const row = grip.closest(".gr-row");
    row.classList.add("gr-dragging");
    // Mouvement et relâchement écoutés sur toute la fenêtre : on ne reste jamais « coincé » en cours de déplacement.
    const move = (ev) => {
      const others = $$(".gr-row", box).filter((r) => r !== row);
      const before = others.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (before) { if (row.nextElementSibling !== before) box.insertBefore(row, before); }
      else if (box.lastElementChild !== row) box.appendChild(row);
    };
    const end = () => {
      row.classList.remove("gr-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      refresh();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  });
  box.addEventListener("keydown", (e) => {
    const grip = e.target.closest(".gr-grip");
    if (!grip || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const row = grip.closest(".gr-row");
    if (e.key === "ArrowUp" && row.previousElementSibling) box.insertBefore(row, row.previousElementSibling);
    else if (e.key === "ArrowDown" && row.nextElementSibling) box.insertBefore(row.nextElementSibling, row);
    grip.focus();
    refresh();
  });
  const onEdit = (e) => {
    if (!e.target.closest(".gr-ed")) return;
    // Une seule 2e chance : en cocher une décoche les autres.
    if (e.target.classList.contains("gr-sec") && e.target.checked) $$(".gr-sec", box).forEach((c) => { if (c !== e.target) c.checked = false; });
    refresh();
  };
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);
  refresh();
}

const canon = (o) => JSON.stringify(o, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

// Lit le formulaire → configuration (ou null si aucune épreuve). Lève une Error si la saisie est invalide.
export function readGradingEditor(form) {
  const ed = $(".gr-ed", form);
  if (!ed) return undefined;
  let current = null;
  try { current = JSON.parse(ed.dataset.current || "null"); } catch (e) { /* configuration illisible : on repart de zéro */ }
  const rows = $$(".gr-row", form).map((r) => {
    let orig = {};
    try { orig = JSON.parse(r.dataset.item || "{}"); } catch (e) { /* ligne ajoutée à la main */ }
    return { r, orig };
  });
  const used = new Set();
  rows.forEach(({ orig }) => { if (orig.id) used.add(orig.id); (orig.parts || []).forEach((p) => used.add(p.id)); });
  const fresh = (base) => { let i = 1; while (used.has(base + i)) i++; used.add(base + i); return base + i; };

  const items = [];
  let second = null;
  for (const { r, orig } of rows) {
    const label = $(".gr-label", r).value.trim();
    if (!label) continue;
    const weight = parseFloat($(".gr-w", r).value);
    const max = parseFloat($(".gr-max", r).value) || 20;
    if ($(".gr-sec", r).checked) {
      // 2e chance : à 0 % (ou vide) elle est facultative, sinon elle compte pour son pourcentage.
      second = { id: orig.id || fresh("sc"), label, pos: items.length }; // pos : nombre d'épreuves placées avant elle
      if (weight > 0) { second.required = true; second.weight = weight; }
      if (max !== 20) second.max = max;
      continue;
    }
    if (!(weight > 0)) throw new Error(`Poids manquant ou invalide pour « ${label} »`);
    const n = Math.min(8, Math.max(1, parseInt($(".gr-n", r).value, 10) || 1));
    const id = orig.id || fresh("e");
    const it = { id, label, weight };
    if (max !== 20) it.max = max;
    if (n > 1) {
      const old = orig.parts || [];
      it.parts = Array.from({ length: n }, (_, i) => (old.length === n ? old[i] : { id: (old[i] && old[i].id) || `${id}_${i + 1}`, label: `${label} — ${i + 1}/${n}` }));
    }
    items.push(it);
  }
  if (!items.length) return null;

  const g = { items };
  if (second) g.second = second;
  // Configuration inchangée : on garde le texte de formule d'origine s'il y en avait un.
  if (current && current.formule) { const { formule, ...rest } = current; if (canon(rest) === canon(g)) g.formule = formule; }
  return g;
}
