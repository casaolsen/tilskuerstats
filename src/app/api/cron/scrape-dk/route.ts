import { NextRequest, NextResponse } from "next/server";
import { runDkScrape } from "@/scrapers/dk-superstats";

// Scheduled by vercel.json's `crons` entry (Vercel Cron sends a GET request
// with `Authorization: Bearer <CRON_SECRET>` automatically once that env var
// is set on the project — see README "Automatisk opdatering"). Also callable
// by hand with `?key=<CRON_SECRET>` for manual testing, same convention as
// /api/setup.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET er ikke sat som environment variable på denne deployment." },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  const authorized = authHeader === `Bearer ${expected}` || key === expected;
  if (!authorized) {
    return NextResponse.json({ error: "Forkert eller manglende autorisation." }, { status: 401 });
  }

  try {
    const result = await runDkScrape();
    return NextResponse.json({ ok: true, league: "superliga", ...result });
  } catch (e) {
    console.error("DK scrape fejlede:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
