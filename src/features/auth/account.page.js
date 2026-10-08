import { icon } from "../../core/components/icons.js";
import { D } from "../../core/services/app-data.js";
import { magicLink, signIn, signUp, state, sync } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { plural } from "../../core/utils/format.js";
import { edtImportHtml } from "../edt/edt.components.js";
import { bindMM, bindPeriodes, matieresAdminHtml, periodesAdminHtml } from "../matieres/matieres-admin.components.js";
import { filesSectionHtml } from "../files/files.components.js";
import { bindSettingsEditor, settingsEditorHtml } from "../settings/settings-editor.js";

// Section repliable de la page Compte (mémorise l'état ouvert/fermé entre deux rendus).
const sectionOpen = { sync: true, periodes: true, matieres: true, edt: true, fichiers: true, reglages: false, apparence: true, donnees: true };

function sectionCard(key, title, body) {
  return `<details class="card" style="margin-top:14px" ${sectionOpen[key] ? "open" : ""} data-section="${key}"><summary>${title}</summary><div style="margin-top:12px">${body}</div></details>`;
}

export function account() {
  const st = { ok: "synchronisé", sync: "synchronisation…", error: "erreur", off: "connecté" }[sync.status] || "";
  const login = !sync.configured
    ? `<div class="note prose" style="padding:12px 16px"><b>Mode local —</b> la progression est enregistrée dans ce navigateur uniquement. Pour la retrouver sur ton téléphone et ton ordinateur, configure Supabase (voir le fichier <code>README.md</code>, étape 2), puis renseigne <code>js/config.js</code>.</div>`
    : sync.user
      ? `<p>Connecté en tant que <b>${esc(sync.user.email)}</b> · <span class="chip ${sync.status === "error" ? "ko" : "ok"}">${st}</span></p>${sync.error ? `<p class="small" style="color:var(--ko)">${esc(sync.error)}</p>` : ""}<div class="row"><button class="btn" data-a="pull">Récupérer depuis le cloud</button><button class="btn" data-a="push">Envoyer maintenant</button><button class="btn ghost" data-a="logout">Se déconnecter</button></div>${sync.last ? `<p class="tiny muted">Dernière synchro : ${new Date(sync.last).toLocaleTimeString("fr-FR")}</p>` : ""}`
      : `<form id="lf" class="grid" style="gap:10px;max-width:380px"><div class="field"><label for="le">Email</label><input id="le" type="email" name="email" required autocomplete="email"></div><div class="field"><label for="lp">Mot de passe</label><input id="lp" type="password" name="pw" minlength="6" autocomplete="current-password"></div><div class="row"><button class="btn pri" data-a="login" type="submit">Se connecter</button><button class="btn" type="button" data-a="signup">Créer le compte</button><button class="btn ghost" type="button" data-a="magic">Lien magique</button></div><div class="small muted" id="lmsg"></div></form>`;
  const pp = sync.user
    ? sectionCard("periodes", "Mes périodes", `${!D.periodes.length ? `<p class="small muted">Aucune période créée. Sans période, tes matières restent toujours visibles dans le menu — crées-en une seulement quand tu veux pouvoir archiver un semestre terminé.</p>` : ""}${periodesAdminHtml()}`)
    : "";
  const mm = sync.user
    ? sectionCard("matieres", "Mes matières", `${!D.matieres.length ? `<p class="small muted">Aucune matière pour l'instant. Crée ta première matière ci-dessous.</p>` : ""}${matieresAdminHtml()}`)
    : "";
  const edtCard = sync.user
    ? sectionCard("edt", "Emploi du temps", `${D.edt.events.length ? `<p class="small muted">${plural(D.edt.events.length, "créneau")} importé${D.edt.events.length > 1 ? "s" : ""}.</p>` : ""}${edtImportHtml()}`)
    : "";
  const fichiersCard = sync.user ? sectionCard("fichiers", "Fichiers (PDF, images)", filesSectionHtml()) : "";
  const reglagesCard = sync.user ? sectionCard("reglages", "Réglages", `<p class="small muted">Tout ce qui varie d'un établissement ou d'un cursus à l'autre : types de séance, vocabulaire de l'emploi du temps, règles de l'import .ics, note de validation. Enregistré dans ton compte.</p>${settingsEditorHtml()}`) : "";
  const apparenceBody = `<div class="field" style="max-width:220px"><label for="th">Thème</label><select id="th" data-a="theme"><option value="auto" ${state.prefs.theme === "auto" ? "selected" : ""}>Automatique</option><option value="light" ${state.prefs.theme === "light" ? "selected" : ""}>Clair</option><option value="dark" ${state.prefs.theme === "dark" ? "selected" : ""}>Sombre</option></select></div>`;
  const donneesBody = `<p class="small muted">Sauvegarde ou restaure ta progression (QCM, cartes, notes) dans un fichier.</p><div class="row"><button class="btn" data-a="export">${icon("dl")}Exporter</button><label class="btn">Importer<input type="file" accept="application/json" data-a="import" class="sr"></label><button class="btn ghost" data-a="reset" style="color:var(--ko)">Tout effacer</button></div>`;
  return { html: `<h1>Compte &amp; données</h1>
    ${sectionCard("sync", "Synchronisation", login)}
    ${pp}
    ${mm}
    ${edtCard}
    ${fichiersCard}
    ${reglagesCard}
    ${sectionCard("apparence", "Apparence", apparenceBody)}
    ${sectionCard("donnees", "Mes données", donneesBody)}`,
    after: (el) => {
      const f = $("#lf", el);
      if (f) f.addEventListener("submit", async (e) => { e.preventDefault(); await doAuth("login", f); });
      $$("details[data-section]", el).forEach((d) => d.addEventListener("toggle", () => { sectionOpen[d.dataset.section] = d.open; }));
      bindPeriodes(el);
      bindMM(el);
      bindSettingsEditor(el);
    } };
}

export async function doAuth(kind, f) {
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
