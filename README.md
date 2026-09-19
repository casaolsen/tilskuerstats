# Tilskuerstats Norden

Tilskuerstatistik for de øverste fodboldrækker i Danmark (Superliga), Sverige
(Allsvenskan) og Norge (Eliteserien) — bygget som grundlag for en senere
prognosemodel for tilskuertal baseret på historik, vejr og holdenes performance.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Prisma 7** + **Postgres** via Neon's serverless driver
  (`@prisma/adapter-neon`) — valgt fordi den fungerer godt med Vercels
  serverless-funktioner (ingen persistente forbindelser at holde styr på)
- **Recharts** til grafer

Alle sider under `/`, `/[country]` og `/[country]/[team]` er markeret
`export const dynamic = "force-dynamic"`, så de altid henter friske tal fra
databasen ved hvert kald — vigtigt for et site hvor data opdateres af
scrapere uden en ny deploy.

## Kom i gang (lokal udvikling)

Du skal bruge en Postgres-database, også lokalt — nemmest er en gratis
database på [neon.tech](https://neon.tech) (ingen lokal installation
nødvendig):

1. Opret en konto på neon.tech og et projekt
2. Kopiér den **poolede** connection string (indeholder typisk `-pooler`)
3. Sæt den i `.env` som `DATABASE_URL`

```bash
npm install
npx prisma migrate dev --name init   # opretter skemaet i din Postgres-database
npm run db:seed                      # fylder databasen med data (se "Data" nedenfor)
npm run dev
```

Åbn http://localhost:3000.

## Deploy til Vercel

> **OBS:** Dette repo har (endnu) ingen `main`-branch — kun feature-branches
> under `claude/...`. Vercel vælger som udgangspunkt en af dem som
> "default", hvilket kan være den forkerte. Tjek/sæt derfor **Project →
> Settings → Git → Production Branch** til `claude/nordic-viewer-stats-site-rkudtt`
> (den med selve Next.js-appen) — ellers bygger Vercel en tom/forkert branch.

1. Push branchen til GitHub (gjort) og merge evt. til `main`
2. Opret en gratis konto på [vercel.com](https://vercel.com), log ind med
   GitHub, og **Import** `casaolsen/tilskuerstats`
3. Under projektets **Storage**-fane: opret en Postgres-database (kører på
   Neon) — Vercel sætter automatisk `DATABASE_URL` som environment variable
4. Sæt to environment variables mere:
   - `SETUP_SECRET` = en selvvalgt hemmelig streng (bruges kun til at
     beskytte trin 6)
   - `ADMIN_PASSWORD` = kodeordet til `/admin` (se "Admin" nedenfor)
5. **Deploy**
6. Opret/opdatér databaseskemaet ved at besøge (i browseren):
   `https://<dit-projekt>.vercel.app/api/setup?key=<din SETUP_SECRET>`
   — det opretter tabellerne (og tilføjer nye kolonner ved fremtidige
   skema-ændringer). Siden svarer med en lille JSON-status. **Denne
   simple form rører aldrig eksisterende data** og kan roligt besøges igen
   hver gang appen får en skema-ændring — brug den til det, ikke kun ved
   første opsætning.

   Vil du (kun ved allerførste opsætning, på en helt tom database) også
   have de 3 demo-ligaer med syntetisk testdata, tilføj `&seed=1`:
   `https://<dit-projekt>.vercel.app/api/setup?key=<din SETUP_SECRET>&seed=1`
   — **kør kun dette én gang, før du har rigtige data i admin.** Seed-logikken
   opretter/genopretter hold ud fra deres slug og tilføjer alle demo-hold til
   hver sæsons trup, så at køre den igen efter du har redigeret/slettet hold
   eller sæson-trupper i admin vil overskrive dine ændringer og
   genskabe slettede hold.

   Har du i stedet Node.js lokalt og kan nå databasen direkte, kan du bruge
   den "rigtige" vej i stedet for `/api/setup`:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

Herefter er sitet live og henter data direkte fra Postgres-databasen ved
hvert kald.

## Admin

`/admin` er en kodeords-beskyttet sektion til at redigere indhold uden at
røre ved kode:

- **Lande, Ligaer, Hold, Stadions** — rediger navne, website, logo/billede-URL;
  flere ligaer pr. land understøttes (fx både Superliga og 1. Division for
  Danmark)
- **Sæsoner** — opret nye sæsoner, og administrér hvilke hold der spiller i
  hvilken liga-sæson ("Hold i sæson") — det er mekanismen der håndterer
  op-/nedrykning: et hold flyttes til en anden liga næste sæson uden at blive
  et nyt hold i systemet
- **Kampe** — redigér tilskuertal/resultat/dato pr. kamp, opret enkeltkampe,
  eller bulk-importér via en CSV-fil (kolonner:
  `dato,hjemmehold,udehold,tilskuere,hjemmemaal,udemaal,runde`)

Login kræver `ADMIN_PASSWORD` sat som environment variable — étt fælles
kodeord, ingen brugerstyring/roller (passer til én person der administrerer
sitet). Logo/billede-felter er rene URL-felter indtil videre (indsæt et link
til et billede et andet sted fra), ikke fil-upload.

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
