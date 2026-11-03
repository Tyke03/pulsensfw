# Red flags report

Generated: 2026-11-03

Idempotent: rebuilt from scratch every run; scope-pass -> scope-resolve ->
redflags-ingest is the required pipeline order for merged/scoped.csv.

## Model sources

| model | prefix | file(s) | records parsed | rows joined |
|---|---|---|---|---|
| gemini | gemini | redflags-gemini-1.json | 235 | 235 |
| perplexity | pplx | redflags-perplexity-1.json | 235 | 235 |
| venice | venice | redflags-venice-1.json | 59 | 59 |

Records that did not join any scoped row: 0
Parse/log failures: 0

## Per-model answer coverage (joined rows)

| model | nsfw yes | nsfw no | nsfw unresolved | chat yes | chat no | chat unresolved |
|---|---|---|---|---|---|---|
| gemini | 158 | 17 | 60 | 118 | 6 | 111 |
| pplx | 70 | 4 | 161 | 63 | 5 | 167 |
| venice | 32 | 11 | 16 | 22 | 12 | 25 |

pplx_scope = census-scope-checks-perplexity.json Test A first-party answers as executed by
scope-resolve.py (chat part -> chat_without_image_credits, NSFW part -> nsfw_first_party;
soulkyn kept unresolved per that record itself; 14 nsfw plus 14 chat contributions joined).

## Merged counts (all scoped rows joined by any model)

- merged nsfw_first_party (in+borderline rows): conflict=2, no=26, unresolved=45, yes=162
- merged chat_without_image_credits (in+borderline rows): conflict=7, no=15, unresolved=73, yes=140
- nsfw yes rows whose only yes sources are non-verbatim (evidence_strength=paraphrase): 133

## Conflicts (resolved sources disagree — kept side by side)

### nsfw field: 2 row(s)

| platform | merged answer sources |
|---|---|
| aroused-ai | gemini=yes[u]  | pplx=no[verbatim][u]  | venice=no[verbatim][u]  |
| pixelchat | gemini=yes | pplx=no[u]  |

### chat field: 7 row(s)

| platform | merged answer sources |
|---|---|
| candy-ai | pplx_scope=yes | gemini=yes[u]  | pplx=unresolved[u]  | venice=no[u]  |
| promptchan-ai | gemini=no[u]  | pplx=yes[u]  |
| botify | gemini=yes[u]  | pplx=unresolved | venice=no[u]  |
| chatup-ai | gemini=yes[u]  | pplx=yes[u]  | venice=no[u]  |
| backyard-ai-faraday-faraday-dev-byai | gemini=yes[u]  | pplx=no[u]  | venice=yes[u]  |
| cherrypop-ai | gemini=unresolved[u]  | pplx=yes[u]  | venice=no[u]  |
| crushi-ai | gemini=yes[u]  | pplx=unresolved | venice=no[u]  |

Conflict rows go to the deep pass regardless of prominence (owner instruction:
resolved-source disagreement cannot be collapsed silently).

## Downgraded flags (model claimed recurring/2+ users, recount below that)

Recount method: each username counted once; usernames come from named handles
(reddit /user/ patterns) plus one user per distinct non-blocked
independent_user source URL — conservative; Reddit thread URLs with several
complainers inside count as ONE unit until named-handle evidence exists.
Affiliate/review-site domains never count: synonymsvault, aifreands, aigirlfriendbase, funfun, tryclout, companaya, spicyranked.

Downgraded flags: 35

