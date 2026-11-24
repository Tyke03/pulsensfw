# -*- coding: utf-8 -*-
"""Idempotent rebuild of merged/scope-checks.csv:
- dedupe on (canonical_name, check_source, url), keeping the LATEST row (file order)
  — 'latest' is just the last occurrence, since we append in run order.
- Perplexity-scope-check rows are re-emitted fresh from
  census-scope-checks-perplexity.json (exactly 22).
Non-Perplexity rows (248 scope-pass rows) are kept as-is, one per row."""
import csv, json, os, re, sys, io
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
D = '2026-10-31'
p = os.path.join(OUT, 'scope-checks.csv')
rows = [r for r in csv.DictReader(open(p, encoding='utf-8-sig'))]

def scope_key(r):
    w = (r.get('what') or '')
    kind = w.split(' (')[0].strip()
    is_perp = kind.startswith('Perplexity scope check')
    return kind, is_perp

before = len(rows)
# 1) dedupe (canonical_name, kind, url), keep last
kept = {}
for r in rows:
    kind, is_perp = scope_key(r)
    key = (r['canonical_name'].lower(), kind, r['url'])
    if is_perp:
        # keep the LATEST perplexity row per (canonical_name, url) — skip lookup here; just keep last occurrence
        kept.setdefault(('pperp', r['canonical_name'].lower(), r['url']), []).append((None, r))
    else:
        kept.setdefault(('other', r['canonical_name'].lower(), kind, r['url']), []).append((None, r))
deduped = []
for k2, v2 in kept.items():
    deduped.append(v2[-1][1])
print('after plain dedupe:', len(deduped))
# 2) Perplexity rows must be exactly one per record, rebuilt fresh
CHECKS = json.load(open(os.path.join(BASE, 'census-scope-checks-perplexity.json'), encoding='utf-8'))
def unwrap(url):
    m = re.search(r'\((https?://[^)]+)\)', url or '')
    return m.group(1) if m else (url or '').strip()
pperp_keep = [r for r in deduped if scope_key(r)[1] is True]
non_perp = [r for r in deduped if scope_key(r)[1] is False]
# rebuild the Perplexity rows fresh from the JSON, keyed by the scoped.csv names
scoped = list(csv.DictReader(open(os.path.join(OUT, 'scoped.csv'), encoding='utf-8-sig')))
def norm_key(s): return re.sub(r'[^a-z0-9]+', '', (s or '').lower())
fresh = []
for rec in CHECKS:
    pk = norm_key(rec['platform'])
    row2 = next((o for o in scoped if norm_key(o['canonical_name']) == pk), None)
    if row2 is None:
        row2 = next((o for o in scoped if pk.startswith(norm_key(o['canonical_name']))), None)
    url = unwrap((rec.get('evidence') or [{}])[0].get('url'))
    name = row2['canonical_name'] if row2 else rec['platform']
    fresh.append({'canonical_name': name,
                  'url': url,
                  'what': 'Perplexity scope check (census-scope-checks-perplexity.json): ' + (rec.get('test') or '')[:80],
                  'result': rec.get('answer') or ''})
final = non_perp + fresh
print('rebuild rows:', len(final))
# assert: exactly one Perplexity Scope check per record
assert len(fresh) == len(CHECKS), 'perplexity rows mismatch'
kk = Counter(f0['canonical_name'] + '|' + f0['url'] for f0 in fresh)
assert all(v == 1 for v in kk.values()), 'perplexity rows not unique'
# assert: no duplicates anywhere
keyed = Counter((r['canonical_name'], scope_key(r)[1], r['url']) for r in final)
assert all(v == 1 for v in keyed.values()), f'dupes remain: {[k for k, v in keyed.items() if v > 1][:4]}'
with open(p, 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=['canonical_name', 'url', 'what', 'result'])
    w.writeheader()
    for r in final:
        w.writerow(r)
print('rows before:', before, '| after:', len(final), '| removed:', before - len(final))
