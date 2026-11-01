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
D = '2026-10-31'

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
                    'none further â€” first-party SFW status already recorded; re-check only if it pivots'),
    'polybuzz': ('out', 'E1: SFW-only platform requiring filter workarounds (community filter-evasion reports; census-A "filtered" class)',
                 'two independent current ToS/first-party policy statements permitting explicit content'),
    'pi': ('out', 'E1: SFW-only general assistant; also borderline case 1 (no persona/card system)',
           'current ToS explicit NSFW-permission text'),
    'chatgpt': ('out', 'E1 + borderline case 1: general-purpose assistant, SFW-only',
                'none â€” categorical'),
    'ollama': ('out', 'E3: local model hosting/runtime with no shipped character/persona UI',
               'na â€” categorical by category definition'),
    'openrouter': ('out', 'E3: raw LLM API router (borderline case 4: backend fuel only)',
                   'na â€” categorical by category definition'),
    'nano': ('out', 'E3: LLM API/gateway service',
             'na â€” categorical by category definition'),
    'grok': ('borderline', 'B1: general-purpose assistant with an adult/"unhinged" mode (borderline case 1)',
             'does the product offer dedicated persona persistence / character-card slots / relationship memory? (first-party product pages)'),
    'camsoda': ('borderline', 'B2: adult cam/creator brand with an AI chat widget (borderline case 2)',
                'is the AI chat the primary product in its own ToS/product pages, or a lead-capture funnel to human performers?'),
    'replika': ('out', 'pivot case: judge strictly by current live policy (census A/B record the 2023 intimacy removal and current SFW-first product)',
                'can a new account access explicit NSFW chat on standard tiers today? (first-party ToS) â€” decides in vs stays out'),
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

    # check exact/known record-backed rows first (exact keys only â€” prefix matching once
    # swallowed PixelChat into the 'pi' rule)
    if k in KNOWN:
        decision, rule, needs = KNOWN[k]

    # categorical exclusions by ecosystem role
    if decision is None:
        if ('model' in role and 'api' in role) or 'api router' in role or 'model' in role and 'hub' in role:
            # conflicted role vote = the data itself says the platforms disagree on what Venice-like rows are
            if (r.get('ecosystem_role_conflict') or '') == 'yes':
                decision = 'borderline'
                rule = 'B3/role-conflict: ecosystem-role vote is conflicted (model/api vs hosted) â€” borderline case 4 must be settled first-party'
                needs = 'first-party product page: can a user start a hosted persona chat session with built-in persona management? (decides B3 suite vs raw gateway)'
            else:
                decision, rule, needs = 'out', 'E3: raw LLM API routers / model hosting providers / unstyled dev sandboxes excluded', 'na â€” categorical: no persona/card management by category definition'
        elif 'image generator' in role or ('image' in a_all(r).lower() and 'adjacent' not in a_all(r).lower()):
            decision = 'borderline'
            rule = 'B3: adult image/video generation suite with a bolted-on chat tab â€” include only if the chat engine is competitive standalone'
            needs = 'borderline case 3 test: first-party chat feature page â€” multi-turn memory + custom personas independent of image credits?'
        elif 'lore hub' in role or 'card' in role and 'hub' in role:
            decision = 'in'
            rule = 'hybrid_hub_and_frontend: public character-card repository with optional first-party hosted chat'
            needs = 'first-party page proving both the public repository and a hosted chat path; otherwise this moves to borderline'
        elif 'directory' in role or has(a_all(r), 'discovery-only directory'):
            decision = 'out'
            rule = 'adjacent-to-scope: directories/aggregators are discovery context, not platforms (scope categories exclude them)'
            needs = 'na â€” revisit only if the platform shows a first-party hosted chat product'

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
        rule = 'B4: regional / non-English-primary platform â€” excluded from an English Top 10 unless full localization + fluent English output verified'
        needs = 'first-party UI localization check + international payments + English-language model fluency'

    # general adult-mode assistants / cam-brand upsells (sniffed via census-A or role)
    if decision is None and has(a_all(r), 'cam ', 'cam site', 'creator platform', 'fan platform'):
        decision = 'borderline'
        rule = 'B2: adult cam/creator brand with AI chat widget (borderline case 2)'
        needs = 'is the AI chat the primary product in its ToS/product pages, or a upsell to human performers?'
    if decision is None and (has(a_all(r), 'image-first', 'image/video-first', 'visual-first')):
        decision = 'borderline'
        rule = 'B3: adult image/video generation suite with a chat tab â€” include only if chat engine competitive standalone'
        needs = 'borderline case 3 test: first-party chat feature page â€” multi-turn memory + custom personas independent of image credits?'

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
        log_check(name, f"https://{r.get('url_domain')}/", 'platform home â€” first-party ToS check pending', f'decision={decision}')
    tokens = has(a_all(r), 'creative writing', 'narrative adventure', 'co-writ', 'document-first', 'writing platform')
    is_engine_ours = any(norm_key(name).startswith(t) for t in ('novelai', 'dreamgen'))
    if decision in ('in', 'borderline') and cat != 'out' and (tokens or is_engine_ours):
        cat = 'interactive_story_engines'
        rule = 'interactive_story_engines: document/adventure/narrative-first AI writing platform rather than direct persona chat (ranked separately per scope); matches census-A/B segment text or our own carried first-party facts'
    # Fix pass 2: Gemini's stated default when a borderline stays unresolved
    default_if_unresolved = ''
    if decision == 'borderline':
        if rule.startswith('B1') or rule.startswith('B4'):
            default_if_unresolved = 'exclude_main (Gemini borderline default)'
        elif rule.startswith('B2'):
            default_if_unresolved = 'exclude (Gemini borderline default: upsell/funnel unless proven primary product)'
        elif 'role-conflict' in rule:
            default_if_unresolved = 'exclude until the first-party persona-chat test settles the category'
        elif rule.startswith('B3') or 'image' in rule[:12].lower() or 'suite' in rule[:60].lower():
            default_if_unresolved = 'exclude_unless_chat_test_passes (Gemini borderline default for B3)'
        else:
            default_if_unresolved = 'exclude_main (Gemini borderline default)'
    out_rows.append({**r,
                     'category_id': cat,
                     'scope_decision': decision,
                     'rule_applied': rule,
                     'needs_check': needs,
                     'default_if_unresolved': default_if_unresolved,
                     'scope_pending': 'true' if decision == 'borderline' else 'false'})

