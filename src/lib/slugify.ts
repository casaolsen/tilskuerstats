// Used when creating a new Team/League from the admin UI, where only a name
// is entered — a timestamp suffix is appended by callers to avoid collisions.
export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (e.g. å -> a) after NFD decomposition
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
