import { icon } from "../../core/components/icons.js";
import { C, M } from "../../core/services/app-data.js";
import { esc } from "../../core/utils/dom.js";
import { fmtLong } from "../../core/utils/format.js";
import { edtToSeanceType } from "../settings/settings.js";

// Un créneau d'EDT sans séance correspondante n'en crée plus une automatiquement au simple clic —
// juste regarder un créneau pour voir de quoi il s'agit ne doit jamais laisser une séance vide
// traîner dans la matière. On affiche un écran de confirmation ("Créer CM 3 ?") et seul un clic
// explicite sur le bouton crée réellement la séance (data-a="creerseance", plus bas).
export function edtDraft(q) {
  const m = M(q.m), want = edtToSeanceType(q.t);
  if (!m || !want || !q.d) return { html: `<div class="empty">Créneau introuvable.</div>` };
  const sameType = C(q.m).seances.filter((x) => x.type === want);
  const numero = sameType.length ? Math.max(...sameType.map((x) => x.numero)) + 1 : 1;
  const meta = [q.r, q.p, q.g].filter(Boolean).join(" · ");
  return {
    html: `<div class="crumbs"><a href="#/edt">Emploi du temps</a> › ${esc(m.court)}</div>
    <h1>Créer ${esc(want)} ${numero} ?</h1>
    <div class="card" style="max-width:520px">
      <div class="row nowrap"><i class="dot" style="--c:${m.couleur}"></i><b>${esc(m.nom)}</b></div>
      <p class="muted" style="margin:10px 0 4px">${esc(fmtLong(q.d))} · ${esc(q.s)}–${esc(q.e)}${meta ? " · " + esc(meta) : ""}</p>
      <p class="small muted">Ce créneau n'a pas encore de séance dans l'appli. La créer ajoute « ${esc(want)} ${numero} » à la matière avec un espace de travail vide (notes, documents) — tu pourras rédiger le cours plus tard, ou juste y déposer des documents.</p>
      <div class="row" style="margin-top:16px">
        <button type="button" class="btn pri" data-a="creerseance" data-id="${esc(q.id || "")}" data-m="${esc(q.m)}" data-d="${esc(q.d)}" data-t="${esc(q.t)}">${icon("check")}Créer ${esc(want)} ${numero}</button>
        <a class="btn ghost" href="#/edt">Annuler</a>
      </div>
    </div>`,
  };
}
