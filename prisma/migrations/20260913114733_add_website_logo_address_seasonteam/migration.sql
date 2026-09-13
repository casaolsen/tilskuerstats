-- AlterTable
ALTER TABLE "Country" ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "address" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "SeasonTeam" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "SeasonTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeasonTeam_seasonId_teamId_key" ON "SeasonTeam"("seasonId", "teamId");

-- AddForeignKey
ALTER TABLE "SeasonTeam" ADD CONSTRAINT "SeasonTeam_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonTeam" ADD CONSTRAINT "SeasonTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
