# Writer brief — AI girlfriend/companion apps: what the evidence supports

Store: `ai-chat-platforms` (platforms.json built 2026-11-04; 246 platforms). This brief adds no opinions: facts with provenance, sorted by usage band for readability only. It has no eligibility gates, no scores, and no picks. The writer forms the opinion; QC checks the result and kicks open questions into the store's `research-queue.json` (append-only). `rank.py` exists in the store dir as an optional weighted reference signal — consult it, never obey it.

Per block: usage band · supply runs (independent census runs, 0-4) · community users (distinct users observed in census evidence, tier A+B floor) · NSFW/chat evidence with decided_by + verbatim flag · red flags (recurring = 2+ recounted independent users; isolated = a single report; empty != clean) · confidence · known gaps. Full sources + access dates live in platforms.csv / platforms.json; each block below shows the first few URLs.

## Band A — strongest observed usage signals (19 platforms)

### Candy AI (`candy-ai`) — scope: borderline, scope pending — confidence: medium

- usage: band A · supply 4 census runs · community users 18
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+venice | chat (no image credits): conflict · decided by conflict
- red flags: 2 recurring (billing, deceptive_marketing) · 1 isolated (white_label_clone) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat: first-party sources disagree (conflict), scope pending: borderline case unresolved by research
- sources (10): https://candy-ai.pissedconsumer.com/review.html; https://candy.ai; https://candy.ai/privacypolicy (+7 more in platforms.csv)

### Chai (`chai`) — scope: in — confidence: medium

- usage: band A · supply 4 census runs · community users 18
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+venice | chat (no image credits): yes · decided by gemini+venice
- red flags: 1 recurring (billing) · 1 isolated (moderation_failure_csam_deepfake) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (7): https://chai-research.com; https://incidentdatabase.ai/reports/3652/; https://www.chai-ai.com/faq (+4 more in platforms.csv)

### Character.AI (`character-ai`) — scope: out — confidence: low

- usage: band A · supply 4 census runs · community users 96
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### CrushOn.AI (`crushon-ai`) — scope: in — confidence: medium

- usage: band A · supply 4 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (deceptive_marketing, moderation_failure_csam_deepfake) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (8): https://aiwiki.crushon.ai/wiki/FAQ; https://crushon.ai; https://crushon.ai/community-guidelines (+5 more in platforms.csv)

### Emochi (`emochi`) — scope: in — confidence: low

- usage: band A · supply 2 census runs · community users 8
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (2): https://emochi.com; https://play.google.com

### FlowGPT (`flowgpt`) — scope: in — confidence: low

- usage: band A · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://flowgpt.com

### Grok (`grok`) — scope: out — confidence: low

- usage: band A · supply 0 census runs · community users 10
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### IA Namorada Virtual CoupleAI (`ia-namorada-virtual-coupleai`) — scope: in — confidence: low

- usage: band A · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: 2 isolated (billing, filter_tightening) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.smartfy.coupleai

### Janitor AI (`janitor-ai`) — scope: in — confidence: medium

- usage: band A · supply 4 census runs · community users 33
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (content_purge, policy_pivot) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (4): https://help.janitorai.com/en/article/faq-whats-the-difference-between-limited-and-limitless-b78orr/; https://help.janitorai.com/en/article/minor-related-content-16ydlbg/; https://janitorai.com/content (+1 more in platforms.csv)

### Linky AI (`linky-ai`) — scope: in — confidence: medium

- usage: band A · supply 1 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (3): https://play.google.com/store/apps/details?id=com.speedhub; https://support.linke.ai/privacy-policy; https://www.linke.ai

### OpenRouter (`openrouter`) — scope: out — confidence: low

- usage: band A · supply 4 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### OurDream AI (`ourdream-ai`) — scope: in — confidence: medium

- usage: band A · supply 4 census runs · community users 10
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx+pplx_scope | chat (no image credits): yes · decided by gemini+pplx+pplx_scope
- red flags: 1 isolated (white_label_clone) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (3): https://ourdream.ai; https://ourdream.ai/sex-chat/are-ai-girlfriends-safe; https://www.openpr.com/news/4674787/ourdream-aireview-and-why-lerk-ai-is-actually-a-better-option

### Paradot (`paradot`) — scope: in — confidence: low

- usage: band A · supply 1 census runs · community users 6
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://apps.apple.com; https://apps.apple.com/il/app/paradot-ai-personal-ai-friend/id6451469304

### Perchance AI (`perchance-ai`) — scope: in — confidence: low

- usage: band A · supply 1 census runs · community users 4
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (3): https://perchance.org; https://perchance.org/about-the-creator; https://perchance.org/ai-chat

### Poe (`poe`) — scope: in — confidence: low

- usage: band A · supply 3 census runs · community users -
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (2): https://help.poe.com/hc/en-us/articles/19944206309524-Poe-FAQs; https://poe.com/tos

### PolyBuzz (formerly Poly.AI) (`polybuzz-formerly-poly-ai`) — scope: in — confidence: medium

- usage: band A · supply 3 census runs · community users 10
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (deceptive_marketing, filter_tightening) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, 1 flag claim(s) downgraded in the conservative recount
- sources (5): https://app.polybuzz.ai/static/hy/speakmaster/privacyPolicy/index.html?darkmode=1&darkStyle=1; https://polybuzz.ai; https://verifywise.ai/ai-trust-index/polybuzz (+2 more in platforms.csv)

### Replika (`replika`) — scope: out — confidence: low

- usage: band A · supply 4 census runs · community users 56
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### SpicyChat AI (`spicychat-ai`) — scope: in — confidence: medium

- usage: band A · supply 4 census runs · community users 17
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 3 isolated (billing, filter_tightening, moderation_failure_csam_deepfake) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (6): https://aifreands.com/apps/spicychat-ai/; https://digishieldkids.com/downloads/DigiShield_No_Guardrails_v1_2_final.pdf; https://docs.spicychat.ai/september-2026-pricing-update-faq (+3 more in platforms.csv)

### Talkie AI (`talkie-ai`) — scope: in — confidence: medium

- usage: band A · supply 4 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (deceptive_marketing, policy_pivot) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (7): https://elizareport.com/apps/talkie/; https://fetishaura.com/reviews/talkie-ai; https://gamma.app/docs/Talkie-AI-Review-mf3xgoavj7tbjdi (+4 more in platforms.csv)


## Band B — strong usage signals (31 platforms)

### AI Dungeon (`ai-dungeon`) — scope: in — confidence: high

