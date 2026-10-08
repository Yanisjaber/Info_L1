import { sync } from "./store.js";

export function client() {
  if (!sync.client || !sync.user) throw new Error("Non connecté.");
  return sync.client;
}
