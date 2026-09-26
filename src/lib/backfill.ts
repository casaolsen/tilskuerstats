import type { PrismaClient } from "@/generated/prisma/client";
import { slugify } from "./slugify";

// One-time, additive-only backfill for venues created before Venue.slug
// existed. Only ever touches rows where slug IS NULL — an already-set slug
// is never regenerated, so a venue's URL never changes once it has one.
// Safe to run on every /api/setup visit (unlike runSeed, this needs no
// &seed=1 opt-in).
export async function backfillVenueSlugs(prisma: PrismaClient): Promise<number> {
  const venues = await prisma.venue.findMany({ where: { slug: null } });
  let updated = 0;
  for (const venue of venues) {
    const base = slugify(venue.name);
    let slug = base;
    let suffix = 1;
    // Guard against collisions (e.g. two venues both named "Stadion").
    while (await prisma.venue.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    await prisma.venue.update({ where: { id: venue.id }, data: { slug } });
    updated++;
  }
  return updated;
}