- usage: band B · supply 3 census runs · community users 4
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): yes · decided by gemini+venice
- red flags: 1 recurring (filter_tightening) · 2 isolated (billing, data_breach) · coverage: researched
- known gaps: none noted
- sources (11): https://aidungeon.com; https://github.com/AetherDevSecOps/aid_adventure_vulnerability_report; https://help.aidungeon.com/community-guidelines (+8 more in platforms.csv)

### AI Girlfriend - TruMate (`ai-girlfriend-trumate`) — scope: in — confidence: high

- usage: band B · supply 0 census runs · community users 3
- evidence: nsfw: yes — verbatim evidence · decided by venice+venice_deep | chat (no image credits): no · decided by venice
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://play.google.com; https://play.google.com/store/apps/details?id=com.aichatbot.aimate; https://play.google.com/store/apps/details?id=com.aichatbot.aimate&hl=en
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Anima AI (`anima-ai`) — scope: in — confidence: high

- usage: band B · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx_deep | chat (no image credits): yes · decided by gemini+venice
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: none noted
- sources (5): https://myanima.ai; https://myanima.ai/blog/best-ai-sexting-apps; https://myanima.ai/legal/cancellation-policy (+2 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Anima: My Virtual AI Boyfriend (`anima-my-virtual-ai-boyfriend`) — scope: in — confidence: high

- usage: band B · supply 0 census runs · community users 3
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx_deep | chat (no image credits): yes · decided by gemini+venice_deep
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: none noted
- sources (8): https://boyfriend.myanima.ai; https://boyfriend.myanima.ai/legal/subscription-terms; https://boyfriend.myanima.ai/legal/terms (+5 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Botify (`botify`) — scope: in — confidence: medium

- usage: band B · supply 0 census runs · community users 5
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): conflict · decided by conflict
- red flags: 1 recurring (billing) · 2 isolated (content_purge, filter_tightening) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat: first-party sources disagree (conflict), 1 flag claim(s) downgraded in the conservative recount
- sources (5): https://botify.ai; https://botify.ai/terms-of-service; https://www.pissedconsumer.com/ (+2 more in platforms.csv)

### CamSoda AI (`camsoda-ai`) — scope: in — confidence: low

- usage: band B · supply 4 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+venice | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://camsoda.com; https://www.camsoda.com/support/terms

### Caveduck (`caveduck`) — scope: out — confidence: low

- usage: band B · supply 3 census runs · community users 8
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### Chub AI (`chub-ai`) — scope: in — confidence: high

- usage: band B · supply 4 census runs · community users 14
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): yes · decided by gemini+pplx+venice
- red flags: 2 isolated (billing, policy_pivot) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: 1 flag claim(s) downgraded in the conservative recount
- sources (5): https://chub.ai/tos; https://digitalpolicyalert.org/event/34650-esafety-commissioner-issues-legal-notice-to-chub-ai-inc-chubai-regarding-compliance-with-basic-online-safety-expectations; https://docs.chub.ai/docs (+2 more in platforms.csv)

### Dippy (`dippy`) — scope: in — confidence: low

- usage: band B · supply 1 census runs · community users 15
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (1): https://dippy.ai

### EVA AI (`eva-ai`) — scope: in — confidence: high

- usage: band B · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini | chat (no image credits): no · decided by gemini
- red flags: 1 recurring (deceptive_marketing) · coverage: researched
- known gaps: none noted
- sources (4): https://evaapp.ai; https://www.reddit.com/r/EVAAI/comments/1cri3yz/plenty_of_complaints/; https://www.reddit.com/r/EVAAI/comments/1i1lb3t/eva_ai_features_constant_neuron_harvesting/ (+1 more in platforms.csv)

### Fantasia (`fantasia`) — scope: in — confidence: low

- usage: band B · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.fantasia.ai

### Flipped (`flipped`) — scope: in — confidence: low

- usage: band B · supply 2 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (1): https://flipped.chat

### GirlfriendGPT (`girlfriendgpt`) — scope: in — confidence: low

- usage: band B · supply 4 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx+pplx_scope | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://gptgirlfriend.online

### Hi Waifu (`hi-waifu`) — scope: in — confidence: low

- usage: band B · supply 2 census runs · community users 10
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://hiwaifu.com

### Joi AI (`joi-ai`) — scope: in — confidence: low

- usage: band B · supply 4 census runs · community users 1
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://joi.com

### Joyland AI (`joyland-ai`) — scope: in — confidence: low

- usage: band B · supply 4 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://joyland.ai

### JuicyChat.AI (`juicychat-ai`) — scope: in — confidence: low

- usage: band B · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://juicychat.ai

### Kindroid (`kindroid`) — scope: in — confidence: medium

- usage: band B · supply 4 census runs · community users 91
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (billing, policy_pivot) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (3): https://kindroid.ai; https://kindroid.ai/v2/docs/moderation-guidelines/; https://www.reddit.com/r/ChatbotRefugees/comments/1p6srd3/im_leaving_kindroid_heres_why/

### LM Studio (`lm-studio`) — scope: in — confidence: low

- usage: band B · supply 3 census runs · community users 1
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://lmstudio.ai; https://lmstudio.ai/docs/app/offline

### MiraiMind (`miraimind`) — scope: in — confidence: low

- usage: band B · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by pplx
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.immomo.miraimind

### Moescape AI (`moescape-ai`) — scope: in — confidence: medium

- usage: band B · supply 1 census runs · community users 5
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 1 isolated (policy_pivot) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://moescape.ai; https://www.reddit.com/r/YodayoAI/comments/1k9gp5z/is_the_site_back/; https://www.reddit.com/r/YodayoAI/comments/1mcu3md/is_nsfw_back/

### Nastia AI (`nastia-ai`) — scope: in — confidence: medium

- usage: band B · supply 3 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 2 isolated (billing, deceptive_marketing) · recounts downgraded 2 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 2 flag claim(s) downgraded in the conservative recount
- sources (2): https://nastia.ai; https://www.trustpilot.com/review/nastia.ai

### NovelAI (`novelai`) — scope: in — confidence: medium

- usage: band B · supply 4 census runs · community users 1
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: 2 isolated (billing, data_breach) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (5): https://docs.novelai.net/en/faq/; https://docs.novelai.net/en/subscription/; https://en.wikipedia.org/wiki/NovelAI (+2 more in platforms.csv)

### Ollama (`ollama`) — scope: out — confidence: low

- usage: band B · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### Sakura AI (`sakura-ai`) — scope: in — confidence: low

- usage: band B · supply 3 census runs · community users 9
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://sakura.fm

### Saucepan AI (`saucepan-ai`) — scope: in — confidence: low

