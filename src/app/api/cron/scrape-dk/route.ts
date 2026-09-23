import { NextRequest, NextResponse } from "next/server";
import { runDkScrape } from "@/scrapers/dk-superstats";

// Scheduled by vercel.json's `crons` entry (Vercel Cron sends a GET request
// with `Authorization: Bearer <CRON_SECRET>` automatically once that env var
// is set on the project — see README "Automatisk opdatering"). vercel.json's
// path has no query string, so a scheduled call is always a plain, non-reset
// run of the current season — `?reset=1` and `?season=` only ever take
// effect on a manual visit.
//
// Manual use (same convention as /api/setup?key=...&seed=1):
//   ?key=<CRON_SECRET>                                 - normal run, current season
//   ?key=<CRON_SECRET>&season=2024/2025                - normal run, a specific season
//   ?key=<CRON_SECRET>&season=2024/2025&reset=1        - wipe that season's matches first
// See README "Automatisk opdatering" for when --reset is needed.
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

  const seasonLabel = req.nextUrl.searchParams.get("season") ?? undefined;
  const reset = req.nextUrl.searchParams.get("reset") === "1";

  try {
    const result = await runDkScrape({ seasonLabel, reset });
    return NextResponse.json({ ok: true, league: "superliga", ...result });
  } catch (e) {
    console.error("DK scrape fejlede:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
