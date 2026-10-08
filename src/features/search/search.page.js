import { tag } from "../../core/components/tag.js";
import { C, D } from "../../core/services/app-data.js";
import { dataState } from "../../core/services/app-data.store.js";
import { $, esc } from "../../core/utils/dom.js";
import { plural } from "../../core/utils/format.js";

export const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function buildIndex() {
  if (D.idx) return D.idx;
  const out = [];
  dataState.IDS.forEach((mid) => C(mid).seances.forEach((s) => { const t = document.createElement("div"); t.innerHTML = s.contenu || ""; out.push({ kind: "Cours", mid, sid: s.id, title: `${s.type} ${s.numero} — ${s.titre}`, text: t.textContent.replace(/\s+/g, " ") }); }));
  D.F.forEach((f) => out.push({ kind: "Carte", mid: f.mid, sid: f.seance, title: f.recto.replace(/<[^>]+>/g, ""), text: f.verso.replace(/<[^>]+>/g, "") }));
  D.E.forEach((e) => out.push({ kind: "Exercice", mid: e.mid, sid: e.seance, title: e.titre.replace(/<[^>]+>/g, ""), text: e.enonce.replace(/<[^>]+>/g, " "), ex: e.id }));
  out.forEach((o) => (o.n = norm(o.title + " " + o.text)));
  return (D.idx = out);
}

export async function search(qs) {
  const idx = await buildIndex(), terms = norm(qs).split(/\s+/).filter(Boolean);
  const res = terms.length ? idx.map((o) => ({ o, sc: terms.every((t) => o.n.includes(t)) ? terms.reduce((a, t) => a + (norm(o.title).includes(t) ? 5 : 1) + (o.n.split(t).length - 1), 0) : 0 })).filter((x) => x.sc).sort((a, b) => b.sc - a.sc).slice(0, 40) : [];
  const snip = (o) => { const i = o.n.indexOf(terms[0]); const t = o.text.replace(/\\[()\[\]]/g, ""); if (i < 0) return esc(t.slice(0, 120)); const a = Math.max(0, i - 50); return (a ? "…" : "") + esc(t.slice(a, a + 160)) + "…"; };
  return { html: `<h1>Recherche</h1><form class="row" id="sf2" style="margin-bottom:14px"><input type="text" name="q" value="${esc(qs)}" placeholder="ex. contraposée, pipe, dérivée…" style="max-width:420px"><button class="btn pri">Chercher</button></form>
    ${terms.length ? `<p class="muted">${plural(res.length, "résultat")} pour « ${esc(qs)} »</p>` : ""}<div class="card list">${res.map(({ o }) => `<a class="item" href="${o.ex ? `#/m/${o.mid}/exos?s=${o.sid}` : `#/c/${o.mid}/${o.sid}`}"><span class="badge" style="font-size:.62rem">${o.kind}</span><div class="sp"><b>${esc(o.title)}</b><div class="tiny muted">${tag(o.mid)} ${snip(o)}</div></div></a>`).join("") || (terms.length ? '<div class="empty">Rien trouvé.</div>' : '<div class="empty">Tape un mot pour chercher dans tous les cours, cartes et exercices.</div>')}</div>`,
    after: (el) => $("#sf2", el).addEventListener("submit", (e) => { e.preventDefault(); location.hash = "#/search?q=" + encodeURIComponent(e.target.q.value.trim()); }) };
}
