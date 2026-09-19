import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runSeed } from "@/lib/seed-logic";
import { SETUP_DDL } from "@/lib/schema-ddl";

// One-click bootstrap: applies schema DDL, and — only when explicitly asked
// via ?seed=1 — seeds the original 3 demo leagues. Protected by the
// SETUP_SECRET env var — set one in Vercel, then visit
// /api/setup?key=<that value> after every deploy that changes the schema.
//
// Seeding is opt-in, not automatic: runSeed() upserts teams by slug and
// re-adds every demo team to every season's roster, so running it against a
// database that already has real admin-curated data resurrects deleted
// teams and overwrites hand-edited season rosters. Plain `?key=...` (no
// `&seed=1`) only ever runs the idempotent schema DDL and touches no rows —
// that's the one that's safe to hit after every schema change from here on.
// See README "Deploy til Vercel".
export async function GET(req: NextRequest) {
  const expected = process.env.SETUP_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "SETUP_SECRET er ikke sat som environment variable på denne deployment." },
      { status: 500 }
    );
  }

  const key = req.nextUrl.searchParams.get("key");
  if (key !== expected) {
    return NextResponse.json({ error: "Forkert eller manglende ?key=" }, { status: 401 });
  }

  for (const statement of SETUP_DDL) {
    await prisma.$executeRawUnsafe(statement);
  }

  const shouldSeed = req.nextUrl.searchParams.get("seed") === "1";
  const seedSummary = shouldSeed
    ? await runSeed(prisma)
    : "sprunget over — tilføj &seed=1 for at (gen)oprette demo-ligaerne (rører intet uden det)";

  return NextResponse.json({ ok: true, schema: "oprettet (eller fandtes allerede)", seed: seedSummary });
}
