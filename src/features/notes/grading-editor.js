// Éditeur du calcul de la note d'une matière (page Notes & CC, et formulaire « matière » dans Compte).
// Produit la configuration lue par features/notes/grades.js (colonne `grading`).
import { $, $$, esc } from "../../core/utils/dom.js";

// Même grille pour l'en-tête et pour chaque ligne : nom de l'épreuve · poids · note sur · retirer.
const COLS = "display:grid;grid-template-columns:minmax(0,1fr) 84px 72px 36px;gap:8px;align-items:center";
const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
// Nom sans le « (10 %) » qu'on trouve dans les anciens libellés : le poids a déjà sa colonne.
const short = (l) => String(l || "").replace(/\s*\([^)]*%\)\s*$/, "").trim();
const HELP = {
  none: "Pas de rattrapage : chaque épreuve compte une seule fois.",
  opt: "Facultative : si elle est meilleure, elle remplace une note plus faible.",
  req: "Obligatoire : elle compte aussi dans la note, avec son propre poids.",
};

function rowHtml(it) {
  const n = it.parts && it.parts.length > 1 ? it.parts.length : 1;
  return `<div class="gr-row" data-item="${esc(JSON.stringify(it))}" style="margin-bottom:8px">
    <div style="${COLS}">
      <input type="text" class="gr-label" value="${esc(it.label || "")}" placeholder="ex. CC1 — QCM" aria-label="Nom de l'épreuve">
      <input type="number" class="gr-w" min="0" step="any" value="${it.weight ?? ""}" placeholder="%" aria-label="Poids de l'épreuve, en pourcentage">
      <input type="number" class="gr-max" min="1" step="any" value="${it.max || 20}" aria-label="Note sur">
      <button type="button" class="btn sm ghost" data-gr="del" aria-label="Retirer cette épreuve">✕</button>
    </div>
    <div class="gr-adv tiny muted" ${n > 1 ? "" : "hidden"} style="margin:6px 0 0 2px">Cette épreuve est la moyenne de <input type="number" class="gr-n" min="1" max="8" step="1" value="${n}" style="width:64px;display:inline-block;padding:4px 8px" aria-label="Nombre de notes dont on fait la moyenne"> notes</div>
  </div>`;
}

export function gradingEditorHtml(m, { open = false, title = "Calcul de la note (page Notes &amp; CC)" } = {}) {
  const g = m && m.grading, items = (g && g.items) || [], sec = (g && g.second) || null;
  const mode = !sec ? "none" : sec.required ? "req" : "opt";
  const seg = (v, t) => `<label><input type="radio" name="g2mode" value="${v}" ${mode === v ? "checked" : ""}>${t}</label>`;
  return `<details class="gr-ed" ${open ? "open" : ""} style="margin-top:10px" data-current="${esc(JSON.stringify(g || null))}"><summary>${title}</summary>
    <p class="small muted" style="margin:10px 0">Une ligne par épreuve : son nom, son <b>poids</b> dans la note finale (en %) et sa note maximale. Laisse tout vide pour ne pas avoir de calculateur pour cette matière.</p>
    <div class="tiny muted" style="${COLS};margin-bottom:6px"><span>Épreuve</span><span>% de la note</span><span>Sur</span><span></span></div>
    <div class="gr-items">${(items.length ? items : [{ label: "", weight: "", max: 20 }]).map(rowHtml).join("")}</div>
    <div class="row" style="margin:4px 0 8px"><button type="button" class="btn sm" data-gr="add">+ Ajouter une épreuve</button><button type="button" class="btn sm ghost" data-gr="adv">Moyenne de plusieurs notes…</button></div>
    <div class="card" style="margin:12px 0;padding:12px 14px"><span class="chip gr-total"></span><div class="gr-sum" style="margin-top:8px"></div></div>
    <div class="small" style="font-weight:600;margin:14px 0 6px">Y a-t-il une 2e chance (rattrapage) ?</div>
    <div class="seg" role="radiogroup" aria-label="2e chance">${seg("none", "Non")}${seg("opt", "Facultative")}${seg("req", "Obligatoire")}</div>
    <p class="small muted gr-help" style="margin:8px 0 0"></p>
    <div class="gr-second">
      <div class="field" style="flex:1;min-width:0"><label>Nom de la 2e chance</label><input type="text" name="g2label" value="${esc(sec ? sec.label : "")}" placeholder="ex. CC4 — 2e chance"></div>
      <div class="field gr-g2w" style="flex:none;width:160px;min-width:0"><label>Poids (%)</label><input type="number" name="g2w" min="0" step="any" value="${sec && sec.weight ? sec.weight : ""}"></div>
    </div>
    <input type="hidden" name="g2id" value="${esc(sec ? sec.id : "")}">
  </details>`;
}

