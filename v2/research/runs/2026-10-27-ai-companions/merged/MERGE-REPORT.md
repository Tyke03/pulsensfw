# Census merge report

Generated: 2026-10-29 (today)

Inputs: census A = Strawberry (`census-A-strawberry/nsfw-ai-platform-census.json` + identity-aliases copy), census B = Gemini (`census-B-gemini.json`), census C = 3 supply runs parsed from `full_census_txt/` (gemini whole-file JSON; perplexity and venice embedded-in-markdown objects). No ranking, no quality judgement, no invented names.

## Totals

- canonical platforms: **1512** (one row per canonical platform; census-A adjacent-entity names excluded from the table, see counts below)
- census-A adjacent entities (models/directories/incidental names) canonical-unique and platform-absent: **1162** (kept out of the table; logged in merge-log)
- by ecosystem_role (majority vote across C runs): (none)=808, hosted platform=568, frontend/local tool=51, model/api=36, other=24, card/lore hub=21, other (review directory)=3, other (image generator)=1
- frontend/local-tool rows flagged: **66**
- supply_runs_count histogram: 4 runs=28, 3 runs=44, 2 runs=102, 1 runs=530, 0 runs=808
- qualified_A (3-link bar as computed by census A): 15; qualified_B (Gemini, community): 29; qualified_recomputed (3+ unique source threads across A+B): 34

## Run-overlap matrix (canonical names found in both runs)

|    | A | B | C-gem | C-ppx | C-ven | C-argon |
|---|---|---|---|---|---|---|
| A | - | 46 | 72 | 115 | 129 | 97 |
| B | 46 | - | 41 | 33 | 25 | 29 |
| C-gem | 72 | 41 | - | 50 | 49 | 44 |
| C-ppx | 115 | 33 | 50 | - | 90 | 87 |
| C-ven | 129 | 25 | 49 | 90 | - | 82 |
| C-argon | 97 | 29 | 44 | 87 | 82 | - |

## Capture-recapture on the C runs (pairwise, N ~ n1*n2/overlap)

| pair | n1 | n2 | overlap | N estimated | note |
|---|---|---|---|---|---|
| C-gem&C-ppx | 98 | 298 | 50 | 584.1 |  |
| C-gem&C-ven | 98 | 320 | 49 | 640.0 |  |
| C-gem&C-argon | 98 | 262 | 44 | 583.5 |  |
| C-ppx&C-ven | 298 | 320 | 90 | 1059.6 |  |
| C-ppx&C-argon | 298 | 262 | 87 | 897.4 |  |
| C-ven&C-argon | 320 | 262 | 82 | 1022.4 |  |

## usage_signal completeness (% of canonical rows with a non-empty value, per run)

| run | web_visits | app_downloads |
|---|---|---|
| C-gem | 0.7% (10) | 0.6% (9) |
| C-ppx | 1.5% (22) | 0.0% (0) |
| C-ven | 0.7% (11) | 0.2% (3) |
| C-argon | 0.8% (12) | 0.2% (3) |

## community-only (qualified in A or B, but list_frequency max <= 3 in supply runs)

| canonical_name | community_users_A | community_users_B | qualified flags | note |
|---|---|---|---|---|
| KoboldCpp | 5 | 8 | A | |
| Caveduck | 4 | 4 | B | |
| WyvernChat | 2 | 4 | B | |
| Yodayo | 2 | 7 | B | |
| Agnai | 0 | 6 | B | |
| Tavo | 0 | 10 | B | |
| Moescape AI | 1 | 4 | B | |
| Paradot | 1 | 5 | B | |
| Backyard AI (Faraday / Faraday.dev / BYAI) | 0 | 12 | B | |
| Dreamjourney AI | 0 | 8 | B | |
| Sakura AI | 0 | 6 | B | |
| Saucepan AI | 0 | 10 | B | |
| Xoul AI | 0 | 7 | B | |
| Saylo | 7 | 0 | A | |
| Oobabooga (Text Generation WebUI) | 0 | 8 | B | |
| Grok | 10 | 0 | A | |
| Zeta AI | 6 | 5 | A | |

## supply-only big (top 25 by unique-source count with no community evidence)

| canonical_name | unique_source_list_count | lf_max | supply_runs | segment | frontend_flag |
|---|---|---|---|---|---|
| GirlfriendGPT | 35 | 20 | 4 | AI companion | AI girlfriend roleplay platform | Adjacent or |  |
| Nectar AI (TryNectar) | 19 | 9 | 4 | Relationship/voice discovery | discovery | image/video-first |  |
| Kupid AI | 18 | 10 | 4 | companion | uncertain | unverified identity and scope; see e |  |
| aiAllure | 14 | 9 | 3 |  |  |
| Dream Companion | 13 | 6 | 4 | relationship_voice | unverified; individual evidence segment |  |
| JuicyChat.AI | 13 | 5 | 3 | discovery | provisional directory-only | visual/mobile disco |  |
| Lovescape | 11 | 9 | 2 | AI companion platform | AI romance | discovery | multilingua |  |
| OpenRouter | 11 | 3 | 4 |  |  |
| Nastia AI | 10 | 5 | 3 |  |  |
| Promptchan AI | 9 | 8 | 2 |  |  |
| Xotic AI | 9 | 5 | 3 |  |  |
| GoLove AI | 8 | 8 | 1 | multilingual | provisional directory-only | relationship_voi |  |
| MyBabes AI | 8 | 7 | 3 | provisional directory-only | visual/mobile discovery; scope  |  |
| FantasyGF | 8 | 5 | 3 | Relationship/long-term or voice; not verified | Relationship |  |
| DarLink AI | 7 | 6 | 2 | AI companion | AI girlfriend and image-generation platform | |  |
| MyLovely AI | 7 | 5 | 3 | AI girlfriend roleplay platform | provisional directory-only |  |
| HeraHaven | 7 | 4 | 3 | provisional directory-only | uncertain |  |
| Botify AI | 7 | 3 | 3 |  |  |
| CharacterHub | 7 | 3 | 3 |  |  |
| Couple Me | 7 | 3 | 3 |  |  |
| CreatePorn | 6 | 5 | 2 |  |  |
| NSFW AI Chat | 6 | 5 | 2 |  |  |
| Seduced AI | 6 | 5 | 2 |  |  |
| CamSoda AI | 6 | 4 | 4 |  |  |
| ChatUp AI | 6 | 4 | 3 |  |  |

## affiliate-source share

- overall: 107 of 229 source URLs (46.7%) declared affiliate
- top-25 supply-only rows: 116 of 170 (68.2%)

## parse failures

| run | file | issue | detail |
|---|---|---|---|
| C-argon | argon-census.txt | object at 14315: 263 platforms | embedded objects merged |
| C-argon | argon-census.txt | repaired 84 URL strings with PDF line-break spaces | embedded objects merged |
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 24066: 64 platforms | embedded objects merged |
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 48379: 97 platforms | embedded objects merged |
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 82739: 100 platforms | embedded objects merged |
| C-ven | venice-nsfw-ai-platform-census+deep-search-addendum.txt | object at 119766: 60 platforms | embedded objects merged |

## unresolved merges and domain conflicts

None flagged.

## parse mode per C run

- C-gem: whole-file JSON (whitespace-collapsed PDF text)
- C-ppx: JSON-ish bracket scanner (tokenizer-mangled export)
- C-ven: embedded objects merged
- C-argon: embedded objects merged
