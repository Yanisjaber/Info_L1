import { C } from "../../core/services/app-data.js";
import { esc } from "../../core/utils/dom.js";

export const TA_STYLE = "width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font:.88rem/1.5 ui-monospace,monospace";

export function seanceOptions(mid, selected) {
  return `<option value="">—</option>${C(mid).seances.map((s) => `<option value="${s.id}" ${selected === s.id ? "selected" : ""}>${s.type} ${s.numero} — ${esc(s.titre)}</option>`).join("")}`;
}

export function strip(s) { return String(s || "").replace(/<[^>]+>/g, ""); }
