import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
rows = json.load(open('merged/scoped.json', encoding='utf-8'))
for n in ('novelai', 'dreamgen', 'aidungeon', 'dreampress', 'smut writer', 'dreamjourney', 'story'):
    for o in rows:
        if n in o['canonical_name'].lower():
            print(f"[{o['scope_decision']}] {o['canonical_name']} | cat={o['category_id']} | segs={(o.get('segments') or '')[:200]}")