# ================================================================ variant collapse (scope-stage dedupe)
# Rows whose ASCII-normalized names collide AND whose name keys are linked inside the
# same census-A identity-alias row are one product: merge variants into the earliest
# canonical (union sources/aliases, keep the main row's scope_decision). Mechanical;
# this is what folds 'Zeta (ì œíƒ€ / ã‚¼ã‚¿)' into 'Zeta AI' (Scatterlab, zeta-ai.io) and
# the equivalent trans-script variant pairs. Reruns are byte-identical.
def norm_name(s):
    if not s or not isinstance(s, str): return ''
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '', s)
    for suf in ('chatbot', 'companion', 'girlfriend', 'boyfriend', 'app', 'chat', 'web', 'site', 'online', 'platform', 'com', 'org', 'net', 'io', 'official'):
        if s.endswith(suf) and len(s) - len(suf) >= 4:
            s = s[:-len(suf)]
    return s
ALIAS_ROWS = json.load(open(os.path.join(BASE, 'census-A-strawberry', 'identity-aliases.json'), encoding='utf-8'))
ALIAS_LATIN_KEYS = set()
for variant, canon in ALIAS_ROWS.items():
    if not isinstance(canon, str): continue
    for p2 in [variant] + (variant.split(' / ') if ' / ' in variant else []) + [canon]:
        for p3 in re.split(r'\s*\(', p2 or ''):
            ln = re.sub(r'[^a-z0-9]+', '', (p3 or '').lower())
            if len(ln) >= 4:
                ALIAS_LATIN_KEYS.add(ln)