- usage: band B · supply 2 census runs · community users 14
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://saucepan.ai

### Saylo (`saylo`) — scope: in — confidence: low

- usage: band B · supply 1 census runs · community users 7
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (1): https://saylo.ai

### Secrets AI (`secrets-ai`) — scope: in — confidence: medium

- usage: band B · supply 3 census runs · community users 1
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx+pplx_scope | chat (no image credits): yes · decided by gemini+pplx+pplx_scope
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (2): https://secrets.ai; https://www.trustpilot.com/review/secrets.ai

### Sexy Chatbot X - No Filter AI (`sexy-chatbot-x-no-filter-ai`) — scope: in — confidence: low

- usage: band B · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by pplx
- red flags: 1 isolated (deceptive_marketing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=free.ai.chat.gpt.bot.plus.assistant

### Weifu AI: My Girlfriend Chat (`weifu-ai-my-girlfriend-chat`) — scope: in — confidence: low

- usage: band B · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.soulmate.ai.chat.virtual.friend.companion&hl=en

### Zeta AI (`zeta-ai`) — scope: out — confidence: low

- usage: band B · supply 0 census runs · community users 11
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded


## Band C — moderate usage signals (41 platforms)

### Agnai (`agnai`) — scope: in — confidence: low

- usage: band C · supply 3 census runs · community users 6
- evidence: nsfw: yes — verbatim evidence · decided by gemini+venice+venice_deep | chat (no image credits): yes · decided by gemini+pplx+pplx_deep+venice+venice_deep
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (5): https://agnai.chat; https://agnai.chat/faq; https://agnai.chat/terms-of-service (+2 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### AI Boyfriend — 6Hive OU (`ai-boyfriend-6hive-ou`) — scope: in — confidence: medium

- usage: band C · supply 0 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by venice | chat (no image credits): yes · decided by venice
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (3): https://play.google.com; https://play.google.com/store/apps/details?id=ai.boyfriend; https://play.google.com/store/apps/details?id=ai.boyfriend&hl=en

### AI Boyfriend Chat - Husby (`ai-boyfriend-chat-husby`) — scope: in — confidence: low

- usage: band C · supply 0 census runs · community users 9
- evidence: nsfw: no — non-verbatim evidence · decided by venice_deep | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (4): https://apps.apple.com; https://apps.apple.com/tw/app/ai-boyfriend-chat-husby/id6448729671?l=en-GB; https://apps.apple.com/us/app/ai-boyfriend-chat-husby/id6448729671 (+1 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### AI Boyfriend:Love Chat Partner (`ai-boyfriend-love-chat-partner`) — scope: in — confidence: medium

- usage: band C · supply 0 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by venice+venice_deep | chat (no image credits): yes · decided by venice+venice_deep
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (4): https://apps.apple.com/us/app/ai-boyfriend-love-chat-partner/id6605936526; https://play.google.com; https://play.google.com/store/apps/details?id=com.fjsh.alwayssupportiveboyfriend (+1 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### AIBoy - Virtual AI Boyfriend (`aiboy-virtual-ai-boyfriend`) — scope: in — confidence: high

- usage: band C · supply 0 census runs · community users 3
- evidence: nsfw: no — verbatim evidence · decided by pplx_deep | chat (no image credits): unresolved
- red flags: 2 isolated (billing, deceptive_marketing) · coverage: researched
- known gaps: chat without image credits: unresolved
- sources (7): https://aiboy.app/; https://aiboy.app/refund; https://play.google.com (+4 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Aimy (アイミー) (`aimy-アイミー`) — scope: in — confidence: low

- usage: band C · supply 0 census runs · community users 3
- evidence: nsfw: no — verbatim evidence · decided by pplx_deep+venice+venice_deep | chat (no image credits): yes · decided by pplx+pplx_deep
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (5): https://aimmy.jp/; https://aimmy.jp/terms_of_use; https://aimmy.jp/terms_of_use_en (+2 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Character Tavern (`character-tavern`) — scope: in — confidence: low

- usage: band C · supply 4 census runs · community users 6
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+venice | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://character-tavern.com; https://character-tavern.com/legal/tos

### ChatFAI (`chatfai`) — scope: in — confidence: low

- usage: band C · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): yes · decided by gemini+pplx+venice
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (4): https://chatfai.com; https://chatfai.com/blog/what-is-nsfw/; https://chatfai.com/pricing (+1 more in platforms.csv)

### ChatUp AI (`chatup-ai`) — scope: in — confidence: high

- usage: band C · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by pplx+venice | chat (no image credits): conflict · decided by conflict
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: chat: first-party sources disagree (conflict), 1 flag claim(s) downgraded in the conservative recount
- sources (4): https://aichattings.com; https://aichattings.com/price/; https://aichattings.com/terms-of-service/ (+1 more in platforms.csv)

### Clank World (`clank-world`) — scope: in — confidence: medium

- usage: band C · supply 0 census runs · community users 7
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by venice | chat (no image credits): yes · decided by pplx+venice
- red flags: 1 recurring (billing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (6): https://apps.apple.com; https://apps.apple.com/us/app/clank-world/id6759280064; https://www.clank.world/ (+3 more in platforms.csv)

### Cotomo (`cotomo`) — scope: in — confidence: low

- usage: band C · supply 1 census runs · community users 9
- evidence: nsfw: no — non-verbatim evidence · decided by gemini+venice | chat (no image credits): yes · decided by gemini+venice
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (3): https://cotomo.ai; https://cotomo.ai/privacy-policy; https://play.google.com/store/apps/details?id=jp.co.starley.cotomounity

### CraveU AI (`craveu-ai`) — scope: in — confidence: high

- usage: band C · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): yes · decided by venice
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: none noted
- sources (4): https://craveu.ai; https://craveu.ai/agreement/faq; https://craveu.ai/agreement/refund-policy (+1 more in platforms.csv)

### DarLink AI (`darlink-ai`) — scope: in — confidence: medium

- usage: band C · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx_scope
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://darlink.ai; https://darlink.ai/terms-and-conditions; https://www.trustpilot.com/review/darlink.ai

### Dopple.AI (`dopple-ai`) — scope: in — confidence: medium

- usage: band C · supply 3 census runs · community users -
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 1 recurring (shutdown_risk) · 1 isolated (moderation_failure_csam_deepfake) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (3): https://dopple.ai; https://www.reddit.com/r/DoppleAI/comments/1meg5ii/to_everyone_coming_here_to_report_that_its_broken/; https://www.reddit.com/r/DoppleAI/comments/1p5byo7/servers_down/

