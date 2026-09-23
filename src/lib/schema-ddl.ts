// Hand-maintained Postgres DDL mirroring prisma/schema.prisma, used only by
// the one-click /api/setup bootstrap route (see src/app/api/setup/route.ts).
//
// This exists because this project's normal dev environment has no network
// path to a live Postgres database, so `prisma migrate dev`/`deploy` can't be
// run from here — only from the deployed app itself, which does have one.
// It is NOT a substitute for real Prisma migrations: if you have a machine
// that can reach the database directly, prefer
// `npx prisma migrate dev --name init` (see README), which generates and
// tracks a proper migration. Keep this file in sync with schema.prisma by
// hand if you change the schema before that's set up.
//
// All statements are IF NOT EXISTS / idempotent so hitting the route more
// than once is harmless — including running it against the already-live
// database after a schema change: CREATE TABLE IF NOT EXISTS includes the
// current full column set for anyone starting fresh, and the ALTER TABLE ...
// ADD COLUMN IF NOT EXISTS block below adds any new columns to a database
// that already has these tables from an earlier version of this file.
export const SETUP_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "Country" (
    "id" TEXT PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "website" TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS "League" (
    "id" TEXT PRIMARY KEY,
    "countryId" TEXT NOT NULL REFERENCES "Country"("id"),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "website" TEXT,
    "logoUrl" TEXT,
    UNIQUE ("countryId", "name")
  )`,
  `CREATE TABLE IF NOT EXISTS "Season" (
    "id" TEXT PRIMARY KEY,
    "leagueId" TEXT NOT NULL REFERENCES "League"("id"),
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    UNIQUE ("leagueId", "label")
  )`,
  `CREATE TABLE IF NOT EXISTS "Venue" (
    "id" TEXT PRIMARY KEY,
    "countryId" TEXT NOT NULL REFERENCES "Country"("id"),
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "capacity" INTEGER,
    "imageUrl" TEXT,
    "website" TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS "Team" (
    "id" TEXT PRIMARY KEY,
    "countryId" TEXT NOT NULL REFERENCES "Country"("id"),
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "slug" TEXT NOT NULL UNIQUE,
    "website" TEXT,
    "logoUrl" TEXT,
    "homeVenueId" TEXT REFERENCES "Venue"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "SeasonTeam" (
    "id" TEXT PRIMARY KEY,
    "seasonId" TEXT NOT NULL REFERENCES "Season"("id"),
    "teamId" TEXT NOT NULL REFERENCES "Team"("id"),
    UNIQUE ("seasonId", "teamId")
  )`,
  `CREATE TABLE IF NOT EXISTS "Match" (
    "id" TEXT PRIMARY KEY,
    "seasonId" TEXT NOT NULL REFERENCES "Season"("id"),
    "round" INTEGER,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "homeTeamId" TEXT NOT NULL REFERENCES "Team"("id"),
    "awayTeamId" TEXT NOT NULL REFERENCES "Team"("id"),
    "venueId" TEXT REFERENCES "Venue"("id"),
    "attendance" INTEGER,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "note" TEXT,
    "weatherTempC" DOUBLE PRECISION,
    "weatherCondition" TEXT,
    "weatherWindMs" DOUBLE PRECISION,
    "weatherPrecipMm" DOUBLE PRECISION,
    "source" TEXT,
    "insightCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "Match_seasonId_idx" ON "Match"("seasonId")`,
  `CREATE INDEX IF NOT EXISTS "Match_homeTeamId_idx" ON "Match"("homeTeamId")`,
  `CREATE INDEX IF NOT EXISTS "Match_awayTeamId_idx" ON "Match"("awayTeamId")`,
  `CREATE INDEX IF NOT EXISTS "Match_kickoff_idx" ON "Match"("kickoff")`,
  `CREATE TABLE IF NOT EXISTS "InsightRun" (
    "id" TEXT PRIMARY KEY,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "matchIds" JSONB NOT NULL,
    "summary" TEXT,
    "toolCalls" JSONB,
    "transcript" JSONB,
    "usage" JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS "InsightDraft" (
    "id" TEXT PRIMARY KEY,
    "runId" TEXT NOT NULL REFERENCES "InsightRun"("id"),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "kind" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "matchIds" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS "InsightDraft_status_idx" ON "InsightDraft"("status")`,

  // Additive upgrade path for databases that already had these tables from
  // an earlier version of this file (no-op on a fresh CREATE TABLE above).
  `ALTER TABLE "Country" ADD COLUMN IF NOT EXISTS "website" TEXT`,
  `ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "website" TEXT`,
  `ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT`,
  `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "address" TEXT`,
  `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
  `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "website" TEXT`,
  `ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "website" TEXT`,
  `ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT`,
  `ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "note" TEXT`,
  `ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "insightCheckedAt" TIMESTAMP(3)`,
];
