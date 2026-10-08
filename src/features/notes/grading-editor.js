// Éditeur du calcul de la note d'une matière (section du formulaire « matière » dans Compte).
// Produit la configuration lue par features/notes/grades.js (colonne `grading`).
import { $, $$, esc } from "../../core/utils/dom.js";

const ROW_STYLE = "display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;align-items:end;margin-bottom:8px";

function rowHtml(it) {
  const n = it.parts && it.parts.length > 1 ? it.parts.length : 1;
  return `<div class="gr-row" data-item="${esc(JSON.stringify(it))}" style="${ROW_STYLE}">
    <div class="field" style="grid-column:span 2"><label>Épreuve</label><input type="text" class="gr-label" value="${esc(it.label || "")}" placeholder="ex. CC1 — QCM"></div>
    <div class="field"><label>Poids</label><input type="number" class="gr-w" min="0" step="any" value="${it.weight ?? ""}" placeholder="ex. 20"></div>
    <div class="field"><label>Note sur</label><input type="number" class="gr-max" min="1" step="any" value="${it.max || 20}"></div>
    <div class="field"><label>Moyenne de</label><input type="number" class="gr-n" min="1" max="8" step="1" value="${n}" title="Nombre de notes saisies dont on fait la moyenne pour cette épreuve"></div>
    <button type="button" class="btn sm ghost" data-gr="del" aria-label="Retirer cette épreuve">✕</button>
  </div>`;
}

export function gradingEditorHtml(m) {
  const g = m && m.grading, items = (g && g.items) || [], sec = (g && g.second) || null;
  const mode = !sec ? "none" : sec.required ? "req" : "opt";
  return `<details class="gr-ed" style="margin-top:10px" data-current="${esc(JSON.stringify(g || null))}"><summary>Calcul de la note (page Notes &amp; CC)</summary>
    <p class="small muted" style="margin:10px 0">Une ligne par épreuve, avec son poids (le rapport entre les poids compte, pas leur somme). Laisse vide pour ne pas avoir de calculateur pour cette matière.</p>
    <div class="gr-items">${items.map(rowHtml).join("")}</div>
    <div class="row" style="margin:4px 0 12px"><button type="button" class="btn sm" data-gr="add">+ Ajouter une épreuve</button></div>
    <div class="grid g2">
      <div class="field"><label>Note de 2e chance</label><select name="g2mode">
        <option value="none" ${mode === "none" ? "selected" : ""}>Aucune</option>
        <option value="opt" ${mode === "opt" ? "selected" : ""}>Facultative — remplace une note plus faible</option>
        <option value="req" ${mode === "req" ? "selected" : ""}>Obligatoire — compte aussi dans la moyenne</option></select></div>
      <div class="field"><label>Nom de la 2e chance</label><input type="text" name="g2label" value="${esc(sec ? sec.label : "")}" placeholder="ex. CC4 — 2e chance"></div>
      <div class="field"><label>Poids de la 2e chance (si obligatoire)</label><input type="number" name="g2w" min="0" step="any" value="${sec && sec.weight ? sec.weight : ""}"></div>
    </div>
    <input type="hidden" name="g2id" value="${esc(sec ? sec.id : "")}">
  </details>`;
}

export function bindGradingEditor(form) {
  const box = $(".gr-items", form);
  if (!box) return;
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gr]");
    if (!b) return;
    if (b.dataset.gr === "add") { box.insertAdjacentHTML("beforeend", rowHtml({ label: "", weight: "", max: 20 })); $$(".gr-label", box).pop().focus(); }
    else if (b.dataset.gr === "del") b.closest(".gr-row").remove();
  });
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
  const sid = String(new FormData(form).get("g2id") || "");
  if (sid) used.add(sid);
  const fresh = (base) => { let i = 1; while (used.has(base + i)) i++; used.add(base + i); return base + i; };

  const items = [];
  for (const { r, orig } of rows) {
    const label = $(".gr-label", r).value.trim();
    if (!label) continue;
    const weight = parseFloat($(".gr-w", r).value);
    if (!(weight > 0)) throw new Error(`Poids manquant ou invalide pour « ${label} »`);
    const max = parseFloat($(".gr-max", r).value) || 20;
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

  const fd = new FormData(form), mode = fd.get("g2mode");
  const g = { items };
  if (mode === "opt" || mode === "req") {
    const label = String(fd.get("g2label") || "").trim() || "2e chance";
    g.second = { id: sid || fresh("sc"), label };
    if (mode === "req") {
      const w = parseFloat(fd.get("g2w"));
      if (!(w > 0)) throw new Error("Indique le poids de la 2e chance (obligatoire)");
      g.second.required = true; g.second.weight = w;
    }
  }
  // Configuration inchangée : on garde le texte de formule d'origine s'il y en avait un.
  if (current && current.formule) { const { formule, ...rest } = current; if (canon(rest) === canon(g)) g.formule = formule; }
  return g;
}
