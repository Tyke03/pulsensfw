# Writer 3 — Notes & Ideas

## Pending Article Ideas

<!-- Add article ideas here as they come up -->
<!-- Format: - [category] Title idea — why it's worth writing -->
- [vr] "Best VR Porn Apps for Meta Quest 3 in 2026" — DeoVR vs PLAY'A vs HereSphere comparison, practical follow-up to the setup guide
- [vr] "VR Porn Passthrough on Quest 3: AR Mode Explained" — passthrough/AR porn is a distinct use case worth its own guide; content from SexLikeReal and VRPorn.com growing fast
- [vr] "Quest 3 vs Quest 3S for VR Porn: Is the Price Difference Worth It?" — resolution difference ($200 gap) is a real reader question

## Pending Internal Links

<!-- Track articles that need links added once published -->
<!-- Format: - slug-to-link-from → slug-to-link-to (add when [target] is published) -->

## Research Threads

<!-- Ongoing research, sources to follow up on, data to verify -->
- DeoVR added full AV1 codec support Oct 2024 (confirmed via deovr.com blog). Good for future DeoVR-focused articles.
- VRPorn.com PLAY'A app supports up to 8K streaming and passthrough on Quest 3 — more capable than the browser player. Worth calling out in any PLAY'A-specific content.
- Quest 3S ($299) vs Quest 3 ($499): resolution difference is 1832×1920 vs 2064×2208 per eye. For streaming content the difference is minimal; for downloaded 6K+ files it matters more.

## Known Published Articles (for internal linking)

<!-- Update this list as new articles go live — use it to find internal link targets -->
<!-- Pull current list from: GET /api/posts?limit=50&status=published -->
- vr-porn-meta-quest-3-setup-guide (Post ID 29, draft) — this article

## API Notes

- [2026-05-03] API docs show snake_case field names (meta_title, meta_description) but PUT requests require camelCase (metaTitle, metaDescription) to persist. POST creation ignores meta fields entirely — must follow with a PUT to set them.
