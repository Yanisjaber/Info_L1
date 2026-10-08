import { icon } from "../../core/components/icons.js";
import { D } from "../../core/services/app-data.js";
import { sync, todayKey } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { plural } from "../../core/utils/format.js";
import { SET } from "../settings/settings.js";
import { edtCard } from "./edt.components.js";
import { edtViewState } from "./edt.store.js";
import { EDT_HOUR_PX, edtLabel, edtOf, mondayOf, toMin } from "./edt.utils.js";

export function edt() {
  if (!D.edt.events.length) {
    if (!sync.user) return { html: `<h1>Emploi du temps</h1><div class="empty">Connecte-toi pour importer ton emploi du temps.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
    return {
      html: `<h1>Emploi du temps</h1><div class="empty">Aucun emploi du temps importé.<div style="margin-top:10px"><a class="btn pri" href="#/compte">${icon("dl")}Importer mon EDT</a></div></div>
      <div class="row" style="margin-top:14px"><h3 style="margin:0">Ou ajoute un créneau à la main</h3><div class="sp"></div><button type="button" class="btn sm pri" data-a="addedt" aria-label="Ajouter un créneau">+</button></div>`,
    };
  }
  if (!edtViewState.edtWeek) edtViewState.edtWeek = mondayOf(new Date());
  const now = new Date(), today = todayKey();
  const days = [...Array(7)].map((_, i) => { const d = new Date(edtViewState.edtWeek); d.setDate(d.getDate() + i); return d; });
  const shown = days.slice(5).some((d) => edtOf(todayKey(d)).length) ? days : days.slice(0, 5);
  const fd = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const fs = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

  const byDay = shown.map((d) => { const iso = todayKey(d), evs = edtOf(iso); return { d, iso, all: evs.filter((e) => e.allday), tm: evs.filter((e) => !e.allday) }; });
  const timedAll = byDay.flatMap((x) => x.tm);
  const dayStart = timedAll.length ? Math.min(8, ...timedAll.map((e) => Math.floor(toMin(e.s) / 60))) : 8;
  const dayEnd = timedAll.length ? Math.max(19, ...timedAll.map((e) => Math.ceil(toMin(e.e) / 60))) : 19;
  const spanMin = (dayEnd - dayStart) * 60, gridH = (dayEnd - dayStart) * EDT_HOUR_PX;
  const hours = [...Array(dayEnd - dayStart + 1)].map((_, i) => dayStart + i);

  // Assigne une "voie" à chaque créneau pour gérer les chevauchements horaires
  const lanes = (tm) => {
    const sorted = [...tm].sort((a, b) => toMin(a.s) - toMin(b.s));
    const active = [];
    const placed = sorted.map((e) => {
      const s = toMin(e.s), en = toMin(e.e);
      for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= s) active.splice(i, 1);
      const used = new Set(active.map((a) => a.lane));
      let lane = 0; while (used.has(lane)) lane++;
      active.push({ end: en, lane });
      return { e, lane };
    });
    const laneCount = Math.max(1, ...placed.map((x) => x.lane + 1));
    return placed.map(({ e, lane }) => ({ e, lane, laneCount }));
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayCol = ({ iso, tm, all }) => {
    const evHtml = lanes(tm).map(({ e, lane, laneCount }) => {
      const s = toMin(e.s), en = Math.max(toMin(e.e), s + 15);
      const top = ((s - dayStart * 60) / spanMin) * 100, h = ((en - s) / spanMin) * 100;
      const w = 100 / laneCount;
      return edtCard(e, now, top, h, lane * w, w, ((en - s) / 60) * EDT_HOUR_PX);
    }).join("");
    const nowLine = iso === today && nowMin >= dayStart * 60 && nowMin <= dayEnd * 60
      ? `<div class="edt-now" style="top:${((nowMin - dayStart * 60) / spanMin) * 100}%"></div>` : "";
    const empty = !tm.length && !all.length ? `<div class="tiny muted edt-empty">Libre</div>` : "";
    return `<div class="edt-gcol${iso === today ? " today" : ""}" style="height:${gridH}px">${empty}${evHtml}${nowLine}</div>`;
  };

  const heads = byDay.map(({ d, iso, all }) => `<div class="edt-gh${iso === today ? " today" : ""}"><h3>${fd.format(d)}</h3>${all.map((e) => `<span class="chip gr">${esc(edtLabel(e))}</span>`).join("")}</div>`).join("");
  const cols = byDay.map(dayCol).join("");
  const axisLabels = hours.map((h) => `<span style="top:${((h - dayStart) / (dayEnd - dayStart)) * 100}%">${h} h</span>`).join("");

  const wkEv = timedAll;
  const hrs = wkEv.reduce((a, e) => a + (toMin(e.e) - toMin(e.s)) / 60, 0);

  return {
    html: `<h1>Emploi du temps</h1>
    <div class="row" style="margin:6px 0 14px"><button class="btn sm" data-a="edtprev" aria-label="Semaine précédente">${icon("back")}</button><b style="min-width:170px;text-align:center">${fs.format(shown[0])} – ${fs.format(shown[shown.length - 1])}</b><button class="btn sm" data-a="edtnext" aria-label="Semaine suivante">${icon("arrow")}</button><button class="btn sm ghost" data-a="edttoday">Aujourd'hui</button><div class="sp"></div><span class="tiny muted">${plural(wkEv.length, "créneau", "créneaux")} · ${String(Math.round(hrs * 10) / 10).replace(".", ",")} h dans la semaine</span><button type="button" class="btn sm pri" data-a="addedt" aria-label="Ajouter un créneau">+</button></div>
    <div class="edt-wrap"><div class="edt-inner" style="--n:${shown.length};--hpx:${EDT_HOUR_PX}px">
      <div class="edt-corner"></div>${heads}
      <div class="edt-axis" style="height:${gridH}px">${axisLabels}</div>${cols}
    </div></div>
    <p class="tiny muted" style="margin-top:14px">${esc(SET().edtFootnote).replace("{source}", () => esc(D.edt.source || ""))}</p>`,
  };
}
