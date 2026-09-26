// Used when creating a new Team/League from the admin UI, where only a name
// is entered — a timestamp suffix is appended by callers to avoid collisions.
export function slugify(s: string) {
  return s
    .toLowerCase()
    // "ø" and "æ" have no canonical Unicode decomposition (they're distinct
    // letters, not base+combining-diacritic pairs), so NFD below won't
    // reduce them the way it does "å" -> "a" or "é" -> "e" — without this
    // they're dropped entirely by the non-a-z0-9 strip below (e.g.
    // "Brøndby" -> "br-ndby", "Nordsjælland" -> "nordsj-lland").
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (e.g. å -> a) after NFD decomposition
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
