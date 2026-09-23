-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "insightCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InsightRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "matchIds" JSONB NOT NULL,
    "summary" TEXT,
    "toolCalls" JSONB,
    "transcript" JSONB,
    "usage" JSONB,

    CONSTRAINT "InsightRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightDraft" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "kind" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "matchIds" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "InsightDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightDraft_status_idx" ON "InsightDraft"("status");

-- AddForeignKey
ALTER TABLE "InsightDraft" ADD CONSTRAINT "InsightDraft_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InsightRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
