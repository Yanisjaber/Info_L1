// Bandeau de confirmation intégré à l'app (jamais la popup native confirm() du navigateur,
// qui détonne visuellement et bloque toute automatisation). Résout true/false selon le choix.
export function appConfirm(message) {
  return new Promise((resolve) => {
    document.querySelectorAll(".confirm-bar").forEach((b) => b.remove());
    const bar = document.createElement("div");
    bar.className = "confirm-bar";
    bar.setAttribute("role", "alertdialog");
    const span = document.createElement("span");
    span.textContent = message;
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn sm"; cancelBtn.type = "button"; cancelBtn.textContent = "Annuler";
    const okBtn = document.createElement("button");
    okBtn.className = "btn sm pri"; okBtn.type = "button"; okBtn.textContent = "Confirmer";
    const row = document.createElement("div");
    row.className = "row"; row.style.gap = "8px"; row.style.flexShrink = "0";
    row.append(cancelBtn, okBtn);
    bar.append(span, row);
    document.body.appendChild(bar);
    okBtn.focus();
    const done = (val) => { bar.remove(); resolve(val); };
    cancelBtn.addEventListener("click", () => done(false));
    okBtn.addEventListener("click", () => done(true));
  });
}