| platform | flag | new status | downgraded claims |
|---|---|---|---|
| spicychat-ai | filter_tightening | isolated | pplx: status recurring -> 1 users |
| crushon-ai | deceptive_marketing | isolated | gemini: status recurring -> 1 users |
| chub-ai | billing | isolated | venice: status recurring -> 1 users |
| nomi-ai | billing | isolated | pplx: status recurring -> 1 users |
| nomi-ai | moderation_failure_csam_deepfake | isolated | gemini: status recurring -> 1 users |
| janitor-ai | content_purge | isolated | pplx: status recurring -> 1 users |
| kupid-ai | billing | isolated | pplx: status recurring -> 1 users |
| lovescape | billing | isolated | pplx: status recurring -> 1 users |
| swipey-ai | billing | isolated | pplx: status recurring -> 1 users |
| chai | moderation_failure_csam_deepfake | isolated | gemini: status recurring -> 0 users |
| polybuzz-formerly-poly-ai | filter_tightening | isolated | pplx: status recurring -> 1 users |
| darlink-ai | billing | isolated | pplx: status recurring -> 1 users |
| fantasygf | billing | isolated | pplx: status recurring -> 1 users |
| nastia-ai | billing | isolated | pplx: status recurring -> 1 users |
| nastia-ai | deceptive_marketing | isolated | pplx: status recurring -> 1 users |
| fictionlab | filter_tightening | isolated | pplx: status recurring -> 1 users |
| botify | filter_tightening | isolated | pplx: status recurring -> 1 users |
| ai-girlfriend-trumate | billing | isolated | pplx: status recurring -> 1 users; venice: status recurring -> 1 users |
| chat-ia-de-personajes-anime | billing | isolated | pplx: status recurring -> 1 users |
| chat-ia-de-personajes-anime | deceptive_marketing | isolated | venice: status recurring -> 1 users |
| chat-de-personajes-con-ia | deceptive_marketing | isolated | venice: status recurring -> 1 users |
| crushie | deceptive_marketing | isolated | pplx: status recurring -> 1 users |
| sexy-chatbot-x-no-filter-ai | deceptive_marketing | isolated | pplx: status recurring -> 1 users |
| chatup-ai | billing | isolated | venice: status recurring -> 1 users |
| kink-ai | content_purge | isolated | pplx: status recurring -> 1 users |
| kink-ai | filter_tightening | isolated | pplx: status recurring -> 1 users |
| kink-ai | policy_pivot | isolated | pplx: status recurring -> 1 users |
| soulfun | billing | isolated | pplx: status recurring -> 1 users |
| moescape-ai | policy_pivot | isolated | gemini: status recurring -> 1 users |
| boyfi-ai-partner-boyfriend | billing | isolated | venice: status recurring -> 1 users |
| charbot | deceptive_marketing | isolated | venice: status recurring -> 1 users |
| discutez-avec-un-ami-ia | billing | isolated | pplx: status recurring -> 1 users |
| brazzers-ai | billing | isolated | venice: status recurring -> 1 users |
| dreampress-ai | billing | isolated | pplx: status recurring -> 1 users |
| venice-ai | billing | isolated | pplx: status recurring -> 1 users |

## Coverage

- rows with at least one unioned flag (coverage=researched): 85
- rows with zero flags from every model (coverage=not_researched — never 'clean'): 150

## scope_pending resolutions

- pending rows at run start: 11
- resolved in: 10
- resolved out (first-party failure evidence): 0
- stayed borderline: 1
- final scope_pending=true rows: 1

| resolved in | decided_by | of which paraphrase-only yes |
|---|---|---|
| girlfriendgpt | gemini+pplx+pplx_scope | yes |
| dreamgf | gemini+pplx | yes |
| darlink-ai | gemini | yes |
| muah-ai | gemini |  |
| fantasygf | gemini+pplx+pplx_scope | yes |
| secret-desires-ai | gemini+pplx | yes |
| cuties-ai | gemini+pplx+pplx_scope |  |
| soulkyn-ai | gemini+pplx | yes |
| ehentai-ai | gemini+pplx |  |
| ai-angels | gemini+pplx+venice | yes |

Stayed borderline: candy-ai

## White-label families (union across models)

