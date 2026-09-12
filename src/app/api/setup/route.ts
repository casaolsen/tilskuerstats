import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runSeed } from "@/lib/seed-logic";
import { SETUP_DDL } from "@/lib/schema-ddl";

// One-click bootstrap: creates the schema (if missing) and seeds demo data.
// Protected by the SETUP_SECRET env var — set one in Vercel, then visit
// /api/setup?key=<that value> once after deploying. Safe to call more than
// once (schema DDL is idempotent, seeding skips leagues that already have
// matches). See README "Deploy til Vercel".
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

  const seedSummary = await runSeed(prisma);

  return NextResponse.json({ ok: true, schema: "oprettet (eller fandtes allerede)", seed: seedSummary });
}
