import csv, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
scoped = list(csv.DictReader(open('merged/scoped.csv', encoding='utf-8-sig')))
checks = list(csv.DictReader(open('merged/scope-checks.csv', encoding='utf-8-sig')))
from collections import Counter
print('scoped decisions:', Counter(o['scope_decision'] for o in scoped))
print('checks:', len(checks), '| Perplexity rows:', sum(1 for r in checks if 'Perplexity scope check' in (r.get('what') or '')))
# resolved independent checks
for n in ['Secrets AI','Nectar','Swipey','OurDream','CamSoda','Venice','UnoRouter','Zeta AI','Caveduck','Grok','GPT-SoVITS','Replika','Candy AI','Soulkyn']:
    r = next((x for x in scoped if n.lower() in x['canonical_name'].lower()), None)
    print(f"{r['canonical_name']}: {r['scope_decision']} | rule: {r['rule_applied'][:80]}")
