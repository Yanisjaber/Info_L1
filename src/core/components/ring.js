export const ring = (v, c) => `<div class="ring" style="--v:${v};${c ? "--acc:" + c : ""}" data-t="${v}%"></div>`;
