export function cardsTicketHtml(mode) {
  return `<div class="tb" id="ctk">
      <button type="button" class="tbbtn" data-edit="mode"><span class="ic">🔁</span><span class="v" id="tk-cmode"></span>
        <div class="pop" data-panel="mode"><div class="poplist">
          <label><input type="radio" name="mode" value="due" ${mode !== "new" && mode !== "all" ? "checked" : ""}><span>À revoir + nouvelles</span></label>
          <label><input type="radio" name="mode" value="new" ${mode === "new" ? "checked" : ""}><span>Nouvelles seulement</span></label>
          <label><input type="radio" name="mode" value="all" ${mode === "all" ? "checked" : ""}><span>Toutes (révision libre)</span></label>
        </div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="cnt"><span class="ic">🔢</span><span class="v" id="tk-ccnt"></span>
        <div class="pop" data-panel="cnt"><div class="poplist">
          <label><input type="radio" name="cnt" value="10"><span>10</span></label>
          <label><input type="radio" name="cnt" value="20" checked><span>20</span></label>
          <label><input type="radio" name="cnt" value="40"><span>40</span></label>
          <label><input type="radio" name="cnt" value="0"><span>Toutes</span></label>
        </div></div>
      </button>
      <button type="button" class="tbbtn" data-edit="sc"><span class="ic">📚</span><span class="v" id="tk-csc"></span>
        <div class="pop" data-panel="sc"><div class="tiny muted" style="margin-bottom:6px">Aucune coche = toutes les séances</div><div id="sc"></div></div>
      </button>
    </div>`;
}
