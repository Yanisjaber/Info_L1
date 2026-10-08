import { icon } from "../../core/components/icons.js";
import { D } from "../../core/services/app-data.js";
import { todayKey } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { fmtDate, plural } from "../../core/utils/format.js";
import { edtIsQuiet, seanceTypes } from "../settings/settings.js";
import { edtViewState } from "./edt.store.js";
import { EDT_HOME_MAX, EDT_UPCOMING_MAX, draftHrefFor, edtColor, edtLabel, edtMeta, edtMetaRaw, edtName, edtOf, edtRel, edtState, pd, seanceFor, seanceHasContent, seanceHasMaterial } from "./edt.utils.js";

export function edtCard(e, now, top, height, left, width, px) {
  const st = edtState(e, now), sc = seanceFor(e), written = seanceHasContent(sc);
  const compact = px < 58, micro = px < 32;
  const tt = esc([`${e.s}–${e.e}`, edtName(e), edtMetaRaw(e), e.n, e.cc ? "CC" : ""].filter(Boolean).join(" · "));
  // Le corps de la carte se comporte pareil pour tous les types : lien vers le cours s'il existe
  // déjà, sinon vers l'espace docs/notes à créer (href via draftHrefFor), sinon rien de cliquable —
  // c'est toujours le crayon qui modifie heure/date/matière/type, jamais le corps.
  const href = sc ? `#/c/${e.m}/${sc.id}` : draftHrefFor(e);
  const tag = href ? "a" : "div";
  const status = written ? `<span class="tiny edt-link">${icon("book")}${esc(sc.type)} ${sc.numero}</span>`
    : href ? (seanceHasMaterial(e.m, sc) ? `<span class="tiny edt-link">${icon("edit")}Rédiger ce cours</span>` : `<span class="tiny muted">Aucune note ou doc</span>`) : "";
  // Le bouton crayon est un <button> frère du <a>/<div>, jamais imbriqué dedans (markup invalide
  // sinon) : c'est pour ça que tout le positionnement absolu passe sur .edt-ev-wrap désormais,
  // .edt-ev se contentant de remplir ce wrapper (voir style.css).
  return `<div class="edt-ev-wrap" style="top:${top}%;height:${height}%;left:${left}%;width:calc(${width}% - 3px)">
    <${tag} class="edt-ev ${e.cc ? "hascc " : ""}${st}${href ? " clickable" : ""}" style="--c:${edtColor(e)}" title="${tt}"${href ? ` href="${href}"` : ""}>
      <div class="edt-h"><b>${e.s}${micro ? "" : "–" + e.e}</b>${!micro ? `<span class="chip gr">${esc(e.t)}</span>` : ""}${!micro && e.cc ? '<span class="chip wa">CC</span>' : ""}${!micro && st === "live" ? '<span class="chip ok">en cours</span>' : ""}</div>
      ${!micro ? `<div class="edt-t">${esc(edtName(e))}</div>` : ""}
      ${!compact && edtMeta(e) ? `<div class="tiny muted">${edtMeta(e)}</div>` : ""}${!compact && e.n ? `<div class="tiny edt-n">${esc(e.n)}</div>` : ""}
      ${!compact ? status : ""}</${tag}>
    <button type="button" class="edt-editbtn" data-a="edtedit" data-id="${esc(e.id)}" aria-label="Modifier ce créneau" title="Modifier">${icon("edit")}</button>
  </div>`;
}

