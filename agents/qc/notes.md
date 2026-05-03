# QC Agent — Notes

Persistent notes across sessions. Update when recurring patterns emerge or when escalation is needed.

---

## Escalated Items

Items requiring operator attention that were not resolvable by the QC agent alone.

<!-- Format: [YYYY-MM-DD] Post: [slug/id] — [concern] — [status: open/resolved] -->

---

## Recurring Patterns

Track recurring issues by writer and dimension. Useful for improving writer skill prompts.

<!-- Format:
**Writer [N] — [Dimension]**
[Pattern description]
First seen: [date] | Sessions observed: [N]
-->

---

## Operator-Directed Holds

Posts the operator has instructed the QC agent to hold, skip, or treat specially.

<!-- Format: [YYYY-MM-DD] Post: [slug/id] — [instruction from operator] -->

---

## Open Fact-Check Items

Posts currently prefixed `[QC: FACT CHECK]` awaiting operator resolution.

<!-- Format: [YYYY-MM-DD] Post: [slug/id] — [specific concern] — [status: open/resolved] -->

---

## [2026-05-03] Session 1 — Recurring Patterns

**First-generation writer agents (how-to-agent, vr-agent, ai-chatbots-agent, industry-news-agent) — Dimensions 3 & 4**
Pattern: All four pre-named writer agent articles (posts 3, 4, 5, 6) are missing affiliate Quick Links boxes and contain zero internal links. These agents appear to have been running without affiliate injection and internal linking instructions operationalized. This is a systemic gap in those skill prompts, not a one-off.
First seen: 2026-05-03 | Sessions observed: 1

**Dimension 4 (Structure) — Internal Links across all older posts**
Pattern: The first-generation posts all have zero /posts/ links. Some have explicit placeholder-style language ("We've reviewed both in detail elsewhere" in Post 6) that was never resolved into actual links. These agents need to be updated to require a minimum of 2 internal links and a Related reading line before considering a draft complete.
First seen: 2026-05-03 | Sessions observed: 1

**Dimension 2 (SEO) — metaTitle slightly under 50 chars**
Pattern: Posts 3, 5, and 6 all had metaTitles in the 48-50 char range — technically outside the 50-60 target. Auto-fixed in all three cases. The generating agents appear to be hitting ~48 chars and stopping. The writer skill prompts should emphasize the 50-char minimum explicitly.
First seen: 2026-05-03 | Sessions observed: 1

**Dimension 5 (Factual) — Stale OpenAI claims in ai-chatbots articles**
Pattern: Post 26 references the OpenAI adult mode as if it is still forthcoming, while Post 6 covers its cancellation. Articles in the ai-chatbots category should reference the March 2026 OpenAI cancellation as established fact. Writer agents covering this category should treat the cancellation as context in all future articles.
First seen: 2026-05-03 | Sessions observed: 1

---

## Escalated Items

<!-- [2026-05-03] Post: post-26 (best-nsfw-ai-chatbots-2026) — Stale OpenAI adult mode reference — status: open -->
<!-- [2026-05-03] Post: post-31 (onlyfans-creator-earnings-2026) — "$101 million" all-time gross receipts figure likely should be "$101 billion" — status: open -->

---

## Open Fact-Check Items

<!-- [2026-05-03] Post: post-26 (best-nsfw-ai-chatbots-2026) — OpenAI adult mode claim states feature "announced" and implies it's coming; should reflect March 2026 cancellation — status: open -->
<!-- [2026-05-03] Post: post-31 (onlyfans-creator-earnings-2026) — "all-time gross receipts topping $101 million" almost certainly should be "$101 billion" based on internal data in same article — status: open -->
