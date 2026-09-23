import { NextRequest, NextResponse } from "next/server";
import { runInsights } from "@/insights/run";

// En agent-kørsel består af mange kald til Claude og kan tage et par
// minutter. 300 sekunder er maksimum på Vercels gratis Hobby-plan.
export const maxDuration = 300;

// Scheduled by vercel.json's `crons` entry, an hour after /api/cron/scrape-dk
// so the agent sees the newly scraped matches. Same auth convention as the
// scrape route: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
// for a manual run visit /api/cron/insights?key=<CRON_SECRET>.
// The agent only writes drafts - nothing is published until approved in
// /admin/insights.
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
  if (authHeader !== `Bearer ${expected}` && key !== expected) {
    return NextResponse.json({ error: "Forkert eller manglende autorisation." }, { status: 401 });
  }

  try {
    const result = await runInsights();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("Insight-agenten fejlede:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
