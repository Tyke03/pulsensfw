# Affiliate signup queue

For Brent. Entities land here when research finds a program worth signing up for
(`affiliate_status: program_found_signup_queued`) — name, signup URL, commission,
and notes taken verbatim from the program's own page.

**Nothing is queued yet.** The only entities with verified programs are already
active and live:

| Entity | Status | Link |
| --- | --- | --- |
| CrushOn AI | active | https://crushon.ai/?ref=nzflztr&mist=1 |
| SpicyChat | active | https://spicychat.ai?ref=oge3yjk |

## Entities needing a search (needs_search)

Everything else, in ingest order: kindroid, chub-ai, janitor-ai, candy-ai, muah-ai,
tipsy-chat, nomi, dreamgen, chai, backyard-ai, angela-white, riley-reid, johnny-sins,
mia-khalifa, abella-danger, pornhub, vrporn-com, brazzers, lauren-phillips,
octavia-red, jennifer-white, brittany-andrews, leana-lovings.

Rules, unchanged and standing:

- Only `affiliate_status: active` links render as affiliate links. Everything
  else is a plain outbound link regardless of what is in the record.
- `no_program` still needs one search that comes up empty (with a date) before
  the status is set — absence is a researched fact too.
- Affiliate status never affects score or rank, ever.
- Any content agent whose article references an entity with `needs_search`
  checks that entity's affiliate status and records what they find via the same
  submission pipeline.
