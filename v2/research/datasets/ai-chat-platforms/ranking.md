# AI chat & companion platforms — ranked picks

Built from `platforms.json` (dataset built 2026-11-04) with config `rank-config.json` (digest 29d73cd278d2) by `v2/research/tools/rank.py` - deterministic: reruns over unchanged inputs are byte-identical. The underlying dataset stays descriptive; this ranking adds the documented preference weighting below. **Never hand-edit the outputs — change the config and rerun.** Replacement rule: a pick only leaves a list at a rerun when a higher-scoring evidenced row exists to replace it — the rerun is the arbiter, so never hand-edit outputs; adjust this config instead.

## Eligibility (from the config)
- required: `scope_decision` one of ['in'] — merged scope decision = in (borderline rows stay in the dataset but are not ranked; scope out is not in the dataset)
- required: `nsfw_answer` one of ['yes'] — merged NSFW answer = yes
- rows failing a requirement: 71 (labels only, not ranked)
- listed separately below with reasons instead of silently dropped: 3

## Scoring (all weights and points from the config)
score = SUM(factor_weight x factor_points) - SUM(flag cost); flag cost = severity(type) x unit(status)

| factor | source column | weight | points / cap |
|---|---|---:|---|
| band | `usage_band` | 2.0 | A=4 B=3 C=2 D=1 U=0 unknown=0 |
| supply | `supply_runs` | 1.0 | value, capped at 4 |
| community | `community_users` | 1.0 | value, capped at 5 |
| confidence | `confidence` | 1.5 | high=3 medium=2 low=1 unknown=0 |
| flags (penalty) | `flags` | 1.0 | unit(status): recurring=2 · isolated=1 |
| | | | severity(type): billing=3 · data_breach=3 · moderation_failure_csam_deepfake=3 · deceptive_marketing=2 · white_label_clone=2 · content_purge=2 · filter_tightening=2 · shutdown_risk=2 · policy_pivot=1 · unknown type=1 |

[rec] = recurring flag (2+ independent users recounted) · [iso] = isolated report. Top 3 flags shown per row; see `rank-config.json` severity table for all types.
Provisional rows (`confidence` one of ['low']) keep their rank but are flagged: unverified weighting inputs, not errors.

## Main picks — hosted hubs, companions, hybrids (top 10 of 142 eligible)

| # | platform | score | band pts | supply pts | community pts | confidence pts | flags − | top red flags | confidence | provisional |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | OurDream AI (`ourdream-ai`) | 18.0 | 8.0 | 4.0 | 5.0 | 3.0 | -2.0 | white_label_clone[iso] | medium |  |
| 2 | Janitor AI (`janitor-ai`) | 17.0 | 8.0 | 4.0 | 5.0 | 3.0 | -3.0 | content_purge[iso] · policy_pivot[iso] | medium |  |
| 3 | Chub AI (`chub-ai`) | 15.5 | 6.0 | 4.0 | 5.0 | 4.5 | -4.0 | billing[iso] · policy_pivot[iso] | high |  |
| 4 | Paradot (`paradot`) | 15.5 | 8.0 | 1.0 | 5.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 5 | Sakura AI (`sakura-ai`) | 15.5 | 6.0 | 3.0 | 5.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 6 | Character Tavern (`character-tavern`) | 14.5 | 4.0 | 4.0 | 5.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 7 | Hi Waifu (`hi-waifu`) | 14.5 | 6.0 | 2.0 | 5.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 8 | Perchance AI (`perchance-ai`) | 14.5 | 8.0 | 1.0 | 4.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 9 | Kindroid (`kindroid`) | 14.0 | 6.0 | 4.0 | 5.0 | 3.0 | -4.0 | billing[iso] · policy_pivot[iso] | medium |  |
| 10 | Moescape AI (`moescape-ai`) | 14.0 | 6.0 | 1.0 | 5.0 | 3.0 | -1.0 | policy_pivot[iso] | medium |  |

### Near misses — Main picks — hosted hubs, companions, hybrids (ranks 11-15)

