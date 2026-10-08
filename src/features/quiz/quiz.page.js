import { icon } from "../../core/components/icons.js";
import { NIV_LABEL, matCardsHtml, seanceChips } from "../../core/components/setup-pickers.js";
import { tag } from "../../core/components/tag.js";
import { toast } from "../../core/components/toast.js";
import { M, sKey, seanceOf } from "../../core/services/app-data.js";
import { dataState } from "../../core/services/app-data.store.js";
import { $, esc } from "../../core/utils/dom.js";
import { fmt1, fmtMMSS, plural, shuffle } from "../../core/utils/format.js";
import { bindTicket, quizTicketHtml } from "./quiz.components.js";
import { finishQuiz, startQuiz } from "./quiz.session.js";
import { quizState } from "./quiz.store.js";
import { okQ, poolQ } from "./quiz.utils.js";
import { routerState } from "../../routing/router.store.js";

export function quizSetup(q) {
  const selM = new Set(q.m ? q.m.split(",") : dataState.IDS);
  const selS = new Set(q.s && q.m ? q.s.split(",").map((s) => sKey(q.m, s)) : []);
  const statut = ["wrong", "ok"].includes(q.statut) ? q.statut : "";
  return {
    html: `<h1>QCM</h1><p class="muted">Entraîne-toi avec correction immédiate, ou passe en mode « examen » (correction à la fin).</p>
    <form class="card" id="qf" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><label>Matières <span class="tiny">(plusieurs possibles)</span></label>${matCardsHtml(selM)}</div>
      ${quizTicketHtml(statut)}
      <div class="row"><button class="btn pri" type="submit">Commencer</button><span class="muted small" id="pc"></span></div></form>`,
    after: (el) => {
      const f = $("#qf", el);
      routerState.cleanup = bindTicket(el);
      const vals = () => { const fd = new FormData(f); return { mids: fd.getAll("m"), sids: new Set(fd.getAll("s")), niv: new Set(fd.getAll("n").map(Number)), statut: fd.get("statut") || "", cnt: +fd.get("cnt"), mode: fd.get("mode") }; };
      const updTicket = (v) => {
        $("#tk-nb", el).textContent = `${v.cnt === 0 ? "Toutes" : v.cnt} questions`;
        $("#tk-niv", el).textContent = v.niv.size === 3 ? "tous niveaux" : v.niv.size ? [...v.niv].sort().map((n) => NIV_LABEL[n]).join(" + ") : "aucun niveau";
        $("#tk-sc", el).textContent = v.sids.size ? plural(v.sids.size, "séance") : "toutes les séances";
        $("#tk-mode", el).textContent = v.mode === "exam" ? "Examen" : "Entraînement";
        $("#tk-hist", el).textContent = v.statut === "wrong" ? "historique : ratées" : v.statut === "ok" ? "historique : réussies" : "historique : toutes";
      };
      const upd = () => { const v = vals(); updTicket(v); $("#pc", el).textContent = `${poolQ(v).length} questions disponibles`; };
      f.addEventListener("change", (e) => {
        if (e.target.name === "m") { const cur = new Set(new FormData(f).getAll("s")); $("#sc", el).innerHTML = seanceChips(new FormData(f).getAll("m"), cur); }
        upd();
      });
      $("#sc", el).innerHTML = seanceChips([...selM], selS);
      f.addEventListener("submit", (e) => {
        e.preventDefault(); const v = vals(); let pool = poolQ(v);
        if (!pool.length) return toast("Aucune question avec ces critères.");
        pool = shuffle(pool); if (v.cnt) pool = pool.slice(0, v.cnt);
        startQuiz(pool, { mode: v.mode, title: v.statut === "wrong" ? "Mes erreurs" : v.statut === "ok" ? "Mes réussites" : "QCM", mid: null });
      });
      upd();
    },
  };
}

