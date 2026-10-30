# -*- coding: utf-8 -*-
"""Mechanically apply 01-scope-gemini.json categories/rules to
merged/shortlist-usage.csv. Uses only facts already in our data plus the
platform's own first-party sources already recorded (logged check URLs).
Never uses list position, traffic, or affiliate status."""
import json, csv, os, re, sys
from collections import Counter, defaultdict
sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
D = '2026-10-30'

SCOPE = json.load(open(os.path.join(BASE, '01-scope-gemini.json'), encoding='utf-8'))
IDS = {c['id']: c for c in SCOPE['categories']}
rows = list(csv.DictReader(open(os.path.join(OUT, 'shortlist-usage.csv'), encoding='utf-8-sig')))

A_DATA = json.load(open(os.path.join(BASE, 'census-A-strawberry', 'nsfw-ai-platform-census.json'), encoding='utf-8'))
A_sources = defaultdict(list)
for c in A_DATA['candidates']:
    A_sources[re.sub(r'[^a-z0-9]+', '', (c.get('name') or '').lower())].extend(
        [e.get('url') for e in (c.get('evidence') or []) if e.get('url')])

def norm_key(s):
    return re.sub(r'[^a-z0-9]+', '', (s or '').lower())

def has(hay, *words):
    h = (hay or '').lower()
    return any(w in h for w in words)

def cat_of(rule, role_text, frontend):
    if rule.startswith(('E', 'adjacent-to-scope')):
        return 'out'
    for cid in IDS:
        if rule.lower().startswith(cid):
            return cid
    if frontend or 'frontend' in (role_text or '').lower():
        return 'byok_local_frontends'
    if 'companion' in (role_text or '').lower():
        return 'dedicated_virtual_companions'
    return 'hosted_character_hubs'

# KNOWN first-party/record-backed decisions for individual platforms.
# Facts come from our own records (census A/B, entity facts checked 2026-10-27).
KNOWN = {
    'characterai': ('out', 'E1: SFW-only platform (census A first-party review pages: SFW product with NSFW only via community workarounds)',
                    'none further — first-party SFW status already recorded; re-check only if it pivots'),
    'polybuzz': ('out', 'E1: SFW-only platform requiring filter workarounds (community filter-evasion reports; census-A "filtered" class)',
                 'two independent current ToS/first-party policy statements permitting explicit content'),
    'pi': ('out', 'E1: SFW-only general assistant; also borderline case 1 (no persona/card system)',
           'current ToS explicit NSFW-permission text'),
    'chatgpt': ('out', 'E1 + borderline case 1: general-purpose assistant, SFW-only',
                'none — categorical'),
    'ollama': ('out', 'E3: local model hosting/runtime with no shipped character/persona UI',
               'na — categorical by category definition'),
    'openrouter': ('out', 'E3: raw LLM API router (borderline case 4: backend fuel only)',
                   'na — categorical by category definition'),
    'nano': ('out', 'E3: LLM API/gateway service',
             'na — categorical by category definition'),
    'grok': ('borderline', 'B1: general-purpose assistant with an adult/"unhinged" mode (borderline case 1)',
             'does the product offer dedicated persona persistence / character-card slots / relationship memory? (first-party product pages)'),
    'camsoda': ('borderline', 'B2: adult cam/creator brand with an AI chat widget (borderline case 2)',
                'is the AI chat the primary product in its own ToS/product pages, or a lead-capture funnel to human performers?'),
    'replika': ('out', 'pivot case: judge strictly by current live policy (census A/B record the 2023 intimacy removal and current SFW-first product)',
                'can a new account access explicit NSFW chat on standard tiers today? (first-party ToS) — decides in vs stays out'),
}

def a_status(r):
    return (r.get('census_A_classification') or '')

def a_all(r):
    return a_status(r) + ' || ' + (r.get('segments') or '')

checks_log = []
seen_checks = set()
def log_check(name, url, what, result):
    t = (name, url, what, result)
    if url and t not in seen_checks:
        seen_checks.add(t)
        checks_log.append({'canonical_name': name, 'url': url, 'what': what[:150], 'result': result[:150]})

