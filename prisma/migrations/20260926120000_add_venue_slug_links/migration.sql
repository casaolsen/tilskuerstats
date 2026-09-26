-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "slug" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "transportInfo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateTable
CREATE TABLE "VenueLink" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueLink_venueId_idx" ON "VenueLink"("venueId");

-- AddForeignKey
ALTER TABLE "VenueLink" ADD CONSTRAINT "VenueLink_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
