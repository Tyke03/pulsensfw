import csv, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
p = 'merged/scope-checks.csv'
rows = list(csv.DictReader(open(p, encoding='utf-8-sig')))
print('rows:', len(rows))
from collections import Counter
kinds = Counter(r['what'].split(' (')[0] for r in rows)
print('kinds:', kinds.most_common(8))
# dupes per key (canonical_name, check_source, url) — treat 'what' first clause as check_source
keyed = Counter((r['canonical_name'], r['what'].split(' (')[0].strip(), r['url']) for r in rows)
dups = {k: v for k, v in keyed.items() if v > 1}
print('duplicate keys:', len(dups))
for k, v in list(dups.items())[:12]:
    print('  DUP x%s: %s | %s | %s' % (v, k[0], k[1], k[2]))
