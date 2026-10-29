# Census merge report

Generated: 2026-10-29 (today)

Inputs: census A = Strawberry (`census-A-strawberry/nsfw-ai-platform-census.json` + identity-aliases copy), census B = Gemini (`census-B-gemini.json`), census C = 3 supply runs parsed from `full_census_txt/` (gemini whole-file JSON; perplexity and venice embedded-in-markdown objects). No ranking, no quality judgement, no invented names.

## Totals

- canonical platforms: **1392** (one row per canonical platform; census-A adjacent-entity names excluded from the table, see counts below)
- census-A adjacent entities (models/directories/incidental names) canonical-unique and platform-absent: **1166** (kept out of the table; logged in merge-log)
- by ecosystem_role (majority vote across C runs): (none)=827, hosted platform=457, frontend/local tool=48, model/api=28, card/lore hub=20, other=8, other (review directory)=3, other (image generator)=1
- frontend/local-tool rows flagged: **63**
- supply_runs_count histogram: 3 runs=38, 2 runs=75, 1 runs=452, 0 runs=827
- qualified_A (3-link bar as computed by census A): 15; qualified_B (Gemini, community): 29; qualified_recomputed (3+ unique source threads across A+B): 34

## Run-overlap matrix (canonical names found in both runs)

|    | A | B | C-gem | C-ppx | C-ven |
|---|---|---|---|---|---|
| A | - | 46 | 72 | 115 | 129 |
| B | 46 | - | 41 | 33 | 25 |
| C-gem | 72 | 41 | - | 50 | 49 |
| C-ppx | 115 | 33 | 50 | - | 90 |
| C-ven | 129 | 25 | 49 | 90 | - |

## Capture-recapture on the C runs (pairwise, N ~ n1*n2/overlap)

| pair | n1 | n2 | overlap | N estimated | note |
|---|---|---|---|---|---|
| C-gem&C-ppx | 98 | 298 | 50 | 584.1 |  |
| C-gem&C-ven | 98 | 320 | 49 | 640.0 |  |
| C-ppx&C-ven | 298 | 320 | 90 | 1059.6 |  |

## usage_signal completeness (% of canonical rows with a non-empty value, per run)

| run | web_visits | app_downloads |
|---|---|---|
| C-gem | 0.7% (10) | 0.6% (9) |
| C-ppx | 1.6% (22) | 0.0% (0) |
| C-ven | 0.8% (11) | 0.2% (3) |

## community-only (qualified in A or B, but list_frequency max <= 3 in supply runs)

| canonical_name | community_users_A | community_users_B | qualified flags | note |
|---|---|---|---|---|
| KoboldCpp | 5 | 8 | A | |
| Caveduck | 4 | 4 | B | |
| WyvernChat | 2 | 4 | B | |
| Agnai | 0 | 6 | B | |
| Tavo | 0 | 10 | B | |
| Yodayo | 2 | 7 | B | |
| Moescape AI | 1 | 4 | B | |
| Paradot | 1 | 5 | B | |
| Dreamjourney AI | 0 | 8 | B | |
| Sakura AI | 0 | 6 | B | |
| Xoul AI | 0 | 7 | B | |
| Saylo | 7 | 0 | A | |
| Backyard AI (Faraday / Faraday.dev / BYAI) | 0 | 12 | B | |
| Oobabooga (Text Generation WebUI) | 0 | 8 | B | |
| Saucepan AI | 0 | 10 | B | |
| Grok | 10 | 0 | A | |
| Zeta AI | 6 | 5 | A | |

## supply-only big (top 25 by unique-source count with no community evidence)

| canonical_name | unique_source_list_count | lf_max | supply_runs | segment | frontend_flag |
|---|---|---|---|---|---|
| GirlfriendGPT | 30 | 20 | 3 | AI companion | AI girlfriend roleplay platform | Adjacent or |  |
| Nectar AI (TryNectar) | 17 | 9 | 3 | Relationship/voice discovery | discovery | image/video-first |  |
| Kupid AI | 15 | 10 | 3 | companion | uncertain | unverified identity and scope; see e |  |
| AI Allure | 12 | 9 | 2 |  |  |
| Dream Companion | 12 | 6 | 3 | relationship_voice | unverified; individual evidence segment |  |
| Lovescape | 9 | 9 | 1 | AI companion platform | AI romance | discovery | multilingua |  |
| Promptchan AI | 9 | 8 | 2 |  |  |
| JuicyChat.AI | 9 | 5 | 2 | discovery | provisional directory-only | visual/mobile disco |  |
| GoLove AI | 8 | 8 | 1 | multilingual | provisional directory-only | relationship_voi |  |
| OpenRouter | 8 | 3 | 3 |  |  |
| MyBabes AI | 7 | 7 | 2 | provisional directory-only | visual/mobile discovery; scope  |  |
| DarLink AI | 7 | 6 | 2 | AI companion | AI girlfriend and image-generation platform | |  |
| FantasyGF | 7 | 5 | 2 | Relationship/long-term or voice; not verified | Relationship |  |
| Xotic AI | 7 | 5 | 2 |  |  |
| MyLovely AI | 6 | 5 | 2 | AI girlfriend roleplay platform | provisional directory-only |  |
| HeraHaven | 6 | 4 | 2 | provisional directory-only | uncertain |  |
| Zeta (제타 / ゼタ) | 6 | 4 | 2 |  |  |
| CreatePorn | 5 | 5 | 1 |  |  |
| Fantasy AI | 5 | 5 | 1 | provisional directory-only | visual/mobile plausible platfor |  |
| NSFW AI Chat | 5 | 5 | 1 |  |  |
| Rolemantic | 5 | 5 | 1 |  |  |
| Seduced AI | 5 | 5 | 1 |  |  |
| CamSoda AI | 5 | 4 | 3 |  |  |
| ChatUp AI | 5 | 4 | 2 |  |  |
| NSFWLover | 5 | 4 | 2 | adjacent conversational platform |  |

## affiliate-source share

- overall: 107 of 218 source URLs (49.1%) declared affiliate
- top-25 supply-only rows: 129 of 190 (67.9%)

## parse failures

| run | file | issue | detail |
|---|---|---|---|
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 24066: 64 platforms | embedded objects merged |
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 48379: 97 platforms | embedded objects merged |
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 82739: 100 platforms | embedded objects merged |
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 119766: 60 platforms | embedded objects merged |

## unresolved merges and domain conflicts

None flagged.

## parse mode per C run

- C-gem: whole-file JSON
- C-ppx: JSON-ish bracket scanner (tokenizer-mangled export)
- C-ven: embedded objects merged
