# -*- coding: utf-8 -*-
"""Build merged/shortlist.csv from merged/candidates.csv.

Keep rows where: supply_runs_count >= 2  OR  qualified_recomputed = true
OR (community_users_A + community_users_B) >= 3. All columns kept, plus
inclusion_reason. Also write usage-pass-input.txt lines
"canonical_name | domain | ecosystem_role".
"""
import json, csv, os, sys
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
D = '2026-10-29'

rows = list(csv.DictReader(open(os.path.join(OUT, 'candidates.csv'), encoding='utf-8-sig')))
out = []
for r in rows:
    supply = int(r['supply_runs_count'] or 0)
    qrec = str(r['qualified_recomputed']).strip().lower() in ('true', '1', 'yes')
    users_a = int(r['community_users_A'] or 0)
    users_b = int(r['community_users_B'] or 0)
    reasons = []
    if supply >= 2:
        reasons.append(f'supply_runs_count>=2 ({supply})')
    if qrec:
        reasons.append('qualified_recomputed (3+ unique source threads A+B)')
    if users_a + users_b >= 3:
        reasons.append(f'community_users_A+B>=3 ({users_a + users_b})')
    if reasons:
        r2 = dict(r)
        r2['inclusion_reason'] = ' ; '.join(reasons)
        out.append(r2)

cols = list(rows[0].keys()) + ['inclusion_reason']
with open(os.path.join(OUT, 'shortlist.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
    w.writeheader()
    for r in out:
        w.writerow(r)
with open(os.path.join(OUT, 'usage-pass-input.txt'), 'w', encoding='utf-8') as fh:
    for r in out:
        fh.write(f"{r['canonical_name']} | {r['url_domain']} | {r['ecosystem_role']}\n")

# JSON mirror for traceability
json.dump({'generated': D, 'rule': 'supply_runs_count>=2 OR qualified_recomputed OR community_users_A+B>=3',
           'row_count': len(out), 'rows': out},
          open(os.path.join(OUT, 'shortlist.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False, default=str)
open(os.path.join(OUT, 'shortlist.json'), 'a', encoding='utf-8').write('\n')

role = Counter((r['ecosystem_role'] or '(none)') for r in out)
with_sig = sum(1 for r in out if (r.get('usage_signal_json') or r.get('usage_signal')))
sig_rows = [r for r in out if (r.get('usage_signal_json') or r.get('usage_signal'))]
print('shortlisted:', len(out))
print('by role:', role.most_common(20))
print('with any usage_signal:', with_sig)
