import { NextRequest, NextResponse } from "next/server";
import { runNoScrape } from "@/scrapers/no-fotballno";

export const maxDuration = 60; // Vercel Hobby's ceiling — see attendanceFetchLimit below

// Scheduled by vercel.json's `crons` entry (Vercel Cron sends a GET request
// with `Authorization: Bearer <CRON_SECRET>` automatically once that env var
// is set on the project). vercel.json's path has no query string, so a
// scheduled call is always a plain, non-reset run of the current season.
//
// Manual use (same convention as /api/setup?key=...&seed=1):
//   ?key=<CRON_SECRET>                                 - normal run, current season
//   ?key=<CRON_SECRET>&season=2025                      - normal run, a specific season
//   ?key=<CRON_SECRET>&season=2025&reset=1              - wipe that season's matches first
//
// fotball.no doesn't list attendance on the season page — each match needs
// its own page fetch. To stay well under Vercel's function timeout, this
// only fetches attendance for matches that don't have it yet, capped at 60
// per call (a fresh 240-match season backfill needs ~4 calls; the weekly
// cron only ever has a handful of new matches, so it never gets close to
// the cap). The response's `remainingWithoutAttendance` tells you whether
// to call it again.
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
    const result = await runNoScrape({ seasonLabel, reset, attendanceFetchLimit: 60 });
    return NextResponse.json({ ok: true, league: "eliteserien", ...result });
  } catch (e) {
    console.error("NO scrape fejlede:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