out_rows = []
for r in rows:
    name = r['canonical_name']
    k = norm_key(name)
    role = (r.get('ecosystem_role') or '').lower()
    frontend = r.get('frontend_flag') == 'yes'
    cls = a_status(r)
    cls_all = a_all(r)
    segs = (r.get('segments') or '')
    decision = rule = needs = None

    # check exact/known record-backed rows first (exact keys only — prefix matching once
    # swallowed PixelChat into the 'pi' rule)
    if k in KNOWN:
        decision, rule, needs = KNOWN[k]

    # categorical exclusions by ecosystem role
    if decision is None:
        if ('model' in role and 'api' in role) or 'api router' in role or 'model' in role and 'hub' in role:
            # conflicted role vote = the data itself says the platforms disagree on what Venice-like rows are
            if (r.get('ecosystem_role_conflict') or '') == 'yes':
                decision = 'borderline'
                rule = 'B3/role-conflict: ecosystem-role vote is conflicted (model/api vs hosted) — borderline case 4 must be settled first-party'
                needs = 'first-party product page: can a user start a hosted persona chat session with built-in persona management? (decides B3 suite vs raw gateway)'
            else:
                decision, rule, needs = 'out', 'E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded', 'na — categorical: no persona/card management by category definition'
        elif 'image generator' in role or ('image' in a_all(r).lower() and 'adjacent' not in a_all(r).lower()):
            decision = 'borderline'
            rule = 'B3: adult image/video generation suite with a bolted-on chat tab — include only if the chat engine is competitive standalone'
            needs = 'borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits?'
        elif 'lore hub' in role or 'card' in role and 'hub' in role:
            decision = 'in'
            rule = 'hybrid_hub_and_frontend: public character-card repository with optional first-party hosted chat'
            needs = 'first-party page proving both the public repository and a hosted chat path; otherwise this moves to borderline'
        elif 'directory' in role or has(a_all(r), 'discovery-only directory'):
            decision = 'out'
            rule = 'adjacent-to-scope: directories/aggregators are discovery context, not platforms (scope categories exclude them)'
            needs = 'na — revisit only if the platform shows a first-party hosted chat product'

    # census-A dead/unavailable lead statuses
    if decision is None and has(cls, 'reported shutdown', 'original page failed', 'returned not found', 'listing cannot prove', 'original dotdotdot page failed', 'original store url returned not found'):
        decision, rule = 'out', 'E5: dead, sunsetted, or indefinitely unavailable platforms excluded'
        needs = 'live announcement/status check: keep only if a live service is currently accepting new adult users'

    # census-A explicit SFW filters / sandboxed heritage
    if decision is None and (has(a_all(r), 'explicitly sfw') or has(a_all(r), 'explicit sfw')):
        decision, rule = 'out', 'E1 + borderline case 7: SFW platform whose NSFW relies on community filter workarounds (census-A record)'
        needs = 'current first-party ToS adult-permission text (re-check only on suspected pivot)'

    # regional/non-English primary
    if decision is None and has(a_all(r), 'non-english', 'korean-only', 'korean only', 'japanese-only', 'chinese/taiwanese', 'non english'):
        decision = 'borderline'
        rule = 'B4: regional / non-English-primary platform — excluded from an English Top 10 unless full localization + fluent English output verified'
        needs = 'first-party UI localization check + international payments + English-language model fluency'

    # general adult-mode assistants / cam-brand upsells (sniffed via census-A or role)
    if decision is None and has(a_all(r), 'cam ', 'cam site', 'creator platform', 'fan platform'):
        decision = 'borderline'
        rule = 'B2: adult cam/creator brand with AI chat widget (borderline case 2)'
        needs = 'is the AI chat the primary product in its ToS/product pages, or a upsell to human performers?'
    if decision is None and (has(a_all(r), 'image-first', 'image/video-first', 'visual-first')):
        decision = 'borderline'
        rule = 'B3: adult image/video generation suite with a chat tab — include only if chat engine competitive standalone'
        needs = 'borderline case 3 test: first-party chat feature page — multi-turn memory + custom personas independent of image credits?'

    # default: hosted platform / frontend split by ecosystem role
    if decision is None:
        if frontend or 'frontend' in role or 'local' in role:
            decision, rule = 'in', 'byok_local_frontends: self-hosted / local chat frontend (ranked separately per scope)'
            needs = 'NSFW policy inherits from the user backend (no platform ToS limit); needs_check: any bundled default models'
        elif 'companion' in a_all(r).lower() and 'character hub' not in a_all(r).lower():
            decision, rule = 'in', 'dedicated_virtual_companions: persistent 1-on-1 relationship emphasis (census-A/B segment evidence)'
            needs = 'first-party ToS / 18+ permission text recorded from the platform home'
        else:
            decision, rule = 'in', 'hosted_character_hubs: hosted character roleplay hub (turnkey chat with persona library)'
            needs = 'first-party ToS / 18+ permission text recorded from the platform home'

    cat = cat_of(rule, role, frontend) if decision != 'out' else 'out'
    # check URLs: facts we already hold
    urls = (A_sources.get(k) or [])[:1]
    if urls:
        for u in urls:
            log_check(name, u, 'first-party/community fact source already held (census-A evidence page)', f'decision={decision}')
    else:
        log_check(name, f"https://{r.get('url_domain')}/", 'platform home — first-party ToS check pending', f'decision={decision}')
    out_rows.append({**r,
                     'category_id': cat,
                     'scope_decision': decision,
                     'rule_applied': rule,
                     'needs_check': needs})