| family | rows |
|---|---|
| Candy AI / DreamGF style companion hub | 4 |
| Candy AI / DreamGF style companionhub | 3 |
| NextDay AI operator group; shared legal entities verified, white-label licensing unverified | 2 |
| Candy AI style companion hub | 2 |
| Anima / MyAnima companionfamily | 2 |
| DreamAI SRL (DreamGF / DreamBF /eHentai.ai / FantasyGF) | DreamAI SRL: DreamBF / DreamGF / eHentai; common operator verified, white-label licensing unverified | 2 |
| Yodayo / Moescape dual-domainfamily | 2 |
| Candy AI / EverAI /Scrile / Triple Minds archetype | EverAI (with Yume AI) | 1 |
| OurDream /NSFW Coders white-label family | 1 |
| Candy AI / GirlfriendGPT style companionhub | 1 |
| DreamAI SRL(DreamGF / DreamBF / eHentai.ai / FantasyGF) | DreamAI SRL: DreamBF / DreamGF / eHentai; common operator verified, white-label licensing unverified | 1 |
| Cyprus6-year-retention companion template (Kupid AI / SoulkynAI) | 1 |
| Lovescape .com / .ai: shared operator and address verified; white-label licensing unverified | 1 |
| Swipe-style Cyprus/Baltic AI companionfamily | 1 |
| DreamGF / Candy AI style token hub | 1 |
| CreatePorn network (CreateAIShemale, CreateHentai niche sites) | 1 |
| DreamAI SRL (DreamGF / DreamBF /eHentai.ai / FantasyGF) | 1 |
| Candy AI / Secret Desires companionhub | 1 |
| DreamGF / Candy AIwhite-label template family | Lovescape / Warmtech: current cross-brand footer association; licensing arrangement unverified | 1 |
| Cyprus/EU 6-year-retention companion template (Kupid AI/ Soulkyn AI) | 1 |
| MiniMax (Glow/ Xingye / Talkie / Talkie Lab) | 1 |
| Candy.ai / EverAI: current branded and legal-footer association verified; white-label licensing unverified | 1 |
| Candy AI / DreamGF style token-gatedcompanion hub | 1 |
| DreamGF / Candy AI style companion hub | 1 |
| Aylo | 1 |
| Swipe-style Cyprus AI companionfamily | 1 |
| MessengerX.io character engine; homepage names Waifu Chat, AI Girlfriend and AI Boyfriend as powered apps, exact store identities unverified | 1 |
| MiniMax (Glow / Xingye / Talkie /Talkie Lab) | 1 |

## Deep pass inputs

- deep-pass rows: 144 (weakness criteria: merged nsfw unresolved/conflict,
  chat conflict, coverage not_researched, nsfw-paraphrase-only; AND prominence: usage
  band A/B/C OR community users A+B>=3 OR supply_runs>=3 OR scope_pending; conflicts
  bypass the prominence gate; a paraphrase-only weakness is sustained ONLY by band
  A/B/C or supply_runs>=3 — community-only or scope_pending prominence no longer
  suffices for it — owner instruction 2026-11-03)
- outputs: merged/redflags-deep-pass-input.txt; 10 prompt file(s) merged/redflags-deep-prompt-1..10.txt (max 15 platforms per file; stale higher-numbered files deleted each run)

| weakness triggers | count |
|---|---|
| chat_conflict | 7 |
| coverage_not_researched | 98 |
| nsfw_conflict | 2 |
| nsfw_unresolved | 40 |
| nsfw_yes_paraphrase_only | 78 |

Rows entering via the conflict bypass (no band/community/supply/pending): 9

## Output files

- merged/redflags.csv (per-model answer columns, merged fields with decided_by + sources,
  union flags with recount + downgrade audit trail, flags_json)
- merged/redflags-deep-pass-input.txt (144 rows)
- merged/redflags-deep-prompt-1..10.txt
- merged/scoped.csv (joined summary columns; full detail lives in redflags.csv)
- v2/research/method/03-red-flags-prompt.txt remains the verbatim prompt; deep prompts add
  the in-depth research line above each PLATFORMS list