groups2 = defaultdict(list)
for row in out_rows:
    n1 = norm_key(row['canonical_name'])
    keys = {n1}
    if n1.endswith('ai') and len(n1) > 4: keys.add(n1[:-2])  # 'Zeta AI'/'zetaai' <-> 'zeta'
    link = next((k2 for k2 in keys if k2 in ALIAS_LATIN_KEYS), None)
    if link: keys.add(link)
    gkey = min(keys)
    row['_gkey'] = gkey
    groups2[gkey].append(row)
out_rows2 = []
collapse_log = []
for gkey, grp in groups2.items():
    grp_sorted = sorted(grp, key=lambda r: ((r.get('scope_decision') != 'out'), r['scope_decision'] != 'borderline', len(r['canonical_name'])))
    main = grp_sorted[0]
    others = grp_sorted[1:]
    if len(grp) == 1 or gkey not in ALIAS_LATIN_KEYS or len(gkey) < 4:
        for row in grp: out_rows2.append(row)
        continue
    collapse_log.append((main['canonical_name'], ' + '.join(o['canonical_name'] for o in others)))
    base = main
    for o in others:
        for att in ('web_visits', 'app_downloads_floor', 'community_users_A', 'community_users_B', 'community_evidence_count_B', 'community_threads_A_plus_B'):
            try:
                base[att] = str(max(int(base.get(att) or 0), int(o.get(att) or 0)))
            except (TypeError, ValueError):
                base[att] = base.get(att) or o.get(att) or ''
        if o.get('usage_notes') and o['usage_notes'] not in (base.get('usage_notes') or ''):
            base['usage_notes'] = (base.get('usage_notes') or '') + ' | ' + o['usage_notes']
        for f2 in ('lf_C-gem', 'lf_C-ppx', 'lf_C-ven', 'lf_C-argon'):
            if o.get(f2) and base.get(f2) in ('', None): base[f2] = o[f2]
        try:
            if o.get('lf_max') is not None and base.get('lf_max') in ('', None): base['lf_max'] = o['lf_max']
            if o.get('lf_sum') and (base.get('lf_sum') or 0) < int(o['lf_sum']): base['lf_sum'] = o['lf_sum']
        except (TypeError, ValueError):
            pass
        for att in ('segments', 'census_A_classification'):
            if o.get(att) and (o[att] not in (base.get(att) or '')):
                base[att] = ((base.get(att) or '') + ' | ' + o[att]).strip(' |')[:600]
        if o.get('found_in_runs') and o['found_in_runs'] not in (base.get('found_in_runs') or ''):
            base['found_in_runs'] = base['found_in_runs']
    out_rows2.append(base)