### DreamGF (`dreamgf`) — scope: in — confidence: medium

- usage: band C · supply 3 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 1 recurring (billing) · 1 isolated (white_label_clone) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (8): https://dreamgf.ai; https://dreamgf.ai/blog/are-ai-girlfriend-apps-safe-2026-privacy-checklist; https://dreamgf.ai/terms (+5 more in platforms.csv)

### Eternal AI (`eternal-ai`) — scope: in — confidence: low

- usage: band C · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://eternalai.org

### FictionLab (`fictionlab`) — scope: in — confidence: medium

- usage: band C · supply 3 census runs · community users 26
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 1 isolated (filter_tightening) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://fictionlab.ai; https://www.reddit.com/r/FictionLab/comments/1if9iyz/my_opinion_after_2_days_of_nonstop_use_sub/

### FunFun AI (`funfun-ai`) — scope: in — confidence: low

- usage: band C · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://funfun.ai; https://www.funfun.ai

### HammerAI (`hammerai`) — scope: in — confidence: low

- usage: band C · supply 4 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://hammerai.com; https://www.hammerai.com/uses/ai-nsfw-chat

### JannyAI (`jannyai`) — scope: in — confidence: low

- usage: band C · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://jannyai.com

### Kupid AI (`kupid-ai`) — scope: in — confidence: medium

- usage: band C · supply 4 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: 3 isolated (billing, filter_tightening, white_label_clone) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (5): https://75way.com/ai-girlfriend-app-development; https://companionwise.com/reviews/kupid-ai/; https://gamma.app/docs/Kupid-AI-Review-2026-Pricing-Safety-Who-It-Suits-7uu6sg38eh7j4au (+2 more in platforms.csv)

### Luna: Meine KI-Freundin (`luna-meine-ki-freundin`) — scope: in — confidence: low

- usage: band C · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by pplx
- red flags: 1 isolated (shutdown_risk) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.antonio.my.ai.girlfriend.free

### Muah AI (`muah-ai`) — scope: in — confidence: high

- usage: band C · supply 4 census runs · community users 1
- evidence: nsfw: yes — verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini+pplx_scope
- red flags: 3 isolated (billing, data_breach, moderation_failure_csam_deepfake) · coverage: researched
- known gaps: none noted
- sources (7): https://muah.ai; https://muah.ai/compare/muah-ai-vs-character-ai/; https://muah.ai/guide/ (+4 more in platforms.csv)

### Nectar AI (TryNectar) (`nectar-ai-trynectar`) — scope: in — confidence: low

- usage: band C · supply 4 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx_scope | chat (no image credits): yes · decided by gemini+pplx_scope
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://trynectar.ai

### Nomi AI (`nomi-ai`) — scope: in — confidence: high

- usage: band C · supply 4 census runs · community users 75
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 3 isolated (billing, filter_tightening, moderation_failure_csam_deepfake) · recounts downgraded 2 claim(s) · coverage: researched
- known gaps: 2 flag claim(s) downgraded in the conservative recount
- sources (7): https://medium.com/@nomiai_exposed/the-anti-censorship-myth-how-nomi-ais-founder-designed-a-system-for-harm-2e1e03a8221d; https://nomi.ai/ai-boyfriend/; https://nomi.ai/ai-girlfriend/ (+4 more in platforms.csv)

### NSFWLover (`nsfwlover`) — scope: in — confidence: medium

- usage: band C · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by pplx
- red flags: 1 isolated (moderation_failure_csam_deepfake) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (1): https://nsfwlover.com

### RisuAI (`risuai`) — scope: in — confidence: low

- usage: band C · supply 3 census runs · community users 4
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://github.com/kwaroran/RisuAI; https://risuai.xyz

### RolePlai / PLAI (`roleplai-plai`) — scope: in — confidence: low

- usage: band C · supply 1 census runs · community users 10
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://roleplai.app

### Romantic AI (`romantic-ai`) — scope: in — confidence: low

- usage: band C · supply 4 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://romanticai.com

### Secret Desires AI (`secret-desires-ai`) — scope: in — confidence: low

- usage: band C · supply 4 census runs · community users 1
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx_scope
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://secretdesires.ai

### Shapes Inc (`shapes-inc`) — scope: in — confidence: low

- usage: band C · supply 1 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://shapes.inc

### SillyTavern (`sillytavern`) — scope: in — confidence: low

- usage: band C · supply 4 census runs · community users 36
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://docs.sillytavern.app; https://sillytavern.app

### SoulGen (`soulgen`) — scope: in — confidence: low

- usage: band C · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): no · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://soulgen.net

### Soulkyn AI (`soulkyn-ai`) — scope: in — confidence: medium

- usage: band C · supply 2 census runs · community users 2
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx+pplx_scope
- red flags: 1 isolated (white_label_clone) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (4): https://landing.soulkyn.com/l/en-US/unlimited-ai-chat; https://soulkyn.com; https://soulkyn.com/l/en-US/legal/blocked-content-policy (+1 more in platforms.csv)

### SynClub (`synclub`) — scope: in — confidence: low

- usage: band C · supply 2 census runs · community users 1
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (1): https://play.google.com

### Tavo (`tavo`) — scope: in — confidence: low

- usage: band C · supply 1 census runs · community users 10
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://tavoai.dev

### Virtual Boyfriend: AI Romance / BoyBot (`virtual-boyfriend-ai-romance-boybot`) — scope: in — confidence: low

- usage: band C · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.testa.boybot

### WyvernChat (`wyvernchat`) — scope: in — confidence: low

- usage: band C · supply 3 census runs · community users 6
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://wyvern.chat

### Xoul AI (`xoul-ai`) — scope: in — confidence: medium

- usage: band C · supply 2 census runs · community users 7
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 1 isolated (shutdown_risk) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (3): https://www.reddit.com/r/XoulAI/comments/1k3exxe/announcement_shut_down/; https://www.reddit.com/r/XoulAI/comments/1sooxnk/what_is_going_on/; https://xoul.ai

### Y/N (`y-n`) — scope: in — confidence: low

- usage: band C · supply 0 census runs · community users 11
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (2): https://apps.apple.com; https://apps.apple.com/us/app/y-n/id6744907251

### Y/N AI (`y-n-ai`) — scope: in — confidence: low

- usage: band C · supply 1 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (1): https://yn.ai


## Band D — weak / low usage signals (41 platforms)