export function quizView() {
  if (quizState.Q.done) return quizResult();
  const x = quizState.Q.qs[quizState.Q.i], q = x.q, m = M(q.mid), n = quizState.Q.qs.length, exam = quizState.Q.mode === "exam";
  const multi = q.type === "multiple";
  const rev = x.checked;
  const letters = "ABCDE";
  const choices = x.order.map((oi, pos) => {
    const sel = x.ans.has(oi), good = q.rep.includes(oi);
    const cls = rev ? (good && sel ? "good" : good ? "miss" : sel ? "bad" : "") : sel ? "sel" : "";
    return `<button type="button" class="choice ${cls}" data-a="choose" data-i="${oi}" data-multi="${multi ? 1 : 0}" ${rev ? "disabled" : ""} role="${multi ? "checkbox" : "radio"}" aria-checked="${sel}"><span class="k">${letters[pos]}</span><span>${q.choix[oi]}</span></button>`;
  }).join("");
  const grid = exam ? `<div class="qgrid" aria-label="Navigation entre questions">${quizState.Q.qs.map((y, k) => `<button data-a="goto" data-i="${k}" class="${k === quizState.Q.i ? "cur" : ""} ${y.ans.size ? "done" : ""} ${y.flag ? "flag" : ""}" aria-label="Question ${k + 1}">${k + 1}</button>`).join("")}</div>` : "";
  const good = okQ(x);
  const expl = rev ? `<div class="expl ${good ? "ok" : "ko"}"><b>${good ? "Bonne réponse." : "Pas tout à fait."}</b> ${q.expl}</div>` : "";
  const last = quizState.Q.i === n - 1;
  return {
    html: `<div class="qhead"><div class="crumbs" style="margin:0"><a href="#/qcm">← Quitter</a></div><div class="sp"></div>${quizState.Q.timed ? `<span class="timer" id="tm" aria-live="off">--:--</span>` : ""}<span class="chip gr">${quizState.Q.i + 1} / ${n}</span></div>
    <div class="bar" style="margin-bottom:14px"><i style="width:${((quizState.Q.i + (rev ? 1 : 0)) / n) * 100}%"></i></div>
    <div class="card"><div class="row" style="margin-bottom:4px">${tag(q.mid)}<span class="chip gr">${seanceOf(q.mid, q.seance).type} ${seanceOf(q.mid, q.seance).numero}</span>${multi ? '<span class="chip wa">plusieurs réponses</span>' : ""}<span class="chip gr">${["", "base", "moyen", "difficile"][q.niveau]}</span></div>
      <div class="qtext">${q.q}</div><div role="${multi ? "group" : "radiogroup"}">${choices}</div>${expl}
      <div class="row" style="margin-top:18px">
        ${exam ? `<button class="btn sm ghost" data-a="flag">${icon("flag")}${x.flag ? "Retirer le repère" : "Marquer"}</button>` : ""}
        <button class="btn" data-a="prev" ${quizState.Q.i === 0 ? "disabled" : ""}>${icon("back")}Précédent</button><div class="sp"></div>
        ${exam ? (last ? `<button class="btn pri" data-a="finish">Terminer l'épreuve</button>` : `<button class="btn pri" data-a="next">Suivante ${icon("arrow")}</button>`)
          : rev ? (last ? `<button class="btn pri" data-a="finish">Voir le bilan</button>` : `<button class="btn pri" data-a="next">Suivante ${icon("arrow")}</button>`)
          : `<button class="btn pri" data-a="check" ${x.ans.size ? "" : "disabled"}>Valider</button>`}
      </div></div>
    ${exam ? `<div class="card" style="margin-top:14px"><div class="row" style="margin-bottom:8px"><b>Questions</b><span class="muted small">${quizState.Q.qs.filter((y) => y.ans.size).length}/${n} répondues</span><div class="sp"></div><button class="btn sm" data-a="finish">Terminer</button></div>${grid}</div>` : ""}`,
    after: (el) => {
      if (quizState.Q.timed) {
        const tick = () => { const left = quizState.Q.deadline - Date.now(); const t = $("#tm"); if (t) { t.textContent = fmtMMSS(left); t.classList.toggle("low", left < 60000); } if (left <= 0) { finishQuiz(true); } };
        tick(); const id = setInterval(tick, 500); routerState.cleanup = () => clearInterval(id);
      }
    },
  };
}

function quizResult() {
  const n = quizState.Q.qs.length, ok = quizState.Q.ok, s20 = (ok / n) * 20, exam = quizState.Q.mode === "exam";
  const dur = Math.round((quizState.Q.end - quizState.Q.start) / 1000);
  const by = {}; quizState.Q.qs.forEach((x) => { const k = sKey(x.q.mid, x.q.seance); const s = by[k] || (by[k] = [0, 0]); s[1]++; if (okQ(x)) s[0]++; });
  const wrong = quizState.Q.qs.filter((x) => !okQ(x));
  const msg = s20 >= 16 ? "Excellent." : s20 >= 12 ? "Solide, quelques points à consolider." : s20 >= 10 ? "Tu passes, mais fragile : reprends les erreurs." : "À retravailler : relis les cours liés aux erreurs ci-dessous.";
  return {
    html: `<h1>${esc(quizState.Q.title)} — bilan</h1>${quizState.Q.timeout ? '<div class="warn prose" style="padding:10px 14px"><b>Temps écoulé —</b> l\'épreuve a été rendue automatiquement.</div>' : ""}
    <div class="card row" style="gap:26px;margin:14px 0"><div><div class="score">${fmt1(s20)}<span class="muted" style="font-size:1.2rem"> / 20</span></div><div class="muted">${ok} / ${n} bonnes réponses · ${Math.floor(dur / 60)} min ${dur % 60} s</div></div><div class="sp"><b>${msg}</b>
      <div class="small muted" style="margin-top:6px">${Object.entries(by).map(([k, v]) => { const [mm, ss] = k.split("/"); const se = seanceOf(mm, ss); return `${esc(M(mm).court)} ${se.type} ${se.numero} : ${v[0]}/${v[1]}`; }).join(" · ")}</div></div></div>
    <div class="row"><button class="btn pri" data-a="retry" ${wrong.length ? "" : "disabled"}>Refaire mes ${wrong.length} erreurs</button><a class="btn" href="#/qcm">Nouvelle session</a><a class="btn ghost" href="#/">Accueil</a></div>
    <h2>Correction</h2>${quizState.Q.qs.map((x, k) => { const q = x.q, good = okQ(x); const se = seanceOf(q.mid, q.seance); return `<div class="card" style="margin:12px 0"><div class="row"><span class="chip ${good ? "ok" : "ko"}">${good ? "juste" : x.ans.size ? "faux" : "sans réponse"}</span>${tag(q.mid)}<a class="small" href="#/c/${q.mid}/${q.seance}">${se.type} ${se.numero} — voir le cours</a><div class="sp"></div><span class="tiny muted">Q${k + 1}</span></div><div class="qtext" style="font-size:1rem">${q.q}</div>
      ${x.order.map((oi, pos) => { const sel = x.ans.has(oi), g = q.rep.includes(oi); return `<div class="choice ${g && sel ? "good" : g ? "miss" : sel ? "bad" : ""}" style="cursor:default" data-multi="${q.type === "multiple" ? 1 : 0}"><span class="k">${"ABCDE"[pos]}</span><span>${q.choix[oi]}</span></div>`; }).join("")}
      <div class="expl ${good ? "ok" : "ko"}">${q.expl}</div></div>`; }).join("")}`,
  };
}