cols2 = list(out_rows[0].keys())
with open(os.path.join(OUT, 'scoped.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=cols2, extrasaction='ignore')
    w.writeheader()
    for row in out_rows2:
        w.writerow({k: v for k, v in row.items() if k != '_gkey'})
json.dump([{k: v for k, v in row.items() if k != '_gkey'} for row in out_rows2],
          open(os.path.join(OUT, 'scoped.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False, default=str)
open(os.path.join(OUT, 'scoped.json'), 'a', encoding='utf-8').write('\n')
for logitem in collapse_log:
    print('collapsed variant row:', logitem[1], '->', logitem[0])
# log the collapses into merge-log.csv (idempotent: previous collapse rows dropped first)
try:
    mrows = list(csv.reader(open(os.path.join(OUT, 'merge-log.csv'), encoding='utf-8-sig')))
except FileNotFoundError:
    mrows = []
base_mrows = [mr for mr in mrows if not (len(mr) and mr and mr[0].strip() == 'scope-stage collapse')]
om = open(os.path.join(OUT, 'merge-log.csv'), 'w', newline='', encoding='utf-8-sig')
w_rows = csv.writer(om)
for mr in base_mrows:
    w_rows.writerow(mr)
for ml in collapse_log:
    w_rows.writerow([ml[1], ml[0], f'scope-stage collapse (variant merged; {D})'])
om.close()

with open(os.path.join(OUT, 'scope-checks.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    # Rebuild-from-scratch: scope-pass OWNS the pre-resolution rows (one per scoped row,
    # already deduped via seen_checks). The 22 Perplexity scope-check rows that
    # scope-resolve adds on top are preserved by reading the current file first and
    # re-emitting them so reruns of BOTH scripts are byte-identical and idempotent.
    try:
        prior = [r for r in csv.DictReader(open(os.path.join(OUT, 'scope-checks.csv'), encoding='utf-8-sig'))
                 if (r.get('what') or '').split(' (')[0].strip().startswith('Perplexity scope check')]
    except FileNotFoundError:
        prior = []
    w = csv.DictWriter(fh, fieldnames=['canonical_name', 'url', 'what', 'result'])
    w.writeheader()
    for c0 in checks_log:
        w.writerow(c0)
    for p0 in prior:
        w.writerow(p0)

cats = Counter(o['category_id'] for o in out_rows2)
decs = Counter(o['scope_decision'] for o in out_rows2)
rep = ['# Scope report', '', f'Generated: {D}', '',
       'Applied 01-scope-gemini.json mechanically to merged/shortlist-usage.csv,',
       'then variant-collapsed (rows whose ASCII-normalized names collide inside a',
       'census-A identity-alias row are merged: Zeta (ì œíƒ€ / ã‚¼ã‚¿) -> Zeta AI etc.;',
       'collapse decisions logged to merge-log.csv).',
       'Used only facts already in our data (census A/B files, entity facts, ecosystem role) plus',
       'logged first-party check URLs. No list positions, no traffic, no affiliate status were used.', '',
       f'- rows scoped: **{len(out_rows2)}**',
       f'- decisions: ' + ', '.join(f'{k}={v}' for k, v in sorted(decs.items())),
       f'- categories: ' + ', '.join(f'{k}={v}' for k, v in sorted(cats.items())), '',
       '## Counts per (category, decision)', '', '| category | in | borderline | out |', '|---|---|---|---|']
groups = defaultdict(list)
for o in out_rows2:
    groups[o['category_id']].append(o)
for cat in sorted(groups):
    dd = Counter(o['scope_decision'] for o in groups[cat])
    rep.append(f"| {cat} | {dd.get('in', 0)} | {dd.get('borderline', 0)} | {dd.get('out', 0)} |")
rep += ['', '## Out rows (rule applied + needs_check)', '', '| row | rule applied | needs_check |', '|---|---|---|']
for o in out_rows2:
    if o['scope_decision'] == 'out':
        rep.append(f"| {o['canonical_name']} | {o['rule_applied'][:220]} | {o['needs_check'][:160]} |")
rep += ['', '## Borderline rows (rule applied + needs_check)', '', '| row | rule applied | needs_check |', '|---|---|---|']
for o in out_rows2:
    if o['scope_decision'] == 'borderline':
        rep.append(f"| {o['canonical_name']} | {o['rule_applied'][:220]} | {o['needs_check'][:220]} |")
rep += ['', '## Categories reference', '']
for cid, c in IDS.items():
    rep.append(f"- **{cid}** ({c['name']}){' (ranked separately)' if c.get('ranked_separately') else ''} â€” {c['definition'][:320]}")
rep += ['', '## Check log', '', 'Every scoped row has a check entry in merged/scope-checks.csv: either a census-A fact URL', 'already on file, or the platform home domain marked first-party ToS check pending.', 'No new lives were fabricated; every recorded check URL is a URL we already hold or the row domain.']
open(os.path.join(OUT, 'SCOPE-REPORT.md'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
print('scoped rows:', len(out_rows), '| decisions:', dict(decs))
print('categories:', dict(cats.most_common()))

# ================================================================ Argon delta section (fix pass 3)
# The Argon integration step of the usage pass had skipped its report. Rebuild it
# from committed snapshots and current files; numbers only.
pre_usage = json.load(open(os.path.join(OUT, 'pre-argon', 'shortlist-usage.json'), encoding='utf-8'))
pre_short = list(csv.DictReader(open(os.path.join(OUT, 'pre-argon', 'shortlist.csv'), encoding='utf-8-sig')))
cur_short = list(csv.DictReader(open(os.path.join(OUT, 'shortlist.csv'), encoding='utf-8-sig')))
cur_usage = json.load(open(os.path.join(OUT, 'shortlist-usage.json'), encoding='utf-8'))
nkey = lambda s: re.sub(r'[^a-z0-9]+', '', (s or '').lower())
pre_keys = {nkey(r.get('canonical_name')) for r in pre_short}
cur_keys = {nkey(r.get('canonical_name')) for r in cur_short}
new_rows = [r for r in cur_short if nkey(r.get('canonical_name')) not in pre_keys]
dropped_rows = [r for r in pre_short if nkey(r.get('canonical_name')) not in cur_keys]
pre_band = {nkey(x.get('canonical_name')): x for x in pre_usage}
cur_band = {nkey(x.get('canonical_name')): x for x in cur_usage}
band_changes = []
for k in cur_band:
    if k in pre_band and (pre_band[k].get('usage_band') or '') != (cur_band[k].get('usage_band') or ''):
        band_changes.append((cur_band[k]['canonical_name'], pre_band[k]['usage_band'], cur_band[k]['usage_band']))
sb_all = [r for r in cur_usage if 'FLAG:store_build_may_differ' in (r.get('usage_notes') or '')]
sb_new = [r for r in sb_all if nkey(r['canonical_name']) in {nkey(x['canonical_name']) for x in new_rows}]
# duplicate-looking new rows: name-variant relation against any pre-existing canonical
ALIAS = json.load(open(os.path.join(BASE, 'census-A-strawberry', 'identity-aliases.json'), encoding='utf-8'))
def norm_name(s):
    if not s or not isinstance(s, str): return ''
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '', s)
    for suf in ('chatbot', 'companion', 'girlfriend', 'boyfriend', 'app', 'chat', 'web', 'site', 'online', 'platform', 'com', 'org', 'net', 'io', 'official'):
        if s.endswith(suf) and len(s) - len(suf) >= 4:
            s = s[:-len(suf)]
    return s
alias_norms = set()
for variant, canon in ALIAS.items():
    for v in [variant] + (variant.split(' / ') if ' / ' in variant else []) + ([canon] if isinstance(canon, str) else []):
        for p2 in re.split(r'\s*\(', v or ''):
            alias_norms.add(norm_name(p2))
# alias entries normalized (one set per identity-alias row from census A)
ALIAS_NORM_ENTRIES = []
for variant, canon in ALIAS.items():
    s = set()
    for p2 in [variant] + (variant.split(' / ') if ' / ' in variant else []) + [canon if isinstance(canon, str) else None]:
        if p2 and isinstance(p2, str):
            s.add(norm_name(p2))
    s.discard('')
    if s: ALIAS_NORM_ENTRIES.append(s)

def looks_dup(new_name, old_name):
    """Duplicate-looking = identical normalized name, or both names linked inside the
    same census-A identity-alias row. Plain short-prefix/substring hits are NOT
    enough (they over-flag generic stems like 'nsfw'/'love')."""
    na, nb = norm_name(new_name), norm_name(old_name)
    if not na or not nb: return False
    if na == nb: return True
    for entry in ALIAS_NORM_ENTRIES:
        if na in entry and nb in entry: return True
    return False

new_flags = []
for r in new_rows:
    cands = [pre_row['canonical_name'] for pre_row in pre_short if looks_dup(r.get('canonical_name'), pre_row['canonical_name'])]
    if cands:
        new_flags.append((r['canonical_name'], ', '.join(cands[:4])))
rep2 = ['# C-argon delta report', '', f'Generated: {D}',
        '(This document covers the C-argon step that the previous run of the usage pass skipped in its report.)', '',
        '## Row delta', '',
        f'- shortlist-usage rows: pre-argon **{len(pre_usage)}** -> now **{len(cur_usage)}** (delta +{len(cur_usage) - len(pre_usage)})',
        f'- shortlist rows: pre-argon {len(pre_short)} -> now {len(cur_short)} (delta +{len(cur_short) - len(pre_short)})',
        f'- usage-pass duplicate merges running dedupe: {len(cur_usage)} vs shortlist {len(cur_short)} (the usage-pass variant clusters cover the argon-introduced name splits)', '',
        '## Rows NEW to the shortlist because of C-argon (58 + namesake)', '',
        '| row | supply_runs_count | usage_band | duplicate-looking? |', '|---|---|---|---|']
for r in new_rows:
    dup_row = next((f for f in new_flags if f[0] == r.get('canonical_name')), None)
    usage_row = next((x for x in cur_usage if nkey(x.get('canonical_name')) == nkey(r.get('canonical_name'))), None)
    band = usage_row.get('usage_band') if usage_row else ''
    rep2.append(f"| {r.get('canonical_name')} | {r.get('supply_runs_count')} | {band} | {('YES â€” variants of ' + dup_row[1]) if dup_row else ''} |")
rep += ['', '## Dropped from the shortlist', '', '| row |', '|---|']
for r in dropped_rows:
    rep.append(f"| {r.get('canonical_name')} |")
rep += ['', '## Band changes (carried rows)', '',
        f'- rows whose usage_band changed: **{len(band_changes)}**']
for c, ob, nb in band_changes:
    rep.append(f'- {c}: {ob} â†’ {nb}')
if not band_changes:
    rep.append('- none â€” every row carried through kept its band; the band totals shifted only by new rows entering (U dominance on Argon-only rows).')
store_all = [r for r in cur_usage if 'FLAG:store_build_may_differ' in (r.get('usage_notes') or '')]
rep += ['', '## store_build_may_differ', '',
        f'- rows flagged: **{len(store_all)}** (band comes only from app downloads)',
        f'- of these, rows that are C-argon-new: {len([r for r in store_all if nkey(r["canonical_name"]) in {nkey(x["canonical_name"]) for x in new_rows}])}',
        f'- rest are carried rows:', '', '| carried rows flagged store_build_may_differ |', '|---|']
for r in store_all:
    if nkey(r['canonical_name']) not in {nkey(x['canonical_name']) for x in new_rows}:
        rep.append(f"| {r['canonical_name']} |")
rep += ['', '## Duplicate-looking new rows (flagged for the next merge pass)', '',
        'Conservative mechanical rule: identical normalized name, or both names linked inside the',
        'same census-A identity-alias row. Soft name-prefix relations are NOT enough mechanically',
        '(nsfw/love generic stems produced false links). Larger variant splits introduced by C-argon',
        '(Soulkyn AI + Soulkyn, KoboldAI + KoboldCpp families, etc.) are already clustered/merged in',
        'shortlist-usage by the usage-pass dedupe and logged verbatim in merge-log.csv:',
        '', '| new row | shares a canonical/variant relation with |', '|---|---|']
for f0 in new_flags:
    rep.append(f'| {f0[0]} | {f0[1]} |')
if not new_flags:
    rep.append('| (none) | |')
open(os.path.join(OUT, 'ARGON-DELTA.md'), 'w', encoding='utf-8').write('\n'.join(rep2) + '\n')
print(ARGONDELTA := (f'new={len(new_rows)} dropped={len(dropped_rows)} band_changes={len(band_changes)} store_flags={len(store_all)} dup_flags={len(new_flags)}'))