### AI Boyfriend — Caitty (`ai-boyfriend-caitty`) — scope: in — confidence: medium

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by venice+venice_deep | chat (no image credits): yes · decided by venice+venice_deep
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (5): https://caitty.com/ai-boyfriend-app/; https://caitty.com/ai-boyfriend-app/privacy; https://play.google.com (+2 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### AI Friend 3D - Talking Buddy (`ai-friend-3d-talking-buddy`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by venice+venice_deep | chat (no image credits): yes · decided by pplx_deep+venice
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (3): https://play.google.com/store/apps/details?id=com.yapailabs.talkingbuddyai; https://play.google.com/store/apps/details?id=com.yapailabs.talkingbuddyai&hl=en; https://yapailabs.com/privacy-policy/
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### AI Girlfriend WTF (`ai-girlfriend-wtf`) — scope: in — confidence: high

- usage: band D · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): no · decided by venice
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: none noted
- sources (4): https://aigirlfriend.wtf; https://www.aigirlfriend.wtf/; https://www.aigirlfriend.wtf/plans (+1 more in platforms.csv)

### AI Life — AI Companion & Chat (`ai-life-ai-companion-chat`) — scope: in — confidence: medium

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by venice | chat (no image credits): no · decided by venice
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (2): https://play.google.com/store/apps/details?id=com.ailife.app; https://play.google.com/store/apps/details?id=com.ailife.app&hl=en

### AI Voice Assistant - Fala AI (`ai-voice-assistant-fala-ai`) — scope: in — confidence: medium

- usage: band D · supply 0 census runs · community users 9
- evidence: nsfw: no — non-verbatim evidence · decided by venice_deep | chat (no image credits): unresolved
- red flags: 2 isolated (billing, deceptive_marketing) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, chat without image credits: unresolved
- sources (2): https://apps.apple.com/us/app/ai-voice-assistant-fala-ai/id6741577068; https://falaai.framer.website/terms-of-service
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### aiAllure (`aiallure`) — scope: in — confidence: high

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+pplx_deep+venice+venice_deep | chat (no image credits): yes · decided by pplx+pplx_deep+venice+venice_deep
- red flags: 2 isolated (billing, content_purge) · coverage: researched
- known gaps: none noted
- sources (4): https://aiallure.com; https://www.aiallure.com/faq; https://www.aiallure.com/legal/terms (+1 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Airfriend (`airfriend`) — scope: in — confidence: high

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: no — verbatim evidence · decided by gemini+pplx_deep+venice_deep | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (billing, policy_pivot) · coverage: researched
- known gaps: none noted
- sources (4): https://airfriend.ai/ja/subscriptions/; https://airfriend.ai/ja/tos/; https://play.google.com (+1 more in platforms.csv)
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Alphazria (`alphazria`) — scope: in — confidence: low

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by venice+venice_deep | chat (no image credits): yes · decided by venice+venice_deep
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (2): https://alphazria.com; https://alphazria.com/faq
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### Backyard AI (Faraday / Faraday.dev / BYAI) (`backyard-ai-faraday-faraday-dev-byai`) — scope: in — confidence: medium

- usage: band D · supply 2 census runs · community users 12
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): conflict · decided by conflict
- red flags: 1 isolated (shutdown_risk) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat: first-party sources disagree (conflict)
- sources (2): https://backyard.ai; https://backyard.ai/terms

### Besties - Call your AI Friend (`besties-call-your-ai-friend`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 5
- evidence: nsfw: no — non-verbatim evidence · decided by venice | chat (no image credits): no · decided by venice
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (1): https://apps.apple.com/us/app/besties-call-your-ai-friend/id6757412855

### Boyfi - AI Partner & Boyfriend (`boyfi-ai-partner-boyfriend`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 9
- evidence: nsfw: unresolved | chat (no image credits): no · decided by venice
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://apps.apple.com; https://apps.apple.com/us/app/boyfi-ai-partner-boyfriend/id6737233936

### CharacterHub (`characterhub`) — scope: in — confidence: low

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (3): https://characterhub.com/privacy; https://characterhub.com/terms; https://docs.chub.ai/docs

### Chat IA de Personajes Anime (`chat-ia-de-personajes-anime`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: 2 isolated (billing, deceptive_marketing) · recounts downgraded 2 claim(s) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, 2 flag claim(s) downgraded in the conservative recount
- sources (3): https://play.google.com; https://play.google.com/store/apps/details?id=fantasy.roleplay.chat; https://play.google.com/store/apps/details?id=fantasy.roleplay.chat&hl=en

### CotoGoto (`cotogoto`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 4
- evidence: nsfw: no — non-verbatim evidence · decided by venice | chat (no image credits): yes · decided by venice
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (2): https://docs.cotogoto.ai/talk; https://play.google.com/store/apps/details?id=jp.livlog.cotogoto2

