// Champs numériques de toute l'appli : les petites flèches natives du navigateur (moches, hors thème) sont cachées en CSS
// et remplacées par deux boutons « + / − » aux couleurs du thème. Rien à câbler à la main : `initNumberInputs()` surveille
// la page et équipe chaque `<input type="number">` qui apparaît, sans exception.

const decimals = (x) => (String(x).split(".")[1] || "").length;

// Ajoute `dir` (+1 / −1) fois le pas, en gardant la valeur dans [min, max] et sans erreur d'arrondi (0,1 + 0,2…).
function bump(input, dir) {
  if (input.disabled || input.readOnly) return;
  const step = parseFloat(input.step) > 0 ? parseFloat(input.step) : 1;
  const min = input.min !== "" ? parseFloat(input.min) : -Infinity, max = input.max !== "" ? parseFloat(input.max) : Infinity;
  const cur = parseFloat(input.value);
  let v = Number.isNaN(cur) ? (dir > 0 ? Math.max(min, 0) : Math.min(max, 0)) : cur + dir * step;
  v = Math.min(max, Math.max(min, v));
  input.value = String(+v.toFixed(Math.max(decimals(step), decimals(cur) || 0)));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function upgrade(input) {
  if (input.dataset.stepper) return;
  input.dataset.stepper = "1";
  const wrap = document.createElement("span");
  wrap.className = "num";
  // Un style en ligne sur le champ (largeur, flex, marges…) concerne en fait sa place dans la page : il passe au conteneur.
  const st = input.getAttribute("style");
  if (st) { wrap.style.cssText = st; input.removeAttribute("style"); input.style.width = "100%"; }
  input.replaceWith(wrap);
  wrap.append(input);
  wrap.insertAdjacentHTML("beforeend", '<span class="num-steps"><button type="button" tabindex="-1" class="up" aria-label="Augmenter"></button><button type="button" tabindex="-1" class="down" aria-label="Diminuer"></button></span>');
  // Clic = un pas ; maintenir appuyé = répétition (comme les flèches natives).
  let t1, t2;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  wrap.querySelector(".num-steps").addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    e.preventDefault(); // le champ garde le focus
    const dir = b.classList.contains("up") ? 1 : -1;
    bump(input, dir);
    t1 = setTimeout(() => { t2 = setInterval(() => bump(input, dir), 70); }, 420);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => wrap.querySelector(".num-steps").addEventListener(ev, stop));
}

const scan = (root) => root.querySelectorAll?.('input[type="number"]').forEach(upgrade);

export function initNumberInputs() {
  scan(document);
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches?.('input[type="number"]')) upgrade(n);
    scan(n);
  }))).observe(document.body, { childList: true, subtree: true });
}
