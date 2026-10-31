# Affiliate signup queue

For Brent. Entities land here when research finds a program worth signing up for
(`affiliate_status: program_found_signup_queued`) — name, signup URL, commission,
and notes taken verbatim from the program's own page.

## program_found_signup_queued — sign these up

| Entity | Program | Signup URL | Commission / notes |
| --- | --- | --- | --- |
| SexLikeReal | SexLikeReal VR Webmaster Affiliate (in-house) | https://affiliate.sexlikereal.com/ | First-party rates off their own page: Monthly Premium + Annual + rebills 35%, Lifetime Premium 15%, Pay-per-video 35%, live cams & interactive scripts 15%. |
| VR Bangers | UnzipVR Affiliates (VR Bangers program, in-house portal) | https://unzipvr.com/ | JS-only portal; rates visible after signup. vrbangers.com "Affiliates" menu points here. |
| Brazzers | AdultForce (Brazzers offer) | https://www.adultforce.com/signup | Revshare / pay-per-signup / pay-per-lead models; brazzers.com's own config points its AFFILIATE_PROGRAM_URL at adultforce.com. Brazzers-specific % not published publicly; 15-business-day payout cycle. |

Brent: after signup, move each entity to `affiliate_status: active` with the
tracked URL in `affiliate_url` (via `npm run ingest` or a direct JSON edit).

## Already active — live links

| Entity | Status | Link |
| --- | --- | --- |
| CrushOn AI | active | https://crushon.ai/?ref=nzflztr&mist=1 |
| SpicyChat | active | https://spicychat.ai?ref=oge3yjk |

## Searched this pass, program not confirmed

- **Pornhub** — help center documents Premium pricing ($9.99/mo first-party) but
  no public webmaster/affiliate signup was found this pass (pornhub.com/affiliate
  and /webmasters resolve to the consumer site). Status stays `needs_search`.
  Note: AdultForce's partner list does not include Pornhub either — evidence
  points toward "no classic affiliate program"; confirm before marking
  `no_program`.

## Entities needing a search (needs_search)

kindroid, chub-ai, janitor-ai, candy-ai, muah-ai, tipsy-chat, nomi, dreamgen,
chai, backyard-ai, novelai, angela-white, riley-reid, johnny-sins, mia-khalifa,
abella-danger, eva-elfie, mia-malkova, violet-myers, kazumi, sophie-rain,
eva-lovia, hayley-davies, lauren-phillips, octavia-red, jennifer-white,
brittany-andrews, leana-lovings, vrporn-com, pornhub.

Rules, unchanged and standing:

- Only `affiliate_status: active` links render as affiliate links. Everything
  else is a plain outbound link regardless of what is in the record.
- `no_program` still needs one search that comes up empty (with a date) before
  the status is set — absence is a researched fact too.
- Affiliate status never affects score or rank, ever.
- Any content agent whose article references an entity with `needs_search`
  checks that entity's affiliate status and records what they find via the same
  submission pipeline.