### Crushie (`crushie`) — scope: in — confidence: medium

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (billing, deceptive_marketing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://play.google.com; https://play.google.com/store/apps/details?id=ai.onspace.app; https://www.crushie.ai/terms-of-use

### FantasyGF (`fantasygf`) — scope: in — confidence: medium

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx+pplx_scope | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (billing, white_label_clone) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://ehentai.ai/affiliate-policy; https://fantasygf.ai; https://www.trustpilot.com/review/fantasygf.ai

### Harpy Chat (`harpy-chat`) — scope: in — confidence: low

- usage: band D · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://harpy.chat

### HeraHaven (`herahaven`) — scope: in — confidence: low

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://herahaven.com

### Him - AI Boyfriend Chat (`him-ai-boyfriend-chat`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 10
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://apps.apple.com; https://apps.apple.com/us/app/him-ai-boyfriend-chat/id6753196686

### HiromiVoice - ASMRtist とAI通話 (`hiromivoice-asmrtist-とai通話`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 5
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### Kink AI (`kink-ai`) — scope: in — confidence: medium

- usage: band D · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 3 isolated (content_purge, filter_tightening, policy_pivot) · recounts downgraded 3 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 3 flag claim(s) downgraded in the conservative recount
- sources (2): https://kink.ai; https://www.trustpilot.com/review/chat.kink.ai

### LiveC - Living AI Companion (`livec-living-ai-companion`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 5
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://apps.apple.com/ua/app/livec-living-ai-companion/id6741559219?l=ru

### LOVERSE (`loverse`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 10
- evidence: nsfw: no — non-verbatim evidence · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (1): https://loverse.jp/

### LunaTalk / Lunatalk / 루나톡 (`lunatalk-lunatalk-루나톡`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://lunatalk.ai

### MiniTavern (`minitavern`) — scope: in — confidence: low

- usage: band D · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://mini-tavern.com

### MooX (`moox`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 5
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://play.google.com/store/apps/details?id=com.pixelmuse.aimoox&hl=en_US

### NoFilterGPT (`nofiltergpt`) — scope: in — confidence: medium

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (2): https://nofiltergpt.com; https://www.trustpilot.com/review/nofiltergpt.com

### NSFW Character AI (`nsfw-character-ai`) — scope: in — confidence: medium

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved
- sources (1): https://nsfwcharacter.ai

### OnlyChar.AI (`onlychar-ai`) — scope: in — confidence: low

- usage: band D · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://onlychar.ai

### PepHop AI (`pephop-ai`) — scope: in — confidence: low

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://pephop.ai

### Privee AI (`privee-ai`) — scope: in — confidence: medium

- usage: band D · supply 1 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: 1 isolated (filter_tightening) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (2): https://priveeai.com; https://www.reddit.com/r/PriveeAIApp/comments/1gdkupm/pg13_only/

### RushChat (`rushchat`) — scope: in — confidence: low

- usage: band D · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://rushchat.ai

### Sesame (`sesame`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 11
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (2): https://reddit.com; https://www.sesame.com

### SoulFun (`soulfun`) — scope: in — confidence: medium

- usage: band D · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: 2 isolated (billing, policy_pivot) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://soulfun.ai; https://www.trustpilot.com/review/soulfun.ai

### Soulplay (`soulplay`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 9
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: 1 isolated (content_purge) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved
- sources (2): https://apps.apple.com; https://apps.apple.com/us/app/soulplay-ai-character-chat/id6501972568

### Spellbound (`spellbound`) — scope: in — confidence: low

- usage: band D · supply 3 census runs · community users 4
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://tryspellbound.com

### Suka Lite (`suka-lite`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.ezuseapp.suka.lite

### Unscripti (`unscripti`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=com.unscriptiai

### VMate AI (`vmate-ai`) — scope: in — confidence: low

- usage: band D · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://vmate.ai

### Yodayo (`yodayo`) — scope: in — confidence: high

- usage: band D · supply 2 census runs · community users 9
- evidence: nsfw: yes — verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 2 recurring (content_purge, policy_pivot) · coverage: researched
- known gaps: none noted
- sources (7): https://www.reddit.com/r/CharacterAi_NSFW/comments/1eruftc/yodayo_and_their_weird_loli_tales_of_downfall/; https://www.reddit.com/r/Chub_AI/comments/1epbtcb/the_migration_has_begun/; https://www.reddit.com/r/YodayoAI/comments/1dunksj/jun_3_2024_updates_on_sensitive_content/ (+4 more in platforms.csv)

### メローズ (mellows) (`メローズ-mellows`) — scope: in — confidence: low

- usage: band D · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded


## Band U — unknown or none recorded (114 platforms)

### AI Angels (`ai-angels`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx+venice | chat (no image credits): yes · decided by pplx+venice
- red flags: 1 isolated (white_label_clone) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (3): https://aiangels.io; https://www.aiangels.io; https://www.aiangels.io/pricing

### AI Character Cards (`ai-character-cards`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+venice | chat (no image credits): yes · decided by gemini+venice
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (2): https://aicharactercards.com; https://aicharactercards.com/terms

### AI Horde / KoboldAI Horde (`ai-horde-koboldai-horde`) — scope: out — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### AI Peeps (`ai-peeps`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+pplx_deep+venice+venice_deep | chat (no image credits): yes · decided by gemini+pplx+pplx_deep+venice+venice_deep
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (2): https://aipeeps.com; https://aipeeps.com/faq/
- research provenance: deep pass files redflags-deep-perplexity-1.json | redflags-deep-venice-1.json

### AIHentaiChat (`aihentaichat`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): unresolved
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: chat without image credits: unresolved
- sources (3): https://aihentaichat.com; https://www.aihentaichat.com/; https://www.scam-detector.com/validator/aihentaichat-com-review/

### AIMOUR.AI (`aimour-ai`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): unresolved
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: chat without image credits: unresolved
- sources (2): https://aimour.ai; https://www.trustpilot.com/review/aimour.ai

### AiPornChat.online (`aipornchat-online`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): http://www.aipornchat.online/terms; https://aipornchat.online

### AiWaifu (`aiwaifu`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://aiwaifu.me

### Alive AI (`alive-ai`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by venice | chat (no image credits): no · decided by venice
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (2): https://aliveai.app; https://aliveai.app/terms

### AmorLink AI (`amorlink-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://amorlink.ai

### Angel AI (`angel-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by pplx+venice | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://angel.ai

### Anime.gf (`anime-gf`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users 2
- evidence: nsfw: yes — verbatim evidence · decided by gemini+venice | chat (no image credits): yes · decided by venice
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (3): https://animegf.com; https://medium.com/@Yorki/anime-gf-question-and-answer-session-q-a-dc12c9e32288; https://www.reddit.com/r/CharacterAi_NSFW/comments/1gvl5ts/tried_out_an_alternative/

### Anthropic / Claude API (`anthropic-claude-api`) — scope: out — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### Aroused AI (`aroused-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: conflict · decided by conflict | chat (no image credits): yes · decided by pplx+venice
- red flags: 2 isolated (deceptive_marketing, policy_pivot) · coverage: researched
- known gaps: nsfw: first-party sources disagree (conflict)
- sources (4): https://aroused.ai; https://aroused.ai/faq; https://aroused.ai/terms (+1 more in platforms.csv)

### Botbooru (`botbooru`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users 1
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (1): https://botbooru.com

### Brazzers.ai (`brazzers-ai`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): unresolved
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: chat without image credits: unresolved, 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://brazzers.ai; https://www.brazzers.ai/; https://www.trustpilot.com/

### Carter Chat (`carter-chat`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 1 isolated (shutdown_risk) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (2): https://carter.chat; https://www.reddit.com/r/carterchat/comments/1rs6n9c/carter_chat_is_shutting_down/

### CharacterSphere.ai (`charactersphere-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://charactersphere.ai; https://www.charactersphere.ai/

### Charbot (`charbot`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: 1 isolated (deceptive_marketing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://apps.apple.com; https://apps.apple.com/us/app/charbot-character-ai-chat/id6477548263; https://sites.google.com/view/aiCharbot-terms

### Chat de personajes con IA (`chat-de-personajes-con-ia`) — scope: in — confidence: medium

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by venice | chat (no image credits): yes · decided by pplx
- red flags: 1 isolated (deceptive_marketing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, 1 flag claim(s) downgraded in the conservative recount
- sources (3): https://play.google.com; https://play.google.com/store/apps/details?id=kinda.character.chat; https://play.google.com/store/apps/details?id=kinda.character.chat&hl=es_US

### CherryPop AI (`cherrypop-ai`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): conflict · decided by conflict
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: chat: first-party sources disagree (conflict)
- sources (4): https://cherrypop.ai; https://cherrypop.ai/chat; https://cherrypop.ai/terms-of-service (+1 more in platforms.csv)

### Clonella (`clonella`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+venice | chat (no image credits): yes · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://clonella.com; https://clonella.com/terms

### Couple Me (`couple-me`) — scope: in — confidence: high

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): no · decided by venice
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: none noted
- sources (2): https://couple.me; https://couple.me/terms-of-service

### CreatePorn (`createporn`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+venice | chat (no image credits): no · decided by gemini
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (4): https://createporn.com; https://legal.createporn.com/Create%20Porn%20-%20Terms%20and%20Conditions.pdf; https://www.createporn.com/faq (+1 more in platforms.csv)

### Crushi AI (`crushi-ai`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+venice | chat (no image credits): conflict · decided by conflict
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: chat: first-party sources disagree (conflict)
- sources (4): https://companaya.com/crushi-ai-premium-unlimited-generation-2026/; https://crushi.ai; https://crushi.ai/refund-policy (+1 more in platforms.csv)

### Cuties AI (`cuties-ai`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx+pplx_scope | chat (no image credits): unresolved
- red flags: 2 isolated (data_breach, white_label_clone) · coverage: researched
- known gaps: chat without image credits: unresolved
- sources (4): https://cuties.ai; https://haveibeenpwned.com/Breach/CutiesAI; https://www.scribd.com/document/950198568/Sd-General-Terms-and-Conditions-280824-134725 (+1 more in platforms.csv)

### DeepMode (`deepmode`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://deepmode.com

### Discutez avec un ami IA (`discutez-avec-un-ami-ia`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://apps.apple.com; https://apps.apple.com/us/app/discutez-avec-un-ami-ia/id6456408630?l=fr-FR

### Dream Companion (`dream-companion`) — scope: in — confidence: medium

- usage: band U · supply 4 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): no · decided by gemini
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (3): https://aixploria.com; https://www.mydreamcompanion.com; https://www.reddit.com/r/AI_Application/comments/1tiu0hh/dream_companion_ai_kept_hitting_me_with_token/

