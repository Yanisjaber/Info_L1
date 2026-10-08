import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { D } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { deleteItem } from "../../core/services/items.service.js";
import { saveResult } from "../../core/services/results.service.js";
import { bump, commit, setEntry, state } from "../../core/services/store.js";
import { $$, esc } from "../../core/utils/dom.js";
import { codeResultHtml, texteResultHtml } from "./exercices.components.js";
import { autoMark } from "./exercices.session.js";
import { exoState } from "./exercices.store.js";
import { checkTextAnswer, expectedAnswers } from "./exercices.utils.js";
import { rerenderKeep } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const exercicesActions = {
  click: {
    runcode: async (t, e) => {
      const id = t.dataset.id, exo = D.E.find((x) => x.id === id);
      if (!exo) return;
      const ta = document.querySelector(`textarea[data-code-id="${id}"]`);
      const code = ta ? ta.value : (state.reponses[id]?.value ?? exo.codeStarter ?? "");
      setEntry("reponses", id, { value: code });
      commit();
      const resEl = document.getElementById(`pyres-${id}`);
      if (resEl) resEl.innerHTML = '<p class="tiny muted" style="margin-top:8px">Chargement de Python (~10 Mo au premier lancement)…</p>';
      t.disabled = true;
      try {
        const { runPythonExercise } = await import("./pyrun.js");
        const r = await runPythonExercise(code, exo.codeTests);
        exoState.codeResults[id] = r;
        if (resEl) resEl.innerHTML = codeResultHtml(r);
        const ran = r.results.length || r.error;
        if (ran) await autoMark(id, !r.error && r.results.every((x) => x.ok));
      } catch (err) {
        if (resEl) resEl.innerHTML = `<div class="warn prose" style="padding:8px 12px;margin-top:8px">Erreur de chargement de Python : ${esc(err.message)}</div>`;
      }
      t.disabled = false;
    },
    checktexte: async (t, e) => {
      const id = t.dataset.id, exo = D.E.find((x) => x.id === id);
      if (!exo) return;
      const answers = expectedAnswers(exo);
      const inputs = $$(`input[data-texte-id="${id}"]`).sort((x, y) => (+x.dataset.texteIdx || 0) - (+y.dataset.texteIdx || 0));
      const values = inputs.map((inp) => inp.value);
      const oks = answers.map((a, i) => checkTextAnswer(values[i] ?? "", a));
      const ok = answers.length > 0 && oks.every(Boolean);
      setEntry("reponses", id, { values, oks, ok });
      commit();
      const resEl = document.getElementById(`txres-${id}`);
      if (resEl) resEl.innerHTML = texteResultHtml(oks);
      await autoMark(id, ok);
    },
    exo: async (t, e) => { state.exos[t.dataset.id] = { v: t.dataset.v, ts: Date.now() }; await saveResult("exercice", t.dataset.id, { v: t.dataset.v }); bump(2, "exercice"); commit(); toast(t.dataset.v === "ok" ? "Bien joué" : "Noté à refaire"); },
    toggleexo: async (t, e) => { exoState.openExoId = exoState.openExoId === t.dataset.id ? null : t.dataset.id; rerenderKeep(); },
    delexo: async (t, e) => { if (await appConfirm("Supprimer cet exercice ?")) { await deleteItem("exercice", t.dataset.id); toast("Exercice supprimé"); await loadData(); location.hash = `#/ax/${t.dataset.mid}`; } },
  },
  rules: [
    {
      match: (t, a) => t.dataset.codeId,
      run: (t, e, a) => { setEntry("reponses", t.dataset.codeId, { value: t.value }); commit(); return; },
    },
    {
      match: (t, a) => t.dataset.texteId,
      run: (t, e, a) => {
        const id = t.dataset.texteId, idx = +t.dataset.texteIdx || 0, cur = state.reponses[id] || {};
        const values = [...(cur.values || [])]; values[idx] = t.value;
        setEntry("reponses", id, { values, oks: cur.oks });
        commit();
        return;
      },
    },
  ],
};
