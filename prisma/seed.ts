import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client";
import { runSeed } from "../src/lib/seed-logic";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

runSeed(prisma)
  .then((summary) => {
    for (const s of summary) {
      console.log(
        s.skipped
          ? `Skipped ${s.league} (already seeded).`
          : `Seeded ${s.league}: ${s.teams} teams, ${s.matches} matches.`
      );
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
