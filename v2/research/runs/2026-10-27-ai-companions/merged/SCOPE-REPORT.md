# Scope report

Generated: 2026-10-31

Applied 01-scope-gemini.json mechanically to merged/shortlist-usage.csv (runs through scope-pass.py),
then resolved via census-scope-checks-perplexity.json with the CFO resolution rules (scope-resolve.py).
Used only facts already in our data plus logged first-party check URLs. No list positions, no traffic,
no affiliate status were used.

- rows scoped: **246**
- decisions: borderline=11, in=224, out=11
- categories: byok_local_frontends=17, dedicated_virtual_companions=44, hosted_character_hubs=165, hybrid_hub_and_frontend=6, interactive_story_engines=3, out=11

## Counts per (category, decision)

| category | in | borderline | out |
|---|---|---|---|
| byok_local_frontends | 17 | 0 | 0 |
| dedicated_virtual_companions | 44 | 0 | 0 |
| hosted_character_hubs | 154 | 11 | 0 |
| hybrid_hub_and_frontend | 6 | 0 | 0 |
| interactive_story_engines | 3 | 0 | 0 |
| out | 0 | 0 | 11 |

## Out rows (rule applied + needs_check)

| row | rule applied | needs_check |
|---|---|---|
| Replika | Test F resolved (Perplexity first-party evidence, 2026-10-31). Replika stays OUT per the CFO rule (needs_check retained): Test F unresolved â€” no current first-party statement entitles a brand-new account to explicit roleplay on a standard paid tier | first-party statement confirming explicit roleplay entitlement for new accounts |
| Character.AI | E1: SFW-only platform (census A first-party review pages: SFW product with NSFW only via community workarounds) | none further â€” first-party SFW status already recorded; re-check only if it pivots |
| Zeta AI | Test C resolved (Perplexity first-party evidence, 2026-10-31). Test C unresolved -> default_if_unresolved applied verbatim: 'exclude_main (Gemini borderline default)' (B4 regional). Perplexity found no full localization/payment/explicit-permission fi | full English localization + international payments + explicit-permission policy page would flip to in |
| GPT-SoVITS | Test B resolved (Perplexity first-party evidence, 2026-10-31). Test B fail taken as-is: first-party GitHub states the project is a voice-conversion/TTS WebUI, not a hosted persona-chat service â€” first-party failure evidence on the B part (borderlin | GPT-SoVITS itself is a speech-generation project, not a hosted persona-chat service. A third-party application integrating its voices would be a separate product and does not make the project pass thi |
| Caveduck | Test C resolved (Perplexity first-party evidence, 2026-10-31). Test C unresolved -> default applied verbatim (B4 regional). Perplexity found English + NSFW classification, but localization and payments unestablished. Review verdict = 'unresolved; pri | full English localization + international payments + explicit-text permission page |
| AI Horde / KoboldAI Horde | E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded | na â€” categorical: no persona/card management by category definition |
| OpenRouter | E3: raw LLM API router (borderline case 4: backend fuel only) | na â€” categorical by category definition |
| Anthropic / Claude API | E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded | na â€” categorical: no persona/card management by category definition |
| Ollama | E3: local model hosting/runtime with no shipped character/persona UI | na â€” categorical by category definition |
| NanoGPT | E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded | na â€” categorical: no persona/card management by category definition |
| Grok | Test D resolved (Perplexity first-party evidence, 2026-10-31). Test D unresolved -> default applied verbatim (B1 adult-mode assistant). First-party docs cover work-oriented Bots; companion-persona memory and explicit-text permission not established.  | xAI first-party confirmation that Companion personas persist with explicit-text permission |

## Borderline rows (rule applied + needs_check)

| row | rule applied | needs_check |
|---|---|---|
| Candy AI | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. Chat part passes from Candy's own ToS (unlimited messaging + separate monthly token allowance; ordinary chat not metered against image credits) and first-party memo |  |
| GirlfriendGPT | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. NSFW part passes via own product copy (NSFW AI chat platform; sexting/roleplay advertised). Chat part unresolved: no first-party evidence located for memory plus cr | first-party memory + billing page |
| DreamGF | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. Chat part unresolved (only a special fictional-character page was reviewed; its limitations do not generalize to the main product). NSFW part unresolved (no affirma | first-party companion-dialog memory + billing page and explicit-text policy permission |
| DarLink AI | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. Chat part passes on plan-selection evidence (separate message allowances + memory levels; image/video separately tokenized). NSFW part unresolved: an NSFW pricing l | first-party policy/FAQ text permitting explicit adult chat |
| Muah AI | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. Chat part passes: official first-party FAQ documents permanent memory with chat/voice/photos (custom-prompt billing not contradicted). NSFW part unresolved: no firs | first-party explicit-text policy permission page |
| FantasyGF | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. NSFW part passes via first-party product copy (NSFW chat/erotic roleplay on own character pages). Chat part unresolved: memory plus credit-independent custom prompt | first-party memory/billing page |
| Secret Desires AI | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. Chat part passes (unlimited messaging, no-Hearts chat/creation per their own comparison page; memory documented via guide). NSFW part unresolved: no affirmative fir | first-party policy/FAQ text permitting explicit adult chat |
| Cuties AI | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. NSFW part passes (own site: adults-only; conversations may contain pornographic materials). Chat part unresolved: memory plus no-image-credit custom prompting not e | first-party memory/billing page |
| Soulkyn AI | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. Borderline-retained as the record itself keeps the combined test unresolved: FAQ documents memory + uncensored adult conversations, but Perplexity's note says the f | first-party confirmation that custom character creation/setup does not consume the image-generation currency |
| eHentai.ai | Test A unresolved (Perplexity first-party evidence, 2026-10-31): borderline-retained. Chat and NSFW parts both unresolved (terms cover DreamAI SRL identity and plan wording only). Review verdict = 'unresolved'; prior decision 'borderline'. default_if | first-party companion memory/billing page and explicit-text permission |
| AI Angels | B3: adult image/video generation suite with a bolted-on chat tab â€” include only if the chat engine is competitive standalone | borderline case 3 test: first-party chat feature page â€” multi-turn memory + custom personas independent of image credits? |

## Categories reference

- **hosted_character_hubs** (Hosted Character Roleplay Hubs) — Turnkey web or mobile platforms featuring searchable directories of community-created or platform-provided character cards, integrated LLM inference, and scenario-driven roleplay.
- **dedicated_virtual_companions** (Dedicated Virtual Companions (1-on-1)) — Hosted platforms focused on cultivating a persistent, long-term relationship with a single customizable AI partner, emphasizing cross-session memory, voice calls, and consistent avatar/selfie generation over browsing thousands of public bots.
- **hybrid_hub_and_frontend** (Hybrid Card Repositories & BYOK Platforms) — Platforms that serve as public character card repositories and offer optional first-party hosted chat while natively supporting Bring-Your-Own-Key (BYOK) external API routing.
- **byok_local_frontends** (Self-Hosted / Local Chat Frontends) (ranked separately) — Client-side interfaces (desktop/local web UI) that provide advanced roleplay scaffolding (lorebooks, regex, group chats, prompt formatting) but require the user to supply their own local model weights or external API keys.
- **interactive_story_engines** (Interactive Fiction & Co-Writing Engines) (ranked separately) — Document- or adventure-style AI writing platforms designed for third-person or second-person narrative progression rather than direct conversational chat.

## Census-scope-checks-perplexity: every checked row, before → after

| row | test | review verdict | before | after | deciding evidence URL |
|---|---|---|---|---|---|
| Candy AI | A | unresolved | borderline | borderline | https://candy.ai/terms-of-service |
| OurDream AI | A | fail | borderline | in | https://help.ourdream.ai/en/articles/10808513 |
| GirlfriendGPT | A | unresolved | borderline | borderline | https://www.gptgirlfriend.online/tag/robot |
| DreamGF | A | unresolved | borderline | borderline | https://dreamgf.ai/terms |
| Secrets AI | A | pass | borderline | in | https://wiki.secrets.ai/create/custom-characters |
| Nectar AI (TryNectar) | A | pass | borderline | in | https://nectar.ai/faq |
| Swipey AI | A | pass | borderline | in | https://swipey.ai/ |
| DarLink AI | A | unresolved | borderline | borderline | https://darlink.ai/plan-selection |
| Muah AI | A | unresolved | borderline | borderline | https://muah.ai/info/about.php |
| FantasyGF | A | unresolved | borderline | borderline | https://fantasygf.ai/character/barbara-barber |
| Secret Desires AI | A | unresolved | borderline | borderline | https://secretdesires.ai/plans |
| Cuties AI | A | unresolved | borderline | borderline | https://cuties.ai/ |
| チャチャ / アニロール | A | unresolved | see scoped.json history | in | https://landing.soulkyn.com/l/en-US/ai-companion-platform |
| eHentai.ai | A | unresolved | borderline | borderline | https://ehentai.ai/terms |
| Venice.ai | B | pass | borderline | in | https://venice.ai/characters |
| UnoRouter | B | pass | borderline | in | https://unorouter.ai/ |
| GPT-SoVITS | B | fail | borderline | out | https://github.com/RVC-Boss/GPT-SoVITS |
| Zeta AI | C | unresolved | borderline | out | https://zeta-ai.io/en/policy/terms |
| Caveduck | C | unresolved | borderline | out | https://caveduck.io/en |
| Grok | D | unresolved | borderline | out | https://docs.x.ai/grok-bot/bots |
| CamSoda AI | E | pass | in | in | https://camsoda.ai/ |
| Replika | F | unresolved | out | out | https://help.replika.com/hc/en-us/articles/39551043419149-Choosing-a-Subscription |

## Variant-row side notes

- Zeta (제타 / ゼタ): variant row of Scatterlab zeta (same product as Zeta AI); Test C unresolved applies — variant row keeps its needs_check pending the same first-party fact set.
- Replika: test F unresolved → stays OUT per the CFO rule (needs_check retained). Prior decision unchanged.
