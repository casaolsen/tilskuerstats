# Tilskuerstats Norden

Tilskuerstatistik for de øverste fodboldrækker i Danmark (Superliga), Sverige
(Allsvenskan) og Norge (Eliteserien) — bygget som grundlag for en senere
prognosemodel for tilskuertal baseret på historik, vejr og holdenes performance.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Prisma 7** + SQLite (dev) — datamodellen er database-agnostisk og kan
  flyttes til Postgres for produktion ved at ændre `datasource` i
  `prisma/schema.prisma` og skifte driver adapter i `src/lib/db.ts`
- **Recharts** til grafer

## Kom i gang

```bash
npm install
npx prisma migrate dev   # opretter dev.db og skemaet
npm run db:seed          # fylder databasen med data (se "Data" nedenfor)
npm run dev
```

Åbn http://localhost:3000.

## Datamodel

`Country → League → Season → Match` med `Team` og `Venue` som selvstændige
entiteter (en klub kan i princippet skifte stadion mellem sæsoner). `Match`
har allerede felter til vejr (`weatherTempC`, `weatherCondition`,
`weatherWindMs`, `weatherPrecipMm`) og en `source`-URL — klar til at blive
udfyldt af scrapere og senere brugt som features i prognosemodellen, uden at
skemaet skal ændres. Se `prisma/schema.prisma`.

## Data — status

Databasen seedes i dag med **demo-data** (`npm run db:seed`,
`prisma/seed-data.ts` + `prisma/seed.ts`): rigtige hold, stadions og
kapaciteter, men *per-kamp* tilskuertal er syntetiske tal genereret omkring
kendte sæson-gennemsnit (fundet via research), ikke en skrabet historisk
facitliste. Det gør sitet fuldt funktionelt med det samme, men tallene per
kamp må ikke citeres som faktiske.

### Live datakilder (research)

| Land | Liga | Kandidat-kilde | Status |
|---|---|---|---|
| DK | Superliga | [superstats.dk](https://superstats.dk) — tilskuertal pr. kamp/runde | Reference-scraper skrevet, **ikke verificeret** |
| SE | Allsvenskan | fx tvfotboll.se, allsvenskantabellen.se | Ikke påbegyndt |
| NO | Eliteserien | fotball.no (NFF, officiel) | Ikke påbegyndt |

`src/scrapers/dk-superstats.ts` er en reference-implementering (fetch +
cheerio) for Danmark. **Denne sandbox' netværksproxy blokerer adgang til
superstats.dk**, så CSS-selectorne er et kvalificeret gæt, ikke bekræftet mod
den rigtige HTML. Kør scraperen fra et almindeligt miljø for at kalibrere:

```bash
npm run scrape:dk-superliga -- --dry-run --round 1
```

Giver den 0 kampe, skal selectorne i `ROUND_PAGE_SELECTORS` justeres —
parsing-logikken (`parseRoundPage`) er bevidst adskilt fra fetch-laget, så det
er en hurtig rettelse. Samme mønster (`types.ts` + `<land>-<kilde>.ts`) kan
genbruges til Sverige og Norge, som har helt andre side-strukturer.

## Roadmap

1. Verificere og udbygge DK-scraperen; bygge tilsvarende for SE og NO
2. Automatisk, planlagt indhentning (fx cron) i stedet for manuel kørsel
3. Historisk backfill (flere sæsoner tilbage)
4. **Prognosemodel**: forudsig tilskuertal pr. kommende kamp ud fra
   historik (hold, modstander, ugedag/tidspunkt), vejrudsigt og
   performance (tabelplacering, seneste resultater) — `Match`-skemaets
   vejr-felter og `source`-sporing er forberedt til dette