### DreamBF (`dreambf`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 1 isolated (white_label_clone) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (2): https://dreambf.ai; https://ehentai.ai/affiliate-policy

### DreamGen (`dreamgen`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://dreamgen.com; https://dreamgen.com/blog/articles/does-grok-allow-nsfw

### Dreamjourney AI (`dreamjourney-ai`) — scope: in — confidence: low

- usage: band U · supply 1 census runs · community users 8
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://dreamjourneyai.com

### Dreampress AI (`dreampress-ai`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: 2 isolated (billing, filter_tightening) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://dreampress.ai; https://www.trustpilot.com/review/dreampress.ai

### Eden AI (`eden-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://edenai.com

### eHentai.ai (`ehentai-ai`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 1 isolated (white_label_clone) · coverage: researched
- known gaps: none noted
- sources (4): https://ehentai.ai; https://ehentai.ai/affiliate-policy; https://ehentai.ai/deletion-strategy (+1 more in platforms.csv)

### Erogen AI (`erogen-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://erogen.ai

### EroPlay AI (`eroplay-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://eroplay.ai

### Flai (`flai`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### FlirtCam AI (`flirtcam-ai`) — scope: in — confidence: medium

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved
- sources (1): https://flirtcam.ai

### Friendogram (`friendogram`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 11
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### Fuckd.ai (`fuckd-ai`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://fuckd.ai

### Fykoo (`fykoo`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://fykoo.com

### Girlfriendly AI (`girlfriendly-ai`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://girlfriendly.ai

### GPT-SoVITS (`gpt-sovits`) — scope: out — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### HoneyChat (`honeychat`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://honeychat.bot

### HoneyPot (`honeypot`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://honeypot.com

### HotChat (`hotchat`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://play.google.com

### HotTalks AI (`hottalks-ai`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): no · decided by pplx
- red flags: 1 isolated (shutdown_risk) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (1): https://hottalks.ai

### Imate - AI boyfriend who cares (`imate-ai-boyfriend-who-cares`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://play.google.com

### Intimate AI (`intimate-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://intimate.ai

### Isekai Zero (`isekai-zero`) — scope: in — confidence: low

- usage: band U · supply 1 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (1): https://isekaizero.com

### Juicy AI (`juicy-ai`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://juicy-ai.com

### K / K*** (`k-k`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### Kajiwoto (`kajiwoto`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://kajiwoto.ai

### KoboldAI (`koboldai`) — scope: in — confidence: medium

- usage: band U · supply 4 census runs · community users 13
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 1 isolated (shutdown_risk) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (2): https://github.com; https://github.com/KoboldAI/KoboldAI-Client

### LateNight AI (`latenight-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://latenight.ai

### LoveChat (`lovechat`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://lovech.at

### Lovescape (`lovescape`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://lovescape.com; https://www.trustpilot.com/review/lovescape.ai

### LustCrush AI (`lustcrush-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://lustcrush.ai

### LustGF (`lustgf`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://lustgf.ai

### LusyChat AI (`lusychat-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://lusychat.ai

### Luvr AI (`luvr-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://luvr.ai

### MessengerX.io (`messengerx-io`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://messengerx.io

### Miku.gg (`miku-gg`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://miku.gg

### Mistrezz AI (`mistrezz-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://mistrezz.ai

### MoreYou.ai (`moreyou-ai`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 4
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://moreyou.ai

### My AI Friend (`my-ai-friend`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=talking.toy.funny.aifriend

### MyBabes AI (`mybabes-ai`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://mybabes.ai

### MyBunny AI (`mybunny-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://mybunnyai.com

### MyDreamBoy (`mydreamboy`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://mydreamboy.com

### MyLovely AI (`mylovely-ai`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): no · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://mylovely.ai

### NanoGPT (`nanogpt`) — scope: out — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources: none recorded

### Netwrck (`netwrck`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://netwrck.com

### Neverend (`neverend`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 5
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: 1 isolated (billing) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved
- sources (2): https://apps.apple.com; https://apps.apple.com/us/app/neverend-play-dnd-with-ai/id6760265252

### NSFW AI Chat (`nsfw-ai-chat`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://nsfwaichat.com

### NSFWBots (`nsfwbots`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://nsfwbots.com

