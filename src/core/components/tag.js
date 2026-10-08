import { M } from "../services/app-data.js";
import { esc } from "../utils/dom.js";

export const tag = (mid) => `<span class="chip" style="--acc:${M(mid).couleur}"><i class="dot" style="--c:${M(mid).couleur}"></i>${esc(M(mid).court)}</span>`;