cols = list(rows[0].keys()) + ['category_id', 'scope_decision', 'rule_applied', 'needs_check']
with open(os.path.join(OUT, 'scoped.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
    w.writeheader()
    for row in out_rows:
        w.writerow(row)
json.dump(out_rows, open(os.path.join(OUT, 'scoped.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False, default=str)
open(os.path.join(OUT, 'scoped.json'), 'a', encoding='utf-8').write('\n')
with open(os.path.join(OUT, 'scope-checks.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=['canonical_name', 'url', 'what', 'result'])
    w.writeheader()
    for c0 in checks_log:
        w.writerow(c0)

cats = Counter(o['category_id'] for o in out_rows)
decs = Counter(o['scope_decision'] for o in out_rows)
rep = ['# Scope report', '', f'Generated: {D}', '',
       'Applied 01-scope-gemini.json mechanically to merged/shortlist-usage.csv.',
       'Used only facts already in our data (census A/B files, entity facts, ecosystem role) plus',
       'logged first-party check URLs. No list positions, no traffic, no affiliate status were used.', '',
       f'- rows scoped: **{len(out_rows)}**',
       f'- decisions: ' + ', '.join(f'{k}={v}' for k, v in sorted(decs.items())),
       f'- categories: ' + ', '.join(f'{k}={v}' for k, v in sorted(cats.items())), '',
       '## Counts per (category, decision)', '', '| category | in | borderline | out |', '|---|---|---|---|']
groups = defaultdict(list)
for o in out_rows:
    groups[o['category_id']].append(o)
for cat in sorted(groups):
    dd = Counter(o['scope_decision'] for o in groups[cat])
    rep.append(f"| {cat} | {dd.get('in', 0)} | {dd.get('borderline', 0)} | {dd.get('out', 0)} |")
rep += ['', '## Out rows (rule applied + needs_check)', '', '| row | rule applied | needs_check |', '|---|---|---|']
for o in out_rows:
    if o['scope_decision'] == 'out':
        rep.append(f"| {o['canonical_name']} | {o['rule_applied'][:220]} | {o['needs_check'][:160]} |")
rep += ['', '## Borderline rows (rule applied + needs_check)', '', '| row | rule applied | needs_check |', '|---|---|---|']
for o in out_rows:
    if o['scope_decision'] == 'borderline':
        rep.append(f"| {o['canonical_name']} | {o['rule_applied'][:220]} | {o['needs_check'][:220]} |")
rep += ['', '## Categories reference', '']
for cid, c in IDS.items():
    rep.append(f"- **{cid}** ({c['name']}){' (ranked separately)' if c.get('ranked_separately') else ''} — {c['definition'][:320]}")
rep += ['', '## Check log', '', 'Every scoped row has a check entry in merged/scope-checks.csv: either a census-A fact URL', 'already on file, or the platform home domain marked first-party ToS check pending.', 'No new lives were fabricated; every recorded check URL is a URL we already hold or the row domain.']
open(os.path.join(OUT, 'SCOPE-REPORT.md'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
print('scoped rows:', len(out_rows), '| decisions:', dict(decs))
print('categories:', dict(cats.most_common()))