### NSFWGirlfriend (`nsfwgirlfriend`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://nsfwgirlfriend.com

### NsfwGPT.AI (`nsfwgpt-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://nsfwgpt-ai.com

### OhChat (`ohchat`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://ohchat.com

### Oobabooga (Text Generation WebUI) (`oobabooga-text-generation-webui`) — scope: in — confidence: low

- usage: band U · supply 1 census runs · community users 8
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://github.com; https://github.com/oobabooga/text-generation-webui

### Oobabooga textgen / text-generation-webui (`oobabooga-textgen-text-generation-webui`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://github.com; https://github.com/oobabooga/text-generation-webui

### PixelChat (`pixelchat`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: conflict · decided by conflict | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: first-party sources disagree (conflict), red flags never researched in this store (empty != clean)
- sources (1): https://docs.pixelchat.ai/community-guidelines

### Pornify (`pornify`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by pplx
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (1): https://pornify.cc

### POVChat (`povchat`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://povchat.ai

### Promptchan AI (`promptchan-ai`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): conflict · decided by conflict
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat: first-party sources disagree (conflict)
- sources (2): https://aigirlfriendtested.com/promptchan-review/; https://promptchan.com

### Pygmalion AI (`pygmalion-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://pygmalion.chat

### Questie.ai (`questie-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (1): https://questie.ai

### Sea Soul (`sea-soul`) — scope: in — confidence: low

- usage: band U · supply 1 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://seasoul.ai; https://www.seasoul.ai

### Seduced AI (`seduced-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx | chat (no image credits): no · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: red flags never researched in this store (empty != clean)
- sources (2): https://seduced.com; https://www.seduced.com/

### Shemale-AI (`shemale-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://shemale-ai.com

### Soul.App (`soul-app`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (1): https://soul.app

### SweetChat (`sweetchat`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://sweetchat.fun

### Swerve AI (`swerve-ai`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 4
- evidence: nsfw: unresolved | chat (no image credits): no · decided by pplx
- red flags: 1 isolated (shutdown_risk) · coverage: researched
- known gaps: nsfw: no resolved first-party answer yet
- sources (1): https://swerve.ai

### Swipey AI (`swipey-ai`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users 2
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx+pplx_scope | chat (no image credits): yes · decided by pplx+pplx_scope
- red flags: 1 isolated (billing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, 1 flag claim(s) downgraded in the conservative recount
- sources (2): https://swipey.ai; https://www.trustpilot.com/review/swipey.ai

### TabbyAPI (`tabbyapi`) — scope: in — confidence: low

- usage: band U · supply 1 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://github.com; https://github.com/theroyallab/tabbyAPI

### Tabu (塔布 / tabulai) (`tabu-塔布-tabulai`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 5
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://tabulai.app

### Talkie Lab - AI Playground (`talkie-lab-ai-playground`) — scope: in — confidence: medium

- usage: band U · supply 0 census runs · community users 5
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: 1 isolated (policy_pivot) · coverage: researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file
- sources (3): https://elizareport.com/apps/talkie/; https://fetishaura.com/reviews/talkie-ai; https://www.talkie-ai.com/

### TalkieMate (`talkiemate`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://talkiemate.com

### TavernAI (`tavernai`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (2): https://github.com; https://github.com/TavernAI/TavernAI

### Texthub (`texthub`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://texthub.me

### Tiina: AI Voice Companion (`tiina-ai-voice-companion`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 7
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (2): https://apps.apple.com; https://apps.apple.com/us/app/tiina-ai-voice-companion/id6760369902

### Tipsy Chat (`tipsy-chat`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users 1
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://tipsy.chat

### Tyan AI (`tyan-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://tyan.ai

### Unhinged (`unhinged`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources: none recorded

### UnoRouter (`unorouter`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, red flags never researched in this store (empty != clean)
- sources (1): https://unorouter.ai

### Venice.ai (`venice-ai`) — scope: in — confidence: high

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — verbatim evidence · decided by gemini+pplx | chat (no image credits): yes · decided by gemini+pplx
- red flags: 2 isolated (billing, deceptive_marketing) · recounts downgraded 1 claim(s) · coverage: researched
- known gaps: 1 flag claim(s) downgraded in the conservative recount
- sources (5): https://venice.ai; https://venice.ai/blog/venice-vs-character-ai; https://venice.ai/legal/tos (+2 more in platforms.csv)

### Voice Chatbot by Oliver AI (`voice-chatbot-by-oliver-ai`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: unresolved | chat (no image credits): yes · decided by pplx
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, red flags never researched in this store (empty != clean)
- sources (1): https://apps.apple.com/au/app/voice-chatbot-by-oliver-ai/id6447604485

### WaifuChat (`waifuchat`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://waifuchat.ai

### Xotic AI (`xotic-ai`) — scope: in — confidence: low

- usage: band U · supply 3 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini+pplx | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://xotic.ai

### Yollo AI (`yollo-ai`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): yes · decided by gemini+pplx
- red flags: 1 isolated (deceptive_marketing) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only
- sources (1): https://yollo.ai

### Youtwo.ai (`youtwo-ai`) — scope: in — confidence: low

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: unresolved | chat (no image credits): unresolved
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw: no resolved first-party answer yet, chat without image credits: unresolved, red flags never researched in this store (empty != clean)
- sources (1): https://youtwo.ai

### Yume AI (`yume-ai`) — scope: in — confidence: medium

- usage: band U · supply 2 census runs · community users -
- evidence: nsfw: yes — non-verbatim evidence (paraphrase-only row) · decided by gemini | chat (no image credits): unresolved
- red flags: 1 isolated (white_label_clone) · coverage: researched
- known gaps: nsfw yes rests on non-verbatim paraphrase only, chat without image credits: unresolved
- sources (1): https://yumeai.com

### チャチャ / アニロール (`チャチャ-アニロール`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 3
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources (2): https://play.google.com; https://play.google.com/store/apps/details?id=ai.anirole.mobile&hl=en

### 林間聊愈室 (MoodTalker) (`林間聊愈室-moodtalker`) — scope: in — confidence: low

- usage: band U · supply 0 census runs · community users 10
- evidence: nsfw: no — non-verbatim evidence · decided by gemini | chat (no image credits): yes · decided by gemini
- red flags: none recorded · coverage: not_researched
- known gaps: nsfw answer is resolved but no verbatim first-party quote is on file, red flags never researched in this store (empty != clean)
- sources: none recorded


--- footer: 246 platforms by scope: borderline=1, in=234, out=11. Gaps are stored facts, not assignments; new questions belong in research-queue.json (who asked + why appended), never in this file.
