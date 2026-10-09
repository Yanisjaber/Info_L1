import { toast } from "../../core/components/toast.js";
import { $, esc } from "../../core/utils/dom.js";
import { fileLabel } from "./files.js";
import { uploadFile } from "./files.service.js";

// Champ « fichier » d'un formulaire : valeur actuelle (cachée), choix d'un nouveau fichier, case pour le retirer.
export function fileFieldHtml(name, label, value, accept = "application/pdf") {
  return `<div class="field"><label>${esc(label)}</label>
    <input type="hidden" name="${name}" value="${esc(value || "")}">
    ${value ? `<div class="tiny muted" style="margin-bottom:4px">Actuel : ${esc(fileLabel(value))} · <label style="display:inline"><input type="checkbox" name="${name}del"> retirer</label></div>` : ""}
    <input type="file" name="${name}file" accept="${accept}"></div>`;
}

// Bouton « Insérer une image » sous l'éditeur d'un cours : envoie l'image dans le stockage et
// insère la balise <img> à l'endroit du curseur.
export function imageInsertHtml() {
  return `<div class="row" style="margin-top:6px"><label class="btn sm">Insérer une image<input type="file" accept="image/*" data-imginsert hidden></label><span class="tiny muted">envoyée dans ton stockage, balise ajoutée au curseur</span></div>`;
}

export function bindImageInsert(form, folder) {
  const input = $("[data-imginsert]", form), ta = form.elements.contenu;
  if (!input || !ta) return;
  input.addEventListener("change", async () => {
    const f = input.files[0]; if (!f) return;
    try {
      const ref = await uploadFile(f, `${folder}/images`);
      const tag = `<img src="${ref}" alt="">`, a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
      ta.value = ta.value.slice(0, a) + tag + ta.value.slice(b);
      ta.focus(); ta.selectionStart = ta.selectionEnd = a + tag.length;
      toast("Image ajoutée");
    } catch (err) { toast("Erreur : " + err.message); }
    input.value = "";
  });
}

// Section « Fichiers » de la page Compte : simple rappel de où vivent les fichiers.
export function filesSectionHtml() {
  return `<p class="small muted">Tes PDF et les images de tes cours sont stockés dans ton espace privé Supabase (pas dans le dépôt du site). Ajoute-les depuis les formulaires de séance et de matière.</p>`;
}
