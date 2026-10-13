// Resolve a fish name typed by the user to a species id, creating a new
// species when the name is not in the list yet.

import { uuid } from "./ids";
import { normalizeName, speciesKeys } from "./normalize";
import type { Dataset, Species } from "./types";

export async function resolveSpecies(ds: Dataset, save: (table: "species", row: Species) => Promise<unknown>, typed: string): Promise<string | null> {
  const name = typed.trim();
  if (!name) return null;
  const key = normalizeName(name);
  const hit = ds.species.find((s) => speciesKeys(s).includes(key));
  if (hit) return hit.id;
  const ts = new Date().toISOString();
  const sp: Species = { id: uuid(), name_ar: name, name_en: null, scientific_name: null, aliases: [], family: null, notes: null, cover_media_id: null, is_builtin: false, created_at: ts, updated_at: ts };
  await save("species", sp);
  return sp.id;
}
