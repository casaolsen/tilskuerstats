# tilskuerstats

Tilskuerstatistik for Superligaen (data fra superstats.dk) med en AI-agent, der
finder interessante mønstre i nye kampe og skriver **udkast** til korte insights,
som et menneske godkender.

## Kom i gang

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...

# 1. Historik: indlæses som "allerede analyseret", så agenten har noget at sammenligne med
python -m tilskuerstats scrape --season 2023/2024 --season 2024/2025 --season 2025/2026 --baseline
# 2. Indeværende sæson: nye kampe, som agenten skal kigge på
python -m tilskuerstats scrape --season 2026/2027
# 3. Kør agenten (-v viser hvert værktøjskald)
python -m tilskuerstats analyze -v
# 4. Gennemgå udkast
python -m tilskuerstats drafts
python -m tilskuerstats show 1 --full
python -m tilskuerstats approve 1
python -m tilskuerstats reject 2 --note "ikke interessant nok"
# 5. Godkendte insights som JSON til sitet
python -m tilskuerstats export --out data/insights.json
```

Databasen ligger i `data/tilskuerstats.db` (kan ændres med `--db` eller `TILSKUER_DB`).
Modellen er `claude-opus-5` og kan ændres med `--model` eller `TILSKUER_MODEL`.

## Arkitektur

```
superstats.dk ──scraper.py──▶ SQLite (matches)
                                 │
                   ┌─────────────┴──────────────┐
                   │  agent.py: tool-use-loop   │
                   │   Claude ◀──▶ tools.py     │  værktøjer regner, modellen vurderer
                   │      │                     │
                   │      ▼ submit_draft        │
                   │   verify.py: tal-tjek ─────┼── fejl sendes tilbage til modellen
                   └──────┬─────────────────────┘
                          ▼
                 drafts (pending) ──▶ du godkender ──▶ export → insights.json
```

| Fil | Rolle |
|---|---|
| `scraper.py` | Parser kampprogrammet (dato, hold, resultat, tilskuere) |
| `db.py` | Tabellerne `matches`, `runs` (hele agent-transskriptet) og `drafts` |
| `tools.py` | Dataværktøjerne + deres JSON-schemas |
| `verify.py` | Tjekker at hvert tal i et udkast findes i et værktøjsresultat |
| `agent.py` | Systemprompt og selve loopet |
| `cli.py` | Kommandoerne ovenfor |

### Værktøjerne

| Værktøj | Svarer på |
|---|---|
| `list_new_matches` | Hvad er nyt siden sidst? |
| `compare_attendance(match_id, scope)` | Er tallet usædvanligt i forhold til ligaen, holdet eller netop dette opgør? Rang, snit, median, z-score og rekord *på tidspunktet* |
| `team_attendance_trend(team, season)` | Går et hold op eller ned, også sammenlignet med samme tidspunkt sidste sæson? |
| `season_overview(season, up_to_round)` | Ligaen samlet, sammenlignet med samme antal runder sidste sæson |
| `round_summary(season, round_number)` | Hvordan klarede runden sig? |
| `list_available_data`, `list_recent_drafts` | Overblik, og så agenten ikke gentager sig selv |
| `submit_draft` | Den eneste måde agenten kan skrive på, og kun som `pending` |

## Designvalg, der er værd at lægge mærke til

1. **Værktøjerne regner, modellen formulerer.** Procenter, gennemsnit og rang
   beregnes i Python. Modellen vælger, hvad der er interessant, og skriver teksten.
2. **Et hårdt tjek mod opfundne tal.** `submit_draft` afviser udkast, hvor et tal
   ikke kan findes i nogen af kørslens værktøjsresultater. Afrunding er tilladt.
   Afvisningen sendes tilbage som `tool_result` med `is_error: true`, så modellen
   kan rette udkastet. Hvert udkast gemmes med de værktøjskald, der beviser det
   (`show --full`).
3. **Håndskrevet loop.** SDK'et har en tool runner, der gør det samme, men et
   synligt loop (`InsightAgent.run`) er nemmere at lære af: `stop_reason`,
   parallelle `tool_use`-blokke, hvordan resultater sendes tilbage, og
   `max_turns` som sikkerhedsnet.
4. **Sammenligninger "på tidspunktet".** `compare_attendance` ser kun på kampe
   frem til og med kampens kickoff, så en rekord betyder rekord, da kampen blev
   spillet, og svaret ændrer sig ikke ved en ny kørsel.
5. **Idempotens.** Kampe markeres kun som analyseret, når agenten er nået
   ordentligt til ende (`done`). Går noget galt, kommer de med igen næste gang.
   Uden nye kampe kaldes API'et slet ikke.
6. **Alt logges.** Tabellen `runs` gemmer hele beskedhistorikken og
   token-forbruget pr. kørsel. Det er her, man ser *hvorfor* agenten gjorde, som den gjorde.

## Tests

```bash
python -m pytest
```

Agent-testene bruger en falsk Claude-klient, der afspiller et fast manuskript af
svar (`tests/test_agent.py`). Loopet, verificeringen og fejlhåndteringen testes
altså uden API-nøgle og uden at bruge penge.

## Idéer til næste skridt

- **Eval-sæt:** gem et par rigtige runder med de insights, du *ville* have skrevet,
  og mål agentens præcision (falske alarmer) og recall (oversete historier).
- **Flere værktøjer:** kampdag/ugedag/tidspunkt, derbys, vejr, stadionkapacitet
  (udsolgt?), mesterskabs- vs. kvalifikationsspil.
- **Planlagt kørsel:** en GitHub Action, der scraper og kører `analyze` efter
  hver runde (databasen skal så gemmes et sted mellem kørslerne).
- **Feedback-loop:** agenten ser allerede dine `--note`-begrundelser via
  `list_recent_drafts`. Næste skridt kunne være at samle dem i en fast
  "redaktionel stilguide" i systemprompten.
