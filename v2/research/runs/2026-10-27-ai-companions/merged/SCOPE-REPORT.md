# Scope report

Generated: 2026-10-30

Applied 01-scope-gemini.json mechanically to merged/shortlist-usage.csv.
Used only facts already in our data (census A/B files, entity facts, ecosystem role) plus
logged first-party check URLs. No list positions, no traffic, no affiliate status were used.

- rows scoped: **248**
- decisions: borderline=21, in=220, out=7
- categories: byok_local_frontends=16, dedicated_virtual_companions=44, hosted_character_hubs=172, hybrid_hub_and_frontend=6, interactive_story_engines=3, out=7

## Counts per (category, decision)

| category | in | borderline | out |
|---|---|---|---|
| byok_local_frontends | 16 | 0 | 0 |
| dedicated_virtual_companions | 44 | 0 | 0 |
| hosted_character_hubs | 151 | 21 | 0 |
| hybrid_hub_and_frontend | 6 | 0 | 0 |
| interactive_story_engines | 3 | 0 | 0 |
| out | 0 | 0 | 7 |

## Out rows (rule applied + needs_check)

| row | rule applied | needs_check |
|---|---|---|
| Replika | pivot case: judge strictly by current live policy (census A/B record the 2023 intimacy removal and current SFW-first product) | can a new account access explicit NSFW chat on standard tiers today? (first-party ToS) — decides in vs stays out |
| Character.AI | E1: SFW-only platform (census A first-party review pages: SFW product with NSFW only via community workarounds) | none further — first-party SFW status already recorded; re-check only if it pivots |
| AI Horde / KoboldAI Horde | E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded | na — categorical: no persona/card management by category definition |
| OpenRouter | E3: raw LLM API router (borderline case 4: backend fuel only) | na — categorical by category definition |
| Anthropic / Claude API | E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded | na — categorical: no persona/card management by category definition |
| Ollama | E3: local model hosting/runtime with no shipped character/persona UI | na — categorical by category definition |
| NanoGPT | E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded | na — categorical: no persona/card management by category definition |

## Borderline rows (rule applied + needs_check)

| row | rule applied | needs_check |
|---|---|---|
| Candy AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| OurDream AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| GirlfriendGPT | B3: adult image/video generation suite with a chat tab — include only if chat engine competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| DreamGF | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| Secrets AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| Nectar AI (TryNectar) | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| Swipey AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| DarLink AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| Muah AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| FantasyGF | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| Secret Desires AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| Zeta AI | B4: regional / non-English-primary platform — excluded from an English Top 10 unless full localization + fluent English output verified | first-party UI localization check + international payments + English-language model fluency |
| Cuties AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| Soulkyn AI | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| eHentai.ai | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| GPT-SoVITS | B3/role-conflict: ecosystem-role vote is conflicted (model/api vs hosted) — borderline case 4 must be settled first-party | first-party product page: can a user start a hosted persona chat session with built-in persona management? (decides B3 suite vs raw gateway) |
| Caveduck | B4: regional / non-English-primary platform — excluded from an English Top 10 unless full localization + fluent English output verified | first-party UI localization check + international payments + English-language model fluency |
| AI Angels | B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits? |
| UnoRouter | B3/role-conflict: ecosystem-role vote is conflicted (model/api vs hosted) — borderline case 4 must be settled first-party | first-party product page: can a user start a hosted persona chat session with built-in persona management? (decides B3 suite vs raw gateway) |
| Venice.ai | B3/role-conflict: ecosystem-role vote is conflicted (model/api vs hosted) — borderline case 4 must be settled first-party | first-party product page: can a user start a hosted persona chat session with built-in persona management? (decides B3 suite vs raw gateway) |
| Grok | B1: general-purpose assistant with an adult/"unhinged" mode (borderline case 1) | does the product offer dedicated persona persistence / character-card slots / relationship memory? (first-party product pages) |

## Categories reference

- **hosted_character_hubs** (Hosted Character Roleplay Hubs) — Turnkey web or mobile platforms featuring searchable directories of community-created or platform-provided character cards, integrated LLM inference, and scenario-driven roleplay.
- **dedicated_virtual_companions** (Dedicated Virtual Companions (1-on-1)) — Hosted platforms focused on cultivating a persistent, long-term relationship with a single customizable AI partner, emphasizing cross-session memory, voice calls, and consistent avatar/selfie generation over browsing thousands of public bots.
- **hybrid_hub_and_frontend** (Hybrid Card Repositories & BYOK Platforms) — Platforms that serve as public character card repositories and offer optional first-party hosted chat while natively supporting Bring-Your-Own-Key (BYOK) external API routing.
- **byok_local_frontends** (Self-Hosted / Local Chat Frontends) (ranked separately) — Client-side interfaces (desktop/local web UI) that provide advanced roleplay scaffolding (lorebooks, regex, group chats, prompt formatting) but require the user to supply their own local model weights or external API keys.
- **interactive_story_engines** (Interactive Fiction & Co-Writing Engines) (ranked separately) — Document- or adventure-style AI writing platforms designed for third-person or second-person narrative progression rather than direct conversational chat.

## Check log

Every scoped row has a check entry in merged/scope-checks.csv: either a census-A fact URL
already on file, or the platform home domain marked first-party ToS check pending.
No new lives were fabricated; every recorded check URL is a URL we already hold or the row domain.
