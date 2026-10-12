// Mirrors public.normalize_name() in the database so that duplicate
// detection behaves identically offline and on the server.
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[ً-ٰٟـ]/g, "") // harakat + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\s\-_.()/]+/g, "")
    .toLowerCase();
}

/** All normalised names a species can be found by. */
export function speciesKeys(s: {
  name_ar: string;
  name_en: string | null;
  scientific_name: string | null;
  aliases: string[];
}): string[] {
  return [s.name_ar, s.name_en, s.scientific_name, ...s.aliases].map(normalizeName).filter(Boolean);
}

/** Simple search match: every query token must appear in one of the haystacks. */
export function matches(query: string, ...haystacks: (string | null | undefined)[]): boolean {
  const tokens = query.split(/\s+/).map(normalizeName).filter(Boolean);
  if (!tokens.length) return true;
  const hay = haystacks.map(normalizeName).join(" ");
  return tokens.every((t) => hay.includes(t));
}
