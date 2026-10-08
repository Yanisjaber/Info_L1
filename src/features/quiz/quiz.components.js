import { $, $$ } from "../../core/utils/dom.js";

// Barre d'outils pour les réglages secondaires : chaque bouton ouvre un petit menu flottant
// par-dessus la page (voir bindTicket) au lieu d'empiler niveau/nombre/mode/historique en
// permanence — la pile de rangées de pastilles identiques était justement ce qui rendait l'écran
// illisible. Le menu vit À L'INTÉRIEUR du bouton (nécessaire pour la fermeture au clic extérieur
// en CSS-free), donc bindTicket doit ignorer les clics qui viennent du menu lui-même.
export function quizTicketHtml(statut) {
  const btn = (edit, icon, id) => `<button type="button" class="tbbtn" data-edit="${edit}"><span class="ic">${icon}</span><span class="v" id="${id}"></span>`;
  return `<div class="tb" id="qtk">
      ${btn("nb", "🔢", "tk-nb")}
        <div class="pop" data-panel="nb"><div class="poplist">
          <label><input type="radio" name="cnt" value="10"><span>10</span></label>
          <label><input type="radio" name="cnt" value="20" checked><span>20</span></label>
          <label><input type="radio" name="cnt" value="30"><span>30</span></label>
          <label><input type="radio" name="cnt" value="50"><span>50</span></label>
          <label><input type="radio" name="cnt" value="0"><span>Toutes</span></label>
        </div></div>
      </button>
      ${btn("niv", "📶", "tk-niv")}
        <div class="pop" data-panel="niv"><div class="poplist">
          <label><input type="checkbox" name="n" value="1" checked><span>Base</span></label>
          <label><input type="checkbox" name="n" value="2" checked><span>Moyen</span></label>
          <label><input type="checkbox" name="n" value="3" checked><span>Difficile</span></label>
        </div></div>
      </button>
      ${btn("sc", "📚", "tk-sc")}
        <div class="pop" data-panel="sc"><div class="tiny muted" style="margin-bottom:6px">Aucune coche = toutes les séances</div><div id="sc"></div></div>
      </button>
      ${btn("mode", "🎯", "tk-mode")}
        <div class="pop" data-panel="mode"><div class="poplist">
          <label><input type="radio" name="mode" value="train" checked><span>Entraînement — correction immédiate</span></label>
          <label><input type="radio" name="mode" value="exam"><span>Examen — correction à la fin</span></label>
        </div></div>
      </button>
      ${btn("hist", "🕘", "tk-hist")}
        <div class="pop" data-panel="hist"><div class="poplist">
          <label><input type="radio" name="statut" value="" ${statut === "" ? "checked" : ""}><span>Toutes les questions</span></label>
          <label><input type="radio" name="statut" value="wrong" ${statut === "wrong" ? "checked" : ""}><span>Seulement ratées la dernière fois</span></label>
          <label><input type="radio" name="statut" value="ok" ${statut === "ok" ? "checked" : ""}><span>Seulement réussies la dernière fois</span></label>
        </div></div>
      </button>
    </div>`;
}

// Un seul menu ouvert à la fois ; un clic sur son propre bouton ou ailleurs sur la page le referme.
// Renvoie la fonction de nettoyage à affecter à `cleanup` (écouteur document à retirer à la navigation).
export function bindTicket(el) {
  $$(".tbbtn", el).forEach((b) => b.addEventListener("click", (e) => {
    if (e.target.closest(".pop")) return; // clic sur une option du menu : ne pas le refermer
    const panel = $(`.pop[data-panel="${b.dataset.edit}"]`, el);
    const wasOpen = panel.dataset.open === "true";
    $$(".pop", el).forEach((p) => delete p.dataset.open);
    $$(".tbbtn", el).forEach((c) => c.setAttribute("aria-expanded", "false"));
    if (!wasOpen) { panel.dataset.open = "true"; b.setAttribute("aria-expanded", "true"); }
  }));
  const onDocClick = (e) => { if (!e.target.closest(".tb")) { $$(".pop", el).forEach((p) => delete p.dataset.open); $$(".tbbtn", el).forEach((c) => c.setAttribute("aria-expanded", "false")); } };
  document.addEventListener("click", onDocClick);
  return () => document.removeEventListener("click", onDocClick);
}
