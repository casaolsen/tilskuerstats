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
kamp må ikke citeres som faktiske — **undtagen for Danmark**, hvor de
erstattes af rigtige tal fra superstats.dk efter den engangs-`--reset`-kørsel
beskrevet under "Automatisk opdatering" nedenfor. Sverige og Norge er stadig
ren demo-data indtil deres scrapere er bygget.

### Live datakilder (research)

| Land | Liga | Kandidat-kilde | Status |
|---|---|---|---|
| DK | Superliga | [superstats.dk](https://superstats.dk) — tilskuertal pr. kamp/runde | **Verificeret og automatiseret** (se nedenfor) |
| SE | Allsvenskan | fx fbref.com (manuel export, se nedenfor) | Data indhentet manuelt, ikke automatiseret |
| NO | Eliteserien | [fotball.no](https://www.fotball.no) (NFF's officielle FIKS-database) | **Verificeret og automatiseret** (se nedenfor) |

`src/scrapers/dk-superstats.ts` henter hele sæsonens kampprogram i ét kald
(`/program?aar=<år>&sr=1`) og parser det med cheerio — bekræftet mod den
rigtige side (superstats.dk lukker ikke sine `<tr>`/`<td>`-tags, men cheerios
standardparser retter det korrekt). Kør den manuelt sådan:

```bash
npm run scrape:dk-superliga -- --dry-run --season=2025/2026   # kun print, ingen DB-skrivning
npm run scrape:dk-superliga -- --season=2025/2026              # opret/opdatér i databasen
```

`src/scrapers/no-fotballno.ts` gør det samme for fotball.no, men med to
forskelle fra DK: (1) sæsonens `fiksId` er et internt NFF-tal der ikke kan
udledes af årstal — findes ved at søge "fotball.no Eliteserien \<år\>" og
lægges ind i `SEASON_FIKS_IDS`; (2) tilskuertallet står **ikke** på
sæson-oversigten, kun på hver enkelt kampside, så scraperen henter det ét
kald ad gangen — kun for kampe der mangler det, og maks 60 pr. kørsel (se
"Automatisk opdatering (NO)" nedenfor for hvorfor).

```bash
npm run scrape:no-eliteserien -- --dry-run --season=2026
npm run scrape:no-eliteserien -- --season=2026
```

Giver nogen af dem 0 kampe, har kilden ændret sin tabelstruktur — parsing-logikken
(`parseSeasonProgram` i begge filer) er bevidst adskilt fra fetch- og DB-laget,
så det er en hurtig rettelse ét sted. Samme mønster (`types.ts` +
`<land>-<kilde>.ts`) kan genbruges til Sverige, som har en helt anden
side-struktur (og hvis kandidat-kilde, fbref.com, ikke er testet fra denne
kodebases miljø).

### Automatisk opdatering (DK)

Et Vercel Cron Job kalder `/api/cron/scrape-dk` hver mandag kl. 22:00 UTC
(23:00 dansk vintertid — se `vercel.json`, som ikke selv følger sommertid;
skemaet skal justeres 1 time to gange om året hvis det skal ramme kl. 23
dansk tid præcist hele året). Kræver at `CRON_SECRET` (en selvvalgt
hemmelig streng, samme princip som `SETUP_SECRET`) er sat som environment
variable i Vercel — Vercel sender den automatisk som
`Authorization: Bearer <CRON_SECRET>` ved planlagte kald. Ruten kan også
kaldes manuelt med `?key=<CRON_SECRET>` for at teste den.

**Vercels gratis Hobby-plan tillader højst ét kald i døgnet per cron-job**
— hvis sitet opgraderes til en betalt plan, kan `vercel.json`'s `schedule`
sættes tættere på kampstart for hurtigere opdateringer.

**OBS:** `vercel.json` har nu 3 cron-jobs (NO, DK, insights). Hobby-planen
har historisk haft et loft på **2** cron-jobs pr. projekt — tjek efter
deploy under **Project → Settings → Cron Jobs** at alle tre rent faktisk er
registreret. Er de ikke, kræver det enten en opgradering til Pro, eller at
to af opgaverne slås sammen til ét kald (fx lad `/api/cron/scrape-dk` selv
kalde NO-scraperen bagefter, så det tæller som ét cron-job for Vercel).

**Første kørsel per sæson:** de eksisterende `Season`-rækker for DK
(2024/2025, 2025/2026) er allerede fyldt med demo-data hvis syntetiske
rundenumre ikke nødvendigvis matcher superstats.dk's rigtige rækkefølge —
en almindelig scrape ville derfor kunne efterlade gamle demo-kampe ved siden
af de nye rigtige, i stedet for at erstatte dem. Kør derfor **én gang per
sæson** med reset. Cron-ruten (kun den, aldrig den planlagte cron-udløsning
selv — `vercel.json`'s `path` har ingen query-string) forstår `&reset=1` og
`&season=`, så det simpleste er at besøge disse URL'er i browseren (samme
princip som `/api/setup?key=...&seed=1`):

```
https://<dit-projekt>.vercel.app/api/cron/scrape-dk?key=<CRON_SECRET>&season=2024/2025&reset=1
https://<dit-projekt>.vercel.app/api/cron/scrape-dk?key=<CRON_SECRET>&season=2025/2026&reset=1
```

Har du i stedet Node.js lokalt og kan nå databasen direkte:

```bash
npm run scrape:dk-superliga -- --season=2024/2025 --reset
npm run scrape:dk-superliga -- --season=2025/2026 --reset
```

`--reset` sletter sæsonens eksisterende kampe først. Herefter er alle
fremtidige cron-kørsler rene opdateringer (nye/ændrede kampe), ikke reset.

**En helt ny sæson** (fx 2026/2027, hvor der ikke er nogen demo-data at rydde
op efter) skal først have en `Season`-række — opret den under
`/admin/seasons` for Superliga med label præcis som scraperen forventer
(`"2026/2027"`, matcher `prisma/seed-data.ts`) og en startdato. Herefter er
et almindeligt (ikke-reset) kald nok:

```
https://<dit-projekt>.vercel.app/api/cron/scrape-dk?key=<CRON_SECRET>&season=2026/2027
```

Kør den igen for at hente nye kampe/tilskuertal efterhånden som sæsonen
skrider frem, indtil den ugentlige cron selv tager over (når 2026/2027 er
den nyeste sæson i `prisma/seed-data.ts`, hvilket den er fra denne commit).

### Automatisk opdatering (NO)

Samme princip som DK: et Vercel Cron Job kalder `/api/cron/scrape-no` hver
mandag kl. 21:00 UTC (én time før DK, så de ikke overlapper — se
`vercel.json`), beskyttet af **det samme** `CRON_SECRET`. Manuel brug:

```
https://<dit-projekt>.vercel.app/api/cron/scrape-no?key=<CRON_SECRET>
https://<dit-projekt>.vercel.app/api/cron/scrape-no?key=<CRON_SECRET>&season=2025
https://<dit-projekt>.vercel.app/api/cron/scrape-no?key=<CRON_SECRET>&season=2025&reset=1
```

**Én vigtig forskel fra DK:** fotball.no viser ikke tilskuertal på
sæson-oversigten — det kræver ét ekstra opslag per kamp. For ikke at ramme
Vercels function-timeout henter et enkelt kald derfor kun tilskuertal for
kampe der mangler det, med et loft på 60 kampe pr. kald. Svaret indeholder
`remainingWithoutAttendance` — er den over 0, kald samme URL igen for at
hente resten (en frisk sæson på 240 kampe kræver typisk ~4 kald; den
ugentlige cron rammer aldrig loftet, da der kun er en håndfuld nye kampe pr.
uge).

**Første kørsel per sæson** følger samme mønster som DK — 2024 og 2025 har
demo-data med forkerte rundenumre og skal bruge `--reset`/`&reset=1`, mens
2026 (helt ny, ingen demo-data) først skal have en `Season`-række oprettet
under `/admin/seasons` for Eliteserien (label `"2026"`, startdato
`2026-03-14`), og derefter bare et almindeligt kald.

**Nye/ukendte hold** (fx ved fremtidig op-/nedrykning `TEAM_INFO` i
`src/scrapers/no-fotballno.ts` ikke kender endnu) oprettes automatisk uden
stadion sat — præcis som AC Horsens-situationen for DK. Tjek `/admin/teams`
efter et sæsonskift.

Uafhængigt af scraperen findes der allerede reelt indsamlede CSV'er for DK,
SE og NO (flere sæsoner hver) i samme GitHub-repo, på en anden branch
(`claude/superligaen-attendance-scraper-p1nnra` — separat historik, ikke en
forfader til denne branch). De har kolonnerne
`dato,runde,hjemmehold,udehold,hjemmemaal,udemaal,tilskuere,stadion` —
admin-importen finder kolonner via headernavn (rækkefølgen er ligegyldig, og
den ekstra `stadion`-kolonne ignoreres blot), så de kan bruges direkte via
`/admin/matches`. To ting at være opmærksom på: (1) hold matches på
`Team.name` (case-insensitive) — findes holdet ikke i forvejen (fx AaB og FC
Fredericia, som slet ikke er i `prisma/seed-data.ts`'s hold-liste), springes
rækken over og navnet listes som "ukendt"; opret holdet under `/admin/teams`
først. (2) dubletter genkendes på eksakt `kickoff`-tidspunkt, ikke runde —
rammer den syntetiske demo-datas kickoff-tidspunkt ikke præcis den rigtige
kamps, ender du med både demo- og rigtig-rækken i stedet for én opdateret
række, samme faldgrube som `--reset` løser for DK-scraperen ovenfor. De er
under alle omstændigheder den eneste kilde til rigtige SE/NO-tal indtil de
får deres egne automatiske scrapere.

## Insight-agent (AI)

En AI-agent (Claude) gennemgår nye Superliga-kampe, undersøger dem med en
række regne-værktøjer og skriver **udkast** til korte insights - fx et
usædvanligt højt tilskuertal, en klubrekord eller et markant fald i forhold
til sidste sæson. Intet vises på sitet, før du har godkendt det under
`/admin/insights`. Godkendte insights vises øverst på `/dk`.

### Opsætning (én gang)

1. Opret en API-nøgle på [platform.claude.com](https://platform.claude.com)
   (Settings → API keys) og sæt et lille månedligt forbrugsloft under Billing.
2. I Vercel: **Project → Settings → Environment Variables** → tilføj
   `ANTHROPIC_API_KEY` = nøglen. (`CRON_SECRET` findes allerede fra scraperen.)
3. **Redeploy** (Deployments → ⋯ → Redeploy), så den nye variabel og koden
   kommer med.
4. Opdatér databaseskemaet ved at besøge (samme URL som altid - rører ingen data):
   `https://<dit-projekt>.vercel.app/api/setup?key=<din SETUP_SECRET>`

### Daglig brug

- Agenten kører **automatisk mandag kl. 23:00 UTC**, en time efter scraperen
  (se `vercel.json`).
- Vil du køre den med det samme: gå til `/admin/insights` og tryk
  **Kør agenten nu** (tager typisk 1-3 minutter). Eller besøg
  `https://<dit-projekt>.vercel.app/api/cron/insights?key=<din CRON_SECRET>`.
- Under `/admin/insights` kan du rette teksten og så **Godkende** eller
  **Afvise**. Skriv gerne en note, når du afviser - agenten læser dine noter
  næste gang og lærer din smag.
- Klik **Beviser** på et udkast for at se præcis hvilke værktøjskald og tal,
  påstanden bygger på. Under **Seneste kørsler** kan du se alt, hvad agenten
  undersøgte, og hvor mange tokens det kostede.

Kun kampe fra de seneste 21 dage regnes som "nye" (så agenten ikke skriver
om hele historikken første gang), og kun Superligaen er med, fordi SE/NO
stadig er demo-data.

### Sådan virker den (til læring)

Koden ligger i `src/insights/`:

| Fil | Rolle |
|---|---|
| `tools.ts` | Værktøjerne + deres JSON-schemas. De **regner**: rang, snit, rekorder, udvikling, sammenligning med sidste sæson |
| `agent.ts` | Systemprompt og selve tool-use-loopet (skrevet i hånden, så hvert trin er synligt) |
| `verify.ts` | Tjekker at **hvert tal** i et udkast findes i et værktøjsresultat |
| `run.ts` | Kobler agenten til databasen (`InsightRun`, `InsightDraft`, `Match.insightCheckedAt`) |
| `insights.test.ts` | Tester det hele med en falsk Claude-klient: `npm run test:insights` |

Loopet: Claude får opgaven og værktøjslisten → svarer med `tool_use`-blokke →
koden kører værktøjerne og sender `tool_result` tilbage → gentag, indtil
Claude svarer uden værktøjskald (`end_turn`). Agenten kan kun skrive via
`submit_draft`, og hvis et udkast indeholder et tal, der ikke står i nogen
værktøjsresultater, afvises det med en fejl, som modellen selv retter. Det er
sådan "agenten må ikke finde på tallene" håndhæves i kode frem for kun i prompten.

Modellen er `claude-opus-5` og kan ændres med environment variablen
`INSIGHTS_MODEL` (fx `claude-sonnet-5`, som er billigere).

## Roadmap

1. Bygge tilsvarende automatiske scrapere for SE og NO (fbref.com og
   fotball.no — se `src/scrapers/dk-superstats.ts` for mønsteret)
2. ~~Automatisk, planlagt indhentning (fx cron) i stedet for manuel kørsel~~ — done for DK, se ovenfor
3. Historisk backfill (flere sæsoner tilbage)
4. **Prognosemodel**: forudsig tilskuertal pr. kommende kamp ud fra
   historik (hold, modstander, ugedag/tidspunkt), vejrudsigt og
   performance (tabelplacering, seneste resultater) — `Match`-skemaets
   vejr-felter og `source`-sporing er forberedt til dette
