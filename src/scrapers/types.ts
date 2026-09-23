export type ScrapedMatch = {
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  attendance: number | null;
  homeScore: number | null;
  awayScore: number | null;
  round: number | null;
  sourceUrl: string;
};

// Maps a raw team name as it appears on a source site to our canonical Team.slug
// (see prisma/seed-data.ts). Scrapers should go through this instead of guessing,
// since sites abbreviate/rename inconsistently (e.g. "FCK" vs "F.C. København").
export type TeamNameMap = Record<string, string>;

export function resolveSlug(map: TeamNameMap, rawName: string): string | null {
  const key = rawName.trim().toLowerCase();
  for (const [alias, slug] of Object.entries(map)) {
    if (alias.toLowerCase() === key) return slug;
  }
  return null;
}