function edtRow(e, now, rel) {
  const c = edtColor(e), st = edtState(e, now), sc = seanceFor(e), written = seanceHasContent(sc);
  const href = sc ? `#/c/${e.m}/${sc.id}` : draftHrefFor(e) || "#/edt";
  const statusTxt = written ? `${esc(sc.type)} ${sc.numero}` : href !== "#/edt" ? (seanceHasMaterial(e.m, sc) ? "à rédiger" : "aucune note ou doc") : "";
  return `<a class="item edt-row ${st}" href="${href}"><span class="badge" style="background:color-mix(in srgb,${c} 15%,var(--surface));color:${c}">${e.s}</span><div class="sp"><b>${esc(edtName(e))}</b> <span class="chip gr">${esc(e.t)}</span>${e.cc ? ' <span class="chip wa">CC</span>' : ""}${st === "live" ? ' <span class="chip ok">en cours</span>' : ""}<div class="tiny muted">${rel ? edtRel(e.d) + " · " : ""}${e.s}–${e.e}${edtMeta(e) ? " · " + edtMeta(e) : ""}${statusTxt ? " · " + statusTxt : ""}</div></div></a>`;
}

export function edtHome() {
  if (!D.edt.events.length) return "";
  const now = new Date(), iso = todayKey();
  const day = edtOf(iso), timedAll = day.filter((e) => !e.allday), off = day.find((e) => e.allday);
  const timed = timedAll.slice(0, EDT_HOME_MAX);
  const head = timedAll.length ? "" : `<div class="small muted" style="margin:4px 0 8px">${off ? esc(edtLabel(off)) + " aujourd'hui." : "Pas de cours aujourd'hui."}</div>`;
  const doneMsg = timedAll.length && !timedAll.some((e) => pd(e.d, e.e) > now) ? '<div class="small muted" style="margin:4px 0 8px">Journée terminée.</div>' : "";
  const upcoming = timed.length < EDT_HOME_MAX
    ? D.edt.events.filter((e) => !e.allday && !edtIsQuiet(e.t) && e.d !== iso && pd(e.d, e.e) > now).sort((a, b) => pd(a.d, a.s) - pd(b.d, b.s)).slice(0, Math.min(EDT_UPCOMING_MAX, EDT_HOME_MAX - timed.length))
    : [];
  return `<div class="card"><div class="row"><h3 style="margin:0">Aujourd'hui</h3><div class="sp"></div><a class="btn sm ghost" href="#/edt">${icon("grid")}Emploi du temps</a></div>
    ${head}<div class="list">${timed.map((e) => edtRow(e, now)).join("")}</div>${doneMsg}
    ${upcoming.length ? `<div class="tiny muted" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.06em">${upcoming.length > 1 ? "Prochains cours" : "Prochain cours"}</div><div class="list">${upcoming.map((e) => edtRow(e, now, true)).join("")}</div>` : ""}</div>`;
}

export function edtImportHtml() {
  if (edtViewState.icsPreview) {
    const a = edtViewState.icsPreview;
    return `<p class="small muted">${plural(a.events.length, "créneau")} détecté${a.events.length > 1 ? "s" : ""}${a.range ? ` du ${fmtDate(a.range[0])} au ${fmtDate(a.range[1])}` : ""}.</p>
    <div class="card list" style="margin:10px 0">${a.courses.map((c) => `<div class="item"><div class="sp"><b>${esc(c.nom)}</b><div class="tiny muted">${seanceTypes().map((t) => `${c.counts[t.id] || 0} ${esc(t.id)}`).join(" · ")}</div></div></div>`).join("") || '<div class="tiny muted">Aucune matière détectée.</div>'}</div>
    ${a.ccCount ? `<p class="tiny muted">${plural(a.ccCount, "créneau marqué CC", "créneaux marqués CC")} — vérifie-les dans l'emploi du temps, le crayon permet d'ajouter l'échéance correspondante.</p>` : ""}
    <div class="row"><button class="btn pri" data-a="confirmics">${icon("check")}Importer (remplace l'EDT actuel)</button><button class="btn ghost" data-a="cancelics">Annuler</button></div>`;
  }
  return `<p class="small muted">Fichier .ics exporté depuis ton emploi du temps en ligne (Celcat ou autre) :</p>
  <label class="btn pri">${icon("dl")}Choisir un fichier .ics<input type="file" accept=".ics,text/calendar" data-a="icsfile" class="sr"></label>`;
}
