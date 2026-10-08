import { D } from "../../core/services/app-data.js";
import { DEFAULT_SETTINGS } from "./settings.defaults.js";

// Réglages de l'utilisateur courant (D.settings, chargés depuis la base), complétés par les
// valeurs de repli pour tout champ absent.
export const SET = () => D.settings || DEFAULT_SETTINGS;

export const mergeSettings = (cfg) => {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const arr = (k) => (Array.isArray(c[k]) && c[k].length ? c[k] : DEFAULT_SETTINGS[k]);
  return {
    ...DEFAULT_SETTINGS, ...c,
    seanceTypes: arr("seanceTypes"), edtTypes: arr("edtTypes"),
    ics: { ...DEFAULT_SETTINGS.ics, ...(c.ics || {}), types: Array.isArray(c.ics?.types) ? c.ics.types : DEFAULT_SETTINGS.ics.types },
  };
};

// ---- types de séance (CM / TD / TP…) ----
export const seanceTypes = () => SET().seanceTypes;
export const typeLabel = (id) => seanceTypes().find((t) => t.id === id)?.label || id;

// Range des éléments en colonnes, une par type de séance (dans l'ordre des réglages, puis les types
// inconnus des réglages mais présents dans les données), sans colonne vide.
export function typeColumns(items, typeOf = (x) => x.type) {
  const ids = seanceTypes().map((t) => t.id);
  items.forEach((x) => { if (!ids.includes(typeOf(x))) ids.push(typeOf(x)); });
  return ids.map((id) => items.filter((x) => typeOf(x) === id)).filter((col) => col.length);
}

// ---- créneaux d'emploi du temps ----
export const edtTypeIds = () => SET().edtTypes.map((t) => t.id);
export const edtDefaultType = () => edtTypeIds()[0];
export const edtTypeLabel = (id) => SET().edtTypes.find((t) => t.id === id)?.label || id;
export const edtIsOff = (id) => !!SET().edtTypes.find((t) => t.id === id)?.off;
export const edtIsQuiet = (id) => !!SET().edtTypes.find((t) => t.id === id)?.quiet;
// type de créneau d'EDT -> type de séance correspondant (ex. Cours -> CM)
export const edtToSeanceType = (edtType) => seanceTypes().find((t) => t.edt === edtType)?.id;

// ---- import .ics ----
const reCache = new Map();
const rx = (src) => {
  if (!reCache.has(src)) { let r = null; try { r = new RegExp(src, "i"); } catch (e) { /* motif invalide : ignoré */ } reCache.set(src, r); }
  return reCache.get(src);
};
export const icsTypeRules = () => SET().ics.types.map((r) => [rx(r.pattern), r.type]).filter(([re]) => re);
export const icsCcRule = () => (SET().ics.cc ? rx(SET().ics.cc) : null);