export function bindGradingEditor(form) {
  const box = $(".gr-items", form);
  if (!box) return;
  // Met à jour ce qui dépend de la saisie : champs de 2e chance, total des poids, formule en clair.
  const refresh = () => {
    const mode = (form.querySelector('input[name="g2mode"]:checked') || {}).value || "none";
    $(".gr-second", form).hidden = mode === "none";
    $(".gr-g2w", form).hidden = mode !== "req";
    $(".gr-help", form).textContent = HELP[mode];
    const tot = $(".gr-total", form), sum = $(".gr-sum", form);
    let g;
    try { g = readGradingEditor(form); } catch (err) { tot.className = "chip wa gr-total"; tot.textContent = "À compléter"; sum.textContent = err.message; return; }
    if (!g) { tot.className = "chip gr-total"; tot.textContent = "Aucune épreuve"; sum.textContent = "Ajoute une épreuve pour voir comment ta note sera calculée."; return; }
    const sec = g.second, w = g.items.reduce((s, it) => s + it.weight, 0) + (sec && sec.required ? sec.weight : 0);
    const ok = Math.abs(w - 100) < 0.01, pct = (x) => `${fmt((x / w) * 100)} %`;
    tot.className = `chip ${ok ? "ok" : "wa"} gr-total`;
    tot.textContent = ok ? "Total : 100 %" : `Total : ${fmt(w)} (ramené à 100 %)`;
    // Une ligne par épreuve : son nom, ce qui la particularise, sa part dans la note.
    const line = (name, meta, share) => `<div class="gr-line"><span>${esc(short(name))}${meta.length ? ` <span class="tiny muted">${meta.join(" · ")}</span>` : ""}</span><b>${share}</b></div>`;
    const rows = g.items.map((it) => line(it.label, [
      ...(it.parts ? [`moyenne de ${it.parts.length} notes`] : []),
      ...(it.max ? [`sur ${fmt(it.max)}`] : []),
    ], pct(it.weight)));
    if (sec && sec.required) rows.push(line(sec.label, ["2e chance"], pct(sec.weight)));
    if (sec) rows.push(`<div class="tiny muted" style="padding-top:8px">${sec.required ? "La 2e chance remplace aussi chaque note plus faible, si elle est meilleure." : `2e chance facultative : « ${esc(short(sec.label))} » remplace une note plus faible, si elle est meilleure.`}</div>`);
    sum.innerHTML = rows.join("");
  };
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gr]");
    if (!b) return;
    if (b.dataset.gr === "add") { box.insertAdjacentHTML("beforeend", rowHtml({ label: "", weight: "", max: 20 })); $$(".gr-label", box).pop().focus(); }
    else if (b.dataset.gr === "del") b.closest(".gr-row").remove();
    else if (b.dataset.gr === "adv") $$(".gr-adv", box).forEach((x) => { x.hidden = !x.hidden; });
    refresh();
  });
  const onEdit = (e) => { if (e.target.closest(".gr-ed")) refresh(); };
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
