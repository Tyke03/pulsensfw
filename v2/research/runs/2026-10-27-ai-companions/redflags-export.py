# -*- coding: utf-8 -*-
"""Export the red-flag research inputs from merged/scoped.csv.
Rows with scope_decision in (in, borderline), sorted by canonical_id, split
into 4 roughly equal batches; PLUS the ready-to-paste prompt files.
Also writes method/03-red-flags-prompt.txt Verbatim."""
import csv, os, re, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
D = '2026-10-31'

def slugify(name):
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '-', (name or '').lower()).strip('-')
    return s or 'unknown'

rows = list(csv.DictReader(open(os.path.join(OUT, 'scoped.csv'), encoding='utf-8-sig')))
rf = [r for r in rows if r['scope_decision'] in ('in', 'borderline')]
rf.sort(key=lambda r: slugify(r['canonical_name']))
print('redflag rows:', len(rf))

PROMPT = """For each platform in the list below, research red flags and first-party facts. Use first-party sources (ToS, content policy, help/FAQ, pricing, product pages, official announcements) plus independent user reports (Reddit, Discord, forums, Trustpilot). Exclude affiliate review sites as evidence.
Return a JSON array only, one object per platform:
{"canonical_id":"","platform":"","nsfw_first_party":{"answer":"yes|no|unresolved","url":"","quote_or_paraphrase":"","verbatim":true},
 "chat_without_image_credits":{"answer":"yes|no|unresolved","url":""},
 "red_flags":[{"type":"billing|data_breach|policy_pivot|content_purge|filter_tightening|shutdown_risk|white_label_clone|deceptive_marketing|moderation_failure_csam_deepfake","summary":"","sources":[{"url":"","source_type":"first_party|independent_user|news","date_shown":"","accessed":"","verbatim":true}],"independent_users":0,"status":"isolated|recurring"}],
 "excluded_accounts":[{"account":"","reason":"staff|affiliate|self_promo"}],
 "operator":"","white_label_family":"","notes":""}
Rules: 'recurring' needs 2+ independent users; one user = 'isolated'. Count each username once per platform. Exclude staff, affiliate, or self-promoting accounts as evidence and log them in excluded_accounts. Keep conflicting reports side by side. Treat search snippets as leads only. Keep relative dates as shown plus the access date. A platform's own product copy offering explicit adult chat counts as first-party NSFW permission. If store_build_may_differ is true, judge NSFW on the web version. If nothing is found, return empty arrays — do not guess."""

with open(os.path.join(BASE, '..', '..', 'method', '03-red-flags-prompt.txt'), 'w', encoding='utf-8') as fh:
    fh.write(PROMPT + '\n')

n_per = (len(rf) + 3) // 4
batches = [rf[i*n_per:(i+1)*n_per] for i in range(4)]
# trim: if the last batch ends up empty, redistribute
batches = [b for b in batches if b]
print('batch sizes:', [len(b) for b in batches])
for i, b in enumerate(batches, 1):
    lines = ['canonical_id|name|primary_domain|category_id|scope_pending|store_build_may_differ']
    for r in b:
        lines.append('|'.join([
            slugify(r['canonical_name']),
            r['canonical_name'],
            r.get('url_domain') or '',
            r.get('category_id') or '',
            (r.get('scope_pending') or 'false'),
            ('true' if 'store_build_may_differ' in (r.get('usage_notes') or '') else 'false'),
        ]))
    with open(os.path.join(OUT, f'redflags-input-{i}.txt'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    with open(os.path.join(OUT, f'redflags-prompt-{i}.txt'), 'w', encoding='utf-8') as fh:
        fh.write(PROMPT + '\n\nPLATFORMS:\n' + '\n'.join(lines) + '\n')
json.dump([{'batch': i+1, 'rows': len(b)} for i, b in enumerate(batches)],
          open(os.path.join(OUT, 'redflags-batches.json'), 'w', encoding='utf-8'), indent=2)
print('batches written:', len(batches))
