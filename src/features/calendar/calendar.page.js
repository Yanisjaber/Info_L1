import { icon } from "../../core/components/icons.js";
import { C, D, M } from "../../core/services/app-data.js";
import { dataState } from "../../core/services/app-data.store.js";
import { sync, todayKey } from "../../core/services/store.js";
import { download, esc } from "../../core/utils/dom.js";
import { daysUntil, fmtDate, fmtLong, parseDay } from "../../core/utils/format.js";
import { SET } from "../settings/settings.js";
import { calState } from "./calendar.store.js";
import { ccLinkHtml, ccNote, ccNoteChip, ccSeance, ccSuggestionsHtml } from "./cc-modal.js";
import { fmtPoids, nextEvents } from "../dashboard/dashboard.utils.js";
import { ccReadiness, pctCls } from "../elo/elo.utils.js";

export function calendar(q) {
  if (!sync.user) return { html: `<h1>Calendrier</h1><div class="empty">Connecte-toi pour voir ton calendrier.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
  if (!calState.calMonth) { const t = new Date(); calState.calMonth = new Date(t.getFullYear(), t.getMonth(), 1); const has = D.cal.evenements.some((e) => { const d = parseDay(e.date); return d.getFullYear() === calState.calMonth.getFullYear() && d.getMonth() === calState.calMonth.getMonth(); }); const nx = nextEvents(1)[0]; if (!has && nx) { const d = parseDay(nx.date); calState.calMonth = new Date(d.getFullYear(), d.getMonth(), 1); } }
  const y = calState.calMonth.getFullYear(), mo = calState.calMonth.getMonth();
  const first = new Date(y, mo, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const evs = D.cal.evenements;
  const ses = calState.calSeances ? dataState.IDS.flatMap((id) => C(id).seances.map((s) => ({ ...s, mid: id }))) : [];
  const today = todayKey();
  let cells = "";
  for (let i = 0; i < off; i++) cells += `<div class="d out"></div>`;
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const e = evs.filter((x) => x.date === iso), s = ses.filter((x) => x.date === iso);
    cells += `<div class="d ${iso === today ? "today" : ""}"><b>${d}</b>${e.map((x) => `<button class="ev" style="--c:${M(x.matiere).couleur}" data-a="evt" data-id="${x.id}" title="${esc(M(x.matiere).court + " — " + x.titre)}">${esc(M(x.matiere).court)} · ${esc(x.titre.split(" — ")[0])}</button>`).join("")}${s.map((x) => `<a class="ev se" style="--c:${M(x.mid).couleur}" href="#/c/${x.mid}/${x.id}">${esc(M(x.mid).court)} ${x.type}${x.numero}</a>`).join("")}</div>`;
  }
  const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(calState.calMonth);
  const upcoming = D.cal.evenements.filter((e) => daysUntil(e.date) >= 0);
  const past = D.cal.evenements.filter((e) => daysUntil(e.date) < 0);
  const line = (e) => { const sc = ccSeance(e), nt = daysUntil(e.date) < 0 ? ccNote(e) : null, rd = !nt ? ccReadiness(e) : null; return `<div class="item cc-line" style="--c:${M(e.matiere).couleur}"><span class="badge" style="background:color-mix(in srgb,${M(e.matiere).couleur} 15%,var(--surface));color:${M(e.matiere).couleur};font-size:.66rem">${fmtDate(e.date).split(" ").slice(1).join(" ")}</span><div class="sp"><b>${esc(M(e.matiere).court)}</b> — ${esc(e.titre)} <span class="chip gr">${esc(fmtPoids(e.poids))}</span>${e.type === "2e" ? ' <span class="chip wa">2e chance</span>' : ""}${e.statut && e.poids !== "à confirmer" ? ` <span class="chip wa">${e.statut === "provisoire" ? "date provisoire" : "à confirmer"}</span>` : ""}${rd ? ` <span class="chip ${rd.filled ? pctCls(rd.pct) : rd.tier.cls}" title="Préparation sur les séances au programme">${rd.filled ? `${rd.pct}% connu` : `${rd.rating} Elo`}</span>` : ""}<div class="tiny muted">${fmtLong(e.date)} · ${esc(e.detail)}</div></div>${nt ? ccNoteChip(nt) : `<span class="count small muted">${daysUntil(e.date) >= 0 ? "J-" + daysUntil(e.date) : "passé"}</span>`}${sc ? `<a class="btn sm ghost" href="#/m/${e.matiere}" aria-label="Voir la matière">${icon("book")}</a>` : ""}<button type="button" class="btn sm ghost" data-a="editcc" data-id="${esc(e.id)}" aria-label="Modifier ${esc(e.titre)}">${icon("edit")}</button><button type="button" class="btn sm ghost" data-a="delcc" data-id="${esc(e.id)}" aria-label="Supprimer ${esc(e.titre)}">✕</button></div>`; };
  return {
    html: `<h1>Calendrier</h1>
    ${ccLinkHtml()}${ccSuggestionsHtml()}
    <div class="row" style="margin:6px 0 14px"><button class="btn sm" data-a="calprev" aria-label="Mois précédent">${icon("back")}</button><b style="min-width:150px;text-align:center;text-transform:capitalize">${monthName}</b><button class="btn sm" data-a="calnext" aria-label="Mois suivant">${icon("arrow")}</button><button class="btn sm ghost" data-a="caltoday">Aujourd'hui</button><div class="sp"></div><label class="row small"><input type="checkbox" data-a="calses" ${calState.calSeances ? "checked" : ""}> Afficher les séances</label><button class="btn sm" data-a="ics">${icon("dl")}Export .ics</button></div>
    <div class="cal">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells}</div>
    <div class="row" style="align-items:center;margin:0"><h2 style="margin:0">À venir</h2><div class="sp"></div><button type="button" class="btn sm pri" data-a="addcc" aria-label="Ajouter une échéance">+</button></div>
    <div class="card list">${upcoming.map(line).join("") || '<div class="empty">Rien à venir.</div>'}</div>
    ${D.cal.remarques.length ? `<div class="warn prose" style="margin-top:14px;padding:12px 16px"><b>À compléter —</b><ul>${D.cal.remarques.map((r) => `<li><b>${esc(M(r.matiere).court)}</b> : ${esc(r.texte)}</li>`).join("")}</ul></div>` : ""}
    ${past.length ? `<details><summary>Épreuves passées (${past.length})</summary><div class="list">${past.map(line).join("")}</div></details>` : ""}`,
  };
}

export function icsExport() {
  const pad = (n) => String(n).padStart(2, "0");
  const ev = D.cal.evenements.map((e) => { const d = parseDay(e.date), n = new Date(d.getTime() + 864e5); const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`; return ["BEGIN:VEVENT", `UID:${e.id}@revisions-${SET().slug}`, `DTSTAMP:${f(new Date())}T000000Z`, `DTSTART;VALUE=DATE:${f(d)}`, `DTEND;VALUE=DATE:${f(n)}`, `SUMMARY:${M(e.matiere).court} — ${e.titre} (${e.poids})`, `DESCRIPTION:${e.detail.replace(/[,;]/g, " ")}`, "END:VEVENT"].join("\r\n"); });
  download(`calendrier-CC-${SET().slug}.ics`, ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//Revisions ${SET().slug}//FR`, ...ev, "END:VCALENDAR"].join("\r\n"), "text/calendar");
}