| # | platform | score | gap to cut | kept out by (factor deltas vs the last pick) |
|---:|---|---:|---:|---|
| 11 | WyvernChat (`wyvernchat`) | 13.5 | +0.5 | band -2.0, confidence -1.5, flags +1.0, supply +2.0 (vs pick #10) |
| 12 | CrushOn.AI (`crushon-ai`) | 13.0 | +1.0 | flags -4.0, community -2.0, band +2.0, supply +3.0 (vs pick #10) |
| 13 | FictionLab (`fictionlab`) | 13.0 | +1.0 | band -2.0, flags -1.0, supply +2.0 (vs pick #10) |
| 14 | FlowGPT (`flowgpt`) | 12.5 | +1.5 | community -5.0, confidence -1.5, flags +1.0, band +2.0, supply +2.0 (vs pick #10) |
| 15 | Joi AI (`joi-ai`) | 12.5 | +1.5 | community -4.0, confidence -1.5, flags +1.0, supply +3.0 (vs pick #10) |

### Main picks — hosted hubs, companions, hybrids — evidence sources

**1. OurDream AI** (`ourdream-ai`) — score 18.0
    - band=A supply=4 community=10 coverage=researched · red flags: white_label_clone [iso]
    - sources (3): https://ourdream.ai; https://ourdream.ai/sex-chat/are-ai-girlfriends-safe; https://www.openpr.com/news/4674787/ourdream-aireview-and-why-lerk-ai-is-actually-a-better-option

**2. Janitor AI** (`janitor-ai`) — score 17.0
    - band=A supply=4 community=33 coverage=researched · red flags: content_purge [iso]; policy_pivot [iso]
    - sources (4): https://help.janitorai.com/en/article/faq-whats-the-difference-between-limited-and-limitless-b78orr/; https://help.janitorai.com/en/article/minor-related-content-16ydlbg/; https://janitorai.com/content; https://www.reddit.com/r/JanitorAI_Official/comments/1czh2re/wait_why_is_marcus_now_gone_too_they_also_deleted/

**3. Chub AI** (`chub-ai`) — score 15.5
    - band=B supply=4 community=14 coverage=researched · red flags: billing [iso]; policy_pivot [iso]
    - sources (5): https://chub.ai/tos; https://digitalpolicyalert.org/event/34650-esafety-commissioner-issues-legal-notice-to-chub-ai-inc-chubai-regarding-compliance-with-basic-online-safety-expectations; https://docs.chub.ai/docs; https://www.esafety.gov.au/industry/basic-online-safety-expectations/ai-services/findings-october-2025; https://www.reddit.com/r/Chub_AI/comments/1qt3g9y/info_about_subscription_issues/

**4. Paradot** (`paradot`) — score 15.5 · PROVISIONAL (low confidence)
    - band=A supply=1 community=6 coverage=not_researched · red flags: none recorded
    - sources (2): https://apps.apple.com; https://apps.apple.com/il/app/paradot-ai-personal-ai-friend/id6451469304

**5. Sakura AI** (`sakura-ai`) — score 15.5 · PROVISIONAL (low confidence)
    - band=B supply=3 community=9 coverage=not_researched · red flags: none recorded
    - sources (1): https://sakura.fm

**6. Character Tavern** (`character-tavern`) — score 14.5 · PROVISIONAL (low confidence)
    - band=C supply=4 community=6 coverage=not_researched · red flags: none recorded
    - sources (2): https://character-tavern.com; https://character-tavern.com/legal/tos

**7. Hi Waifu** (`hi-waifu`) — score 14.5 · PROVISIONAL (low confidence)
    - band=B supply=2 community=10 coverage=not_researched · red flags: none recorded
    - sources (1): https://hiwaifu.com

**8. Perchance AI** (`perchance-ai`) — score 14.5 · PROVISIONAL (low confidence)
    - band=A supply=1 community=4 coverage=not_researched · red flags: none recorded
    - sources (3): https://perchance.org; https://perchance.org/about-the-creator; https://perchance.org/ai-chat

**9. Kindroid** (`kindroid`) — score 14.0
    - band=B supply=4 community=91 coverage=researched · red flags: billing [iso]; policy_pivot [iso]
    - sources (3): https://kindroid.ai; https://kindroid.ai/v2/docs/moderation-guidelines/; https://www.reddit.com/r/ChatbotRefugees/comments/1p6srd3/im_leaving_kindroid_heres_why/

**10. Moescape AI** (`moescape-ai`) — score 14.0
    - band=B supply=1 community=5 coverage=researched · red flags: policy_pivot [iso]
    - sources (3): https://moescape.ai; https://www.reddit.com/r/YodayoAI/comments/1k9gp5z/is_the_site_back/; https://www.reddit.com/r/YodayoAI/comments/1mcu3md/is_nsfw_back/

**11. WyvernChat** (`wyvernchat`) — score 13.5 · PROVISIONAL (low confidence)
    - band=C supply=3 community=6 coverage=not_researched · red flags: none recorded
    - sources (1): https://wyvern.chat

**12. CrushOn.AI** (`crushon-ai`) — score 13.0
    - band=A supply=4 community=3 coverage=researched · red flags: moderation_failure_csam_deepfake [iso]; deceptive_marketing [iso]
    - sources (8): https://aiwiki.crushon.ai/wiki/FAQ; https://crushon.ai; https://crushon.ai/community-guidelines; https://crushon.ai/privacy-policy; https://digishieldkids.com/downloads/DigiShield_No_Guardrails_v1_2_final.pdf; https://foundation.mozilla.org/nl/privacynotincluded/articles/happy-valentines-day-romantic-ai-chatbots-dont-haveyour-privacy-at-heart/; https://incidentdatabase.ai/reports/3652/; https://www.reddit.com/r/Crushon/comments/1qdhxwq/regarding_the_privacy_policy/

**13. FictionLab** (`fictionlab`) — score 13.0
    - band=C supply=3 community=26 coverage=researched · red flags: filter_tightening [iso]
    - sources (2): https://fictionlab.ai; https://www.reddit.com/r/FictionLab/comments/1if9iyz/my_opinion_after_2_days_of_nonstop_use_sub/

**14. FlowGPT** (`flowgpt`) — score 12.5 · PROVISIONAL (low confidence)
    - band=A supply=3 community=- coverage=not_researched · red flags: none recorded
    - sources (1): https://flowgpt.com

**15. Joi AI** (`joi-ai`) — score 12.5 · PROVISIONAL (low confidence)
    - band=B supply=4 community=1 coverage=not_researched · red flags: none recorded
    - sources (1): https://joi.com

## Secondary picks — BYOK/local frontends and story engines (top 5 of 19 eligible)

| # | platform | score | band pts | supply pts | community pts | confidence pts | flags − | top red flags | confidence | provisional |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | Saucepan AI (`saucepan-ai`) | 14.5 | 6.0 | 2.0 | 5.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 2 | SillyTavern (`sillytavern`) | 14.5 | 4.0 | 4.0 | 5.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 3 | Agnai (`agnai`) | 13.5 | 4.0 | 3.0 | 5.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 4 | HammerAI (`hammerai`) | 12.5 | 4.0 | 4.0 | 3.0 | 1.5 | 0.0 |  | low | PROVISIONAL |
| 5 | RisuAI (`risuai`) | 12.5 | 4.0 | 3.0 | 4.0 | 1.5 | 0.0 |  | low | PROVISIONAL |

### Near misses — Secondary picks — BYOK/local frontends and story engines (ranks 6-8)

| # | platform | score | gap to cut | kept out by (factor deltas vs the last pick) |
|---:|---|---:|---:|---|
| 6 | LM Studio (`lm-studio`) | 11.5 | +1.0 | community -3.0, band +2.0 (vs pick #5) |
| 7 | Tavo (`tavo`) | 11.5 | +1.0 | supply -2.0, community +1.0 (vs pick #5) |
| 8 | Backyard AI (Faraday / Faraday.dev / BYAI) (`backyard-ai-faraday-faraday-dev-byai`) | 10.0 | +2.5 | band -2.0, flags -2.0, supply -1.0, community +1.0, confidence +1.5 (vs pick #5) |

### Secondary picks — BYOK/local frontends and story engines — evidence sources

**1. Saucepan AI** (`saucepan-ai`) — score 14.5 · PROVISIONAL (low confidence)
    - band=B supply=2 community=14 coverage=not_researched · red flags: none recorded
    - sources (1): https://saucepan.ai

**2. SillyTavern** (`sillytavern`) — score 14.5 · PROVISIONAL (low confidence)
    - band=C supply=4 community=36 coverage=not_researched · red flags: none recorded
    - sources (2): https://docs.sillytavern.app; https://sillytavern.app

**3. Agnai** (`agnai`) — score 13.5 · PROVISIONAL (low confidence)
    - band=C supply=3 community=6 coverage=not_researched · red flags: none recorded
    - sources (5): https://agnai.chat; https://agnai.chat/faq; https://agnai.chat/terms-of-service; https://agnai.guide/docs/quick-start/; https://github.com/agnaistic/agnai

**4. HammerAI** (`hammerai`) — score 12.5 · PROVISIONAL (low confidence)
    - band=C supply=4 community=3 coverage=not_researched · red flags: none recorded
    - sources (2): https://hammerai.com; https://www.hammerai.com/uses/ai-nsfw-chat

**5. RisuAI** (`risuai`) — score 12.5 · PROVISIONAL (low confidence)
    - band=C supply=3 community=4 coverage=not_researched · red flags: none recorded
    - sources (2): https://github.com/kwaroran/RisuAI; https://risuai.xyz

**6. LM Studio** (`lm-studio`) — score 11.5 · PROVISIONAL (low confidence)
    - band=B supply=3 community=1 coverage=not_researched · red flags: none recorded
    - sources (2): https://lmstudio.ai; https://lmstudio.ai/docs/app/offline

**7. Tavo** (`tavo`) — score 11.5 · PROVISIONAL (low confidence)
    - band=C supply=1 community=10 coverage=not_researched · red flags: none recorded
    - sources (1): https://tavoai.dev

**8. Backyard AI (Faraday / Faraday.dev / BYAI)** (`backyard-ai-faraday-faraday-dev-byai`) — score 10.0
    - band=D supply=2 community=12 coverage=researched · red flags: shutdown_risk [iso]
    - sources (2): https://backyard.ai; https://backyard.ai/terms

## Excluded (never silently dropped)
| platform | category | reason |
|---|---|---|
| Aroused AI (`aroused-ai`) | hosted_character_hubs | NSFW answer is 'conflict' — first-party sources disagree and are never silently collapsed; excluded from ranking and listed separately until re-verified first-party |
| Candy AI (`candy-ai`) | hosted_character_hubs | scope_decision=borderline — pending a resolved scope call, so not ranked |
| PixelChat (`pixelchat`) | hosted_character_hubs | NSFW answer is 'conflict' — first-party sources disagree and are never silently collapsed; excluded from ranking and listed separately until re-verified first-party |
