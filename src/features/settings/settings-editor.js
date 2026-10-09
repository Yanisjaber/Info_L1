import { toast } from "../../core/components/toast.js";
import { loadData } from "../../core/services/data-loader.js";
import { $$, esc } from "../../core/utils/dom.js";
import { SET } from "./settings.js";
import { saveSettings } from "./settings.service.js";
import { refreshShell } from "../../routing/navigation.js";

// Éditeur des réglages (Compte → Réglages). Les listes sont saisies en texte, une entrée par ligne :
//   types de séance :  ID | Libellé | type de créneau d'EDT correspondant
//   types d'EDT     :  Nom | Libellé affiché (optionnel) | options (optionnel) : « discret » = exclu des « prochains cours »,
//                      « libre » = jour sans cours (férié, fermeture…), sans matière associée
//   détection .ics  :  expression régulière => type d'EDT
const seanceLines = (c) => c.seanceTypes.map((t) => [t.id, t.label, t.edt || ""].join(" | ")).join("\n");
const edtLines = (c) => c.edtTypes.map((t) => {
  const flags = [t.quiet && "discret", t.off && "libre"].filter(Boolean).join(", ");
  return flags ? `${t.id} | ${t.label || ""} | ${flags}` : t.label ? `${t.id} | ${t.label}` : t.id;
}).join("\n");
const icsLines = (c) => c.ics.types.map((r) => `${r.pattern} => ${r.type}`).join("\n");

export function settingsEditorHtml() {
  const c = SET();
  const ta = (name, rows, v) => `<textarea name="${name}" rows="${rows}" spellcheck="false" style="width:100%;font-family:var(--mono, monospace);font-size:.85rem">${esc(v)}</textarea>`;
  return `<form class="grid" style="gap:12px" data-a="savesettings">
    <div class="grid g3">
      <div class="field"><label>Note de validation (/20)</label><input type="number" name="passMark" min="0" max="20" step="0.05" value="${c.passMark}"></div>
      <div class="field"><label>Libellé « validé »</label><input type="text" name="passLabel" value="${esc(c.passLabel)}" placeholder="ex. UE validée"></div>
      <div class="field"><label>Préfixe des fichiers exportés</label><input type="text" name="slug" value="${esc(c.slug)}" pattern="[a-z0-9\\-]{1,30}" placeholder="ex. l1s1"></div>
    </div>
    <div class="field"><label>Texte sous l'emploi du temps (« {source} » = origine des créneaux)</label><textarea name="edtFootnote" rows="2" style="width:100%">${esc(c.edtFootnote)}</textarea></div>
    <div class="field"><label>Types de séance — <code>ID | Libellé | type de créneau d'EDT</code></label>${ta("seanceTypes", 4, seanceLines(c))}</div>
    <div class="field"><label>Types de créneau d'EDT — <code>Nom | Libellé | discret, libre</code></label>${ta("edtTypes", 6, edtLines(c))}</div>
    <div class="field"><label>Détection à l'import .ics — <code>expression régulière => type d'EDT</code> (le premier qui correspond gagne)</label>${ta("icsTypes", 5, icsLines(c))}</div>
    <div class="field"><label>Expression régulière d'un contrôle (CC, examen…) dans le titre</label><input type="text" name="icsCc" value="${esc(c.ics.cc)}" style="font-family:var(--mono, monospace)"></div>
    <div class="row"><button class="btn pri" type="submit">Enregistrer les réglages</button></div>
  </form>`;
}

const lines = (s) => String(s || "").split("\n").map((l) => l.trim()).filter(Boolean);
const cells = (l) => l.split("|").map((x) => x.trim());
const checkRe = (src) => { try { new RegExp(src, "i"); } catch (e) { throw new Error(`Expression régulière invalide : ${src}`); } };

// Lit et valide le formulaire ; lève une Error au message lisible si quelque chose cloche.
export function readSettings(form) {
  const fd = new FormData(form), get = (k) => String(fd.get(k) ?? "");
  const passMark = +get("passMark");
  if (!(passMark >= 0 && passMark <= 20)) throw new Error("La note de validation doit être entre 0 et 20.");
  const edtTypes = lines(get("edtTypes")).map((l) => { const [id, label, flags = ""] = cells(l); return { id, ...(label ? { label } : {}), ...(/\bdiscret\b/i.test(flags) ? { quiet: true } : {}), ...(/\blibre\b/i.test(flags) ? { off: true } : {}) }; });
  if (!edtTypes.length) throw new Error("Il faut au moins un type de créneau d'EDT.");
  const edtIds = edtTypes.map((t) => t.id);
  if (new Set(edtIds).size !== edtIds.length) throw new Error("Deux types de créneau portent le même nom.");
  const seanceTypes = lines(get("seanceTypes")).map((l) => { const [id, label, edt] = cells(l); return { id, label: label || id, ...(edt ? { edt } : {}) }; });
  if (!seanceTypes.length) throw new Error("Il faut au moins un type de séance.");
  const sIds = seanceTypes.map((t) => t.id);
  if (new Set(sIds).size !== sIds.length) throw new Error("Deux types de séance portent le même identifiant.");
  for (const t of seanceTypes) if (t.edt && !edtIds.includes(t.edt)) throw new Error(`Le type de séance ${t.id} renvoie vers un type d'EDT inconnu : ${t.edt}`);
  const types = lines(get("icsTypes")).map((l) => {
    const i = l.lastIndexOf("=>");
    if (i < 0) throw new Error(`Ligne .ics sans « => » : ${l}`);
    const pattern = l.slice(0, i).trim(), type = l.slice(i + 2).trim();
    checkRe(pattern);
    if (!edtIds.includes(type)) throw new Error(`Type d'EDT inconnu dans les règles .ics : ${type}`);
    return { pattern, type };
  });
  const cc = get("icsCc").trim();
  if (cc) checkRe(cc);
  return {
    passMark, passLabel: get("passLabel").trim() || "validé", slug: get("slug").trim() || "revise",
    edtFootnote: get("edtFootnote").trim(), seanceTypes, edtTypes, ics: { types, cc },
  };
}

export function bindSettingsEditor(el) {
  $$('form[data-a="savesettings"]', el).forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    let cfg;
    try { cfg = readSettings(f); } catch (err) { return toast(err.message); }
    try {
      await saveSettings(cfg);
      toast("Réglages enregistrés");
      await loadData(); refreshShell();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
}
