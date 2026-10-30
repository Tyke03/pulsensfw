# -*- coding: utf-8 -*-
"""Merge all census runs for 2026-10-27-ai-companions into one candidate table.

No ranking, no quality judgement, no invented names. Every row traces to an input file.
Inputs: census A (Strawberry community), census B (Gemini community), census C
supply runs (gemini / perplexity / venice+deep-search-addendum, mixed JSON/markdown).
Run:  python merge-census.py   (from this directory)
"""
import json, os, re, sys, csv, codecs
from urllib.parse import urlparse
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
os.makedirs(OUT, exist_ok=True)

D = '2026-10-29'
RUNS = ['A', 'B', 'C-gem', 'C-ppx', 'C-ven', 'C-argon']
C_RUNS = ['C-gem', 'C-ppx', 'C-ven', 'C-argon']
CATP = 'C-argon'
parse_failures = []

# ================================================================ inputs
A = json.load(open(os.path.join(BASE, 'census-A-strawberry', 'nsfw-ai-platform-census.json'), encoding='utf-8'))
A_cands = A['candidates']
A_adjacent = A.get('adjacent_entities', [])
ALIASES = json.load(open(os.path.join(BASE, 'census-A-strawberry', 'identity-aliases.json'), encoding='utf-8'))
B = json.load(open(os.path.join(BASE, 'census-B-gemini.json'), encoding='utf-8'))
B_cands = B['candidates']

def strip_fences(s):
    return s

def parse_c_run(text):
    """Return (obj, mode, notes). Tolerant: whole-file JSON, then every
    platforms-bearing top-level object (markdown context), then a JSON-ish
    bracket scanner for tokenizer-mangled exports. Handles PDF text layers
    (C-argon: \\f page breaks + wrapped whitespace inside/around tokens)."""
    if '\f' in text:
        # PDF text layer: page breaks + spurious whitespace around/inside tokens
        text = re.sub(r'\s+', ' ', text.replace('\f', ''))
    # 1) whole file is a JSON document
    try:
        return json.loads(text), 'whole-file JSON (whitespace-collapsed PDF text)', []
    except json.JSONDecodeError:
        pass
    # 2) embedded JSON objects (one or several) in the markdown report
    dec = json.JSONDecoder()
    platforms, sources, notes, i = [], [], [], 0
    while True:
        b = text.find('{', i)
        if b == -1: break
        try:
            obj, end = dec.raw_decode(text, b)
        except json.JSONDecodeError:
            i = b + 1
            continue
        i = end
        if not isinstance(obj, dict):
            continue
        got = obj.get('platforms')
        if isinstance(got, list) and got:
            platforms.extend(got)
            notes.append(f'object at {b}: {len(got)} platforms')
            # keep any sibling keys of the merged object
            tail = {k: v for k, v in obj.items() if k != 'platforms'}
        elif isinstance(obj.get('sources'), list):
            sources.extend(obj['sources'] if all(isinstance(x, dict) for x in obj['sources']) else [])
    if platforms:
        merged = {'platforms': platforms, 'sources': sources}
        if notes: merged['parse_notes'] = notes
        return merged, 'embedded objects merged', notes
    # 3) bracket scanner over tokenizer-cleaned text (perplexity-style $$ / \\[ mangling)
    cl = clean_tokenizer_mangling(text)
    platforms, sources, fails = [], [], []
    for chunk in slice_objects(cl, r'"name"\s*:\s*"'):
        try:
            platforms.append(json.loads(chunk))
        except json.JSONDecodeError as e:
            fails.append(f'platform chunk near "{chunk[:60]}...": {e}')
    for chunk in slice_objects(cl, r'"url"\s*:\s*"'):
        try:
            sources.append(json.loads(chunk))
        except json.JSONDecodeError:
            fails.append('source chunk')
    notes = fails[:6] or []
    if not platforms:
        raise ValueError('no platforms recoverable')
    merged = {'platforms': platforms, 'sources': sources}
    if notes: merged['parse_failures'] = fails
    return merged, 'JSON-ish bracket scanner (tokenizer-mangled export)', notes

def clean_tokenizer_mangling(x):
    """Perplexity-style export: \\[, \\] escapes; $$ for structural brackets; markdown links."""
    x = x.replace('\\[', '[').replace('\\]', ']')
    x = x.replace('\\&', '&')
    def repl(mm):
        i, j = mm.start(), mm.end()
        k = i - 1
        while k >= 0 and x[k] in ' \n\r\t': k -= 1
        last = x[k] if k >= 0 else ''
        p = j
        while p < len(x) and x[p] in ' \n\r\t': p += 1
        first = x[p] if p < len(x) else ''
        if last == '}': return ']'
        if last == '"': return ']'
        if last == ':': return '['
        if first == '{': return '['
        return ''
    x = re.sub(r'\$\$', repl, x)
    x = re.sub(r'\[([^\[\]]{0,300}?)\]\((https?://[^)\s]{1,400})\)', r'\2', x)
    return x

def slice_objects(text, start_pat, max_chunk=40000):
    """Yield balanced-brace JSON object slices whose `{` sits just before the match."""
    for sm in re.finditer(start_pat, text):
        i = text.rfind('{', max(0, sm.start()-14), sm.start()+2)
        if i == -1:
            continue
        depth = 0; in_str = False; esc = False
        for j in range(i, min(len(text), i + max_chunk)):
            ch = text[j]
            if esc: esc = False; continue
            if ch == '\\': esc = True; continue
            if ch == '"': in_str = not in_str; continue
            if in_str: continue
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    yield text[i:j+1]
                    break

# ================================================================ name utils
SUFFIXES = ['chatbot', 'companion', 'girlfriend', 'boyfriend', 'app', 'chat', 'web', 'site', 'online', 'platform', 'com', 'org', 'net', 'io', 'official', 'roleplay', 'rp']

def norm_name(s):
    if not s or not isinstance(s, str): return ''
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '', s)
    for suf in SUFFIXES:
        if s.endswith(suf) and len(s) - len(suf) >= 4:
            s = s[:-len(suf)]
    return s

def domain_of(url):
    if not url or not isinstance(url, str): return None
    u = url.strip()
    if not u.lower().startswith('http'): u = 'https://' + u
    try:
        nl = urlparse(u).netloc.lower()
    except Exception:
        return None
    if nl.startswith('www.'): nl = nl[4:]
    return nl or None

def reg_domain(d):
    if not d: return None
    parts = d.split('.')
    return '.'.join(parts[-2:])

def norm_url(u):
    if not u or not isinstance(u, str): return None
    u = u.strip().lower()
    u = re.sub(r'^https?://', '', u)
    u = u.rstrip('/')
    return u or None

# identity-alias table from census A (variant -> canonical)
alias_map = {}
for variant, canon in ALIASES.items():
    pieces = variant.split(' / ') if ' / ' in variant else [variant]
    for v in pieces + ([variant] if ' / ' in variant else [variant]):
        v = v.strip()
        if not v: continue
        if v not in pieces and ' / ' in v: continue
        if not isinstance(canon, str) or not canon: continue
        # entries like "WHIF: Romance & BL AI Chat" -> drop the description part
        v = re.split(r'\s*[|:]\s', v)[0] if len(v) > 32 else v.split(' | ')[0]
        n = norm_name(v)
        if len(n) >= 2: alias_map[n] = canon


C_files = {
    'C-gem': ('gemini-nsfw-ai-platform-census.txt', 'census-C-gemini.json'),
    'C-ppx': ('perplexity-nsfw-ai-platform-census.txt', 'census-C-perplexity.json'),
    'C-ven': ('venice-nsfw-ai-platform-census+deep-search-addendum.txt', 'census-C-venice.json'),
    'C-argon': ('argon-census.txt', 'census-C-argon.json'),
}
# The Argon run is a PDF extract (pdftotext unavailable here; pypdf used).
# argon-census.txt is the committed pypdf text layer of "AI Companion Platform
# Supply Census.pdf". URL strings carry PDF line-break spaces that are repaired
# after parse (see below).

C = {}
C_parse_mode = {}
C_intradup = {}
for run, (txt, outname) in sorted(C_files.items()):
    path_for = os.path.join(BASE, txt) if run == 'C-argon' else os.path.join(BASE, 'full_census_txt', txt)
    text = open(path_for, encoding='utf-8', errors='replace').read()
    obj, mode, notes = parse_c_run(text)
    # C-argon PDF artifact: URL strings carry line-break spaces from the text layer
    if run == 'C-argon':
        fixed_urls = 0
        for p in obj.get('platforms') or []:
            for k2, arr in (('listed_in', p.get('listed_in')),):
                out_arr = []
                for u in (arr or []):
                    if isinstance(u, str) and ' ' in u:
                        u2 = re.sub(r'\s+', '', u)
                        if u2 != u: fixed_urls += 1
                        u = u2
                    out_arr.append(u)
                p[k2] = out_arr
        if fixed_urls:
            notes.append(f'repaired {fixed_urls} URL strings with PDF line-break spaces')
    C[run] = obj
    C_parse_mode[run] = mode
    # log any per-run parse failures recorded inside the parse notes
    for note in notes:
        parse_failures.append({'run': run, 'file': txt, 'issue': note[:240], 'detail': mode})
    # intra-run dedupe: same normalized name+domain repeated across sequential objects
    seen = {}
    uniq = []
    dups = 0
    for c in obj.get('platforms') or []:
        key = (norm_name(c.get('name') or ''), reg_domain(domain_of(c.get('url'))))
        if key in seen and key != ('', None):
            dups += 1
            prior = uniq[seen[key]]
            for u in c.get('listed_in') or []:
                if isinstance(u, str) and u not in prior.get('listed_in', []):
                    prior.setdefault('listed_in', []).append(u)
            for k2 in ('sources',):
                for u in (c.get(k2) or []):
                    if isinstance(u, str) and u not in prior.get(k2, []):
                        prior.setdefault(k2, []).append(u)
            # list_frequency: take max within run
            for k2 in ('list_frequency',):
                try:
                    if c.get(k2) is not None and (prior.get(k2) in (None, '') or int(c.get(k2)) > int(prior.get(k2))):
                        prior[k2] = c.get(k2)
                except (TypeError, ValueError):
                    pass
            continue
        seen[key] = len(uniq)
        uniq.append(c)
    C_intradup[run] = dups
    obj['platforms'] = uniq
    dest = os.path.join(BASE, outname)
    json.dump(obj, open(dest, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    open(dest, 'a', encoding='utf-8').write('\n')
    print(f'{run}: {mode}; platforms={len(uniq)} (intra-run dups merged: {dups}) -> {outname}')

# ================================================================ entity resolution
canonicals = {}   # canonical display name -> record
by_norm = {}      # normalized name -> canonical
by_domreg = {}    # registrable domain -> canonical
merge_log = []    # (variant, canonical, reason)
unresolved = []   # {variant, run, issue}
domain_conflicts = []

def resolve_name_key_candidates(display):
    """Names arrive with glosses/variants baked in ('Rofan AI (로판)', 'Caveduck (케이브덕)',
    'X / Y'). Produce norm keys to try, base name first. Names whose norm is shorter
    than 3 chars (pure 'AI'/punctuation shells) are not matchable — too collision-prone.
    An ASCII-only key is also tried so 'メローズ (mellows)' can meet 'mellows'."""
    keys, seen = [], set()
    base = re.split(r'\s*\(', display)[0].strip()
    pieces = [display.strip(), base] + [p.strip() for p in display.split(' / ')]
    for p in pieces:
        n = norm_name(p)
        if len(n) >= 3 and n not in seen:
            seen.add(n)
            keys.append(n)
    a = re.sub(r'[^a-z0-9]+', '', display.lower())
    if len(a) >= 3 and a not in seen and re.search(r'[a-z]', display.lower()):
        seen.add(a); keys.append(a)
    return keys

def display_ok(name):
    return isinstance(name, str) and name.strip()

def resolve_and_register(display, url, run, payload=None):
    if not display_ok(display):
        unresolved.append({'variant': '', 'run': run, 'issue': 'empty/invalid name', 'payload_url': url})
        return None
    display = display.strip()
    dom = domain_of(url)
    rd = reg_domain(dom) if dom else None
    canon = None
    reason = None
    key_candidates = resolve_name_key_candidates(display)
    def cand_in_c(cn):
        r2 = canonicals.get(cn)
        return bool(r2 and any(r.startswith('C-') for r in r2['runs']))
    # 1) identity-alias table (census A identity resolution) — merges regardless of
    #    domain; A/B urls are often discovery/thread pages, not homepages. Any
    #    domain difference is recorded as a variance note on the canonical.
    for k in key_candidates:
        if k in alias_map:
            cand = alias_map[k]
            if cand in canonicals:
                canon, reason = cand, 'alias-table (census-A identity resolution)'
                break
    # 2) normalized-name equality (works across passes; keeps one canonical per name)
    if canon is None:
        for k in key_candidates:
            if k in by_norm:
                canon, reason = by_norm[k], f'normalized-name {k}'
                break
    # 3) exact registrable-domain equality, only when the name also matches
    if canon is None and rd and rd in by_domreg:
        cand = by_domreg[rd]
        if any(norm_name(cand) == k for k in key_candidates):
            canon, reason = cand, f'domain {rd} + same name'
    # 4) brand-new canonical (registry key = the primary, shortest-safe norm key)
    new_canon = canon or display
    if canon is None:
        canon, reason = new_canon, 'new canonical'
    rec = canonicals.setdefault(new_canon, {
        'names': Counter(), 'domains': Counter(), 'reg_domain': Counter(),
        'runs': {}, 'a_cands': [], 'b_cands': [], 'c_dom': None, 'domain_variants': Counter(),
    })
    for k in key_candidates:
        by_norm.setdefault(k, new_canon)
    # C runs carry product-homepage urls; first C registration pins the home domain
    if run.startswith('C-') and rd and rec['c_dom'] is None:
        rec['c_dom'] = rd
        by_domreg.setdefault(rd, new_canon)
    if reason:
        merge_log.append((display, new_canon, reason))
    # domain variance accounting (never a split by itself)
    if rd and rec['c_dom'] and rd != rec['c_dom']:
        rec['domain_variants'][rd] += 1
        if rec['domain_variants'][rd] <= 2:
            merge_log.append((display, new_canon, f'domain variant {rd} (canonical home {rec["c_dom"]})'))
    rec['names'][display] += 1
    if dom: rec['domains'][dom] += 1
    if rd: rec['reg_domain'][rd] += 1
    if payload:
        cur = rec['runs'].setdefault(run, {})
        for k, v in payload.items():
            if v in (None, '', [], {}):
                continue
            if isinstance(v, list):
                cur.setdefault(k, [])
                for item in v:
                    if item and item not in cur[k]:
                        cur[k].append(item)
            elif k not in cur:
                cur[k] = v
    return new_canon

# ================================================================ register C first
c_row_index = {r: defaultdict(list) for r in C_RUNS}
for run in C_RUNS:
    for c in C[run].get('platforms') or []:
        canon = resolve_and_register(c.get('name'), c.get('url'), run, {
            'url': c.get('url'),
            'ecosystem_role': c.get('ecosystem_role'),
            'list_frequency': c.get('list_frequency'),
            'usage_signal': c.get('usage_signal'),
            'listed_in': c.get('listed_in') or [],
            'segments': (c.get('segments') or []) if isinstance(c.get('segments'), list) else [(c.get('segment') or '')] if c.get('segment') else [],
            'language': c.get('language'),
            'description': c.get('description') or c.get('notes'),
        })
        if canon:
            c_row_index[run][canon].append(c)
            # C usage_signal rows that carry a listed_in dictionary under another key
            for key in ('listed_in_dict', 'listed_in_by_source', 'listed_in_sources'):
                if isinstance(c.get(key), dict):
                    c_row_index[canon][run][-1][key] = c.get(key)

# ---- census A
a_row_index = defaultdict(list)
for c in A_cands:
    canon = resolve_and_register(c.get('name'), c.get('url'), 'A', {
        'scope_status': c.get('scope_status'),
        'classification': c.get('census_classification'),
        'service_type': c.get('service_type'),
        'segment': c.get('segment'),
        'reported_segments': c.get('reported_segments') or [],
    })
    if canon: a_row_index[canon].append(c)
for c in A_adjacent:
    # adjacent entities register only for resolution context (kept out of main rows)
    resolve_and_register(c.get('name'), c.get('url'), 'A', {
        'classification': 'census-A adjacent entity',
        'service_type': c.get('service_type'),
        'segment': c.get('segment'),
        'reported_segments': c.get('reported_segments') or [],
    })

# ---- census B
b_row_index = defaultdict(list)
for c in B_cands:
    canon = resolve_and_register(c.get('name'), c.get('url'), 'B', {
        'segment': c.get('segment'),
        'qualified_flag_B': c.get('qualified'),
        'praise': c.get('praise') or [],
        'complaints': [(x.get('text') if isinstance(x, dict) else x) for x in (c.get('complaints') or [])],
    })
    if canon: b_row_index[canon].append(c)

def a_threads(rec):
    return list({e.get('url') for e in (rec.get('evidence') or []) if e.get('url') and e.get('eligible_for_mention_count')})

def b_threads(c):
    return list({e.get('url') for e in (c.get('evidence') or []) if e.get('url')})

A_canon_index = {}
for canon, lst in a_row_index.items():
    A_canon_index[canon] = lst
B_canon_index = dict(b_row_index)

# ================================================================ compose rows
def pick_display(canon_name, rec):
    names = rec['names']
    if len(names) == 1:
        return list(names)[0]
    # majority: most-seen display, ties -> longest string with letters
    return sorted(names.items(), key=lambda kv: (-kv[1], -len(kv[0])))[0][0]

def pick_domain(rec):
    # canonical home domain from a C run first — supply runs carry product urls
    if rec.get('c_dom'):
        return rec['c_dom']
    if rec['domains']:
        return rec['domains'].most_common(1)[0][0]
    for run in C_RUNS + ['B']:
        rrec = rec['runs'].get(run) or {}
        dom = domain_of(rrec.get('url'))
        if dom: return dom
    return None

def ecosystem_vote(rec):
    votes = []
    runs_providing = []
    for run in C_RUNS:
        role = (rec['runs'].get(run) or {}).get('ecosystem_role')
        if role:
            votes.append((run, str(role).strip().lower()))
            runs_providing.append(run)
    result = ''; conflict = False
    if votes:
        counts = Counter(v for _, v in votes)
        result = counts.most_common(1)[0][0]
        conflict = len(counts) > 1
    return result, conflict, runs_providing

def frontend_flag(rec):
    """Frontend/local-tool = census A classifies it so, or a C run's ecosystem_role says so."""
    return None  # replaced by inline computation in the row loop

rows = []
excluded_adjacent_only = []
for canon_name, rec in canonicals.items():
    a_list = rec.get('a_rec') or a_row_index.get(canon_name, [])
    runs = rec['runs']
    found = [run for run in RUNS if run in rec['runs']]
    supply_runs = [run for run in C_RUNS if run in rec['runs']]
    ar = runs.get('A') or {}
    br = runs.get('B') or {}
    a_cands_of = a_row_index.get(canon_name, [])
    b_cands_of = b_row_index.get(canon_name, [])
    # census-A adjacent entities (models/directories/incidentals) are not platforms:
    # census-A adjacent entities (models/directories/incidentals) are not platforms:
    # exclude only when no other run surfaced the same canonical
    if found == ['A'] and not a_cands_of and not b_cands_of:
        cls = (runs.get('A') or {}).get('classification')
        if cls == 'census-A adjacent entity':
            excluded_adjacent_only.append(canon_name)
            continue
    # A community
    a_meets_3 = any(x.get('meets_3_link_bar') for x in a_cands_of)
    a_user_max = max([int(x.get('distinct_users') or 0) for x in a_cands_of] or [0])
    a_threads = set()
    for x in a_cands_of:
        for e in x.get('evidence') or []:
            if e.get('url') and e.get('eligible_for_mention_count'):
                a_threads.add(e['url'])
    # B community (b_cands_of holds the ORIGINAL B candidate dicts)
    b_qualified = any(x.get('qualified') for x in b_cands_of)
    b_user = max([int(x.get('distinct_users') or 0) for x in b_cands_of] or [0])
    b_threads = set()
    for x in b_cands_of:
        for e in x.get('evidence') or []:
            if isinstance(e, dict) and e.get('url'):
                b_threads.add(e['url'])
    threads_union = a_threads | b_threads
    qualified_recomputed = len(threads_union) >= 3
    # supply fields
    lf = {}
    srcs = set()
    for run in C_RUNS:
        for c in c_row_index[run].get(canon_name, []):
            v = c.get('list_frequency')
            if isinstance(v, (int, float)) or (isinstance(v, str) and v.strip().isdigit()):
                lf[run] = int(v) if not isinstance(v, int) else v
            for u in c.get('listed_in') or []:
                if isinstance(u, str) and u.strip():
                    srcs.add(norm_url(u))
    lf_vals = [lf[r] for r in C_RUNS if r in lf]
    lf_max = max(lf_vals) if lf_vals else None
    lf_sum = sum(lf_vals) if lf_vals else 0
    # usage_signal per run, side by side, never averaged
    us = {}
    for run in C_RUNS:
        for c in c_row_index[run].get(canon_name, []):
            sig = c.get('usage_signal')
            if isinstance(sig, dict) and any(sig.get(k) for k in ('web_visits', 'app_downloads', 'store_rating', 'rating_count', 'source')):
                us[run] = sig
    # ecosystem role
    role, role_conflict, role_runs = ecosystem_vote(rec)
    a_cls = {str(x.get('census_classification')) for x in a_cands_of}
    is_frontend = 'frontend_or_local_tool' in a_cls or bool(re.search(r'frontend|local', role or ''))
    # segments
    segs = set()
    for c in a_cands_of:
        if c.get('segment'): segs.add(str(c['segment']))
        for s in (c.get('reported_segments') or []):
            if s: segs.add(str(s))
    for c in b_cands_of:
        if c.get('segment'): segs.add(str(c['segment']))
    for run in C_RUNS:
        for c in c_row_index[run].get(canon_name, []):
            for s in (c.get('segments') or []):
                if s: segs.add(str(s))
            if c.get('segment'): segs.add(str(c['segment']))
    rows.append({
        'canonical_name': pick_display(canon_name, rec),
        'url_domain': pick_domain(rec) or '',
        'ecosystem_role': role,
        'ecosystem_role_conflict': 'yes' if role_conflict else ('' if role else 'no-votes'),
        'home_run': canon_name,
        'found_in_runs': ','.join(found),
        'supply_runs_count': len(supply_runs),
        'lf_C-gem': lf.get('C-gem'), 'lf_C-ppx': lf.get('C-ppx'), 'lf_C-ven': lf.get('C-ven'), 'lf_C-argon': lf.get('C-argon'),
        'lf_max': lf_max, 'lf_sum': lf_sum,
        'unique_source_list_count': len(srcs),
        'usage_signal': us,
        'community_users_A': a_user_max or None,
        'community_users_B': b_user or None,
        'community_evidence_count_B': len(b_threads),
        'community_threads_A_plus_B': len(threads_union),
        'qualified_recomputed': qualified_recomputed,
        'qualified_A_strawberry': a_meets_3,
        'qualified_B_gemini': b_qualified,
        'segments': ' | '.join(sorted(segs))[:400] or '',
        'frontend_flag': 'yes' if is_frontend else '',
        'census_A_classification': '; '.join(sorted({str(x.get('scope_status')) for x in a_cands_of}))[:300],
    })

# post-check: canonical names that normalize to the same key but did NOT merge
# (CJK/gloss mismatches the safe aliasing left separate) -> log, keep separate
norm_group = defaultdict(list)
for canon_name in canonicals:
    for k in resolve_name_key_candidates(canon_name):
        norm_group[k].append(canon_name)
for k, group in norm_group.items():
    if len(group) > 1 and k:
        unresolved.append({'variant': ' + '.join(group), 'run': 'post-check',
                           'issue': f'distinct canonicals share normalized key "{k}"; kept separate (unsure merge; likely same product with a trans-language gloss)'})

# ================================================================ CSV/JSON out
def write_csv(path, cols, rows_out):
    with open(path, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for row in rows_out:
            w.writerow({k: row.get(k, '') for k in cols})

rows.sort(key=lambda r: (-(r['lf_max'] or 0), -(r['community_users_A'] or 0), r['canonical_name']))
CANON_COLS = ['canonical_name', 'url_domain', 'ecosystem_role', 'ecosystem_role_conflict', 'found_in_runs', 'supply_runs_count',
              'lf_C-gem', 'lf_C-ppx', 'lf_C-ven', 'lf_C-argon', 'lf_max', 'lf_sum', 'unique_source_list_count',
              'usage_signal_json', 'community_users_A', 'community_users_B', 'community_evidence_count_B',
              'community_threads_A_plus_B', 'qualified_recomputed', 'qualified_A_strawberry', 'qualified_B_gemini',
              'segments', 'frontend_flag', 'census_A_classification']
for row in rows:
    row['usage_signal_json'] = json.dumps(row['usage_signal'], ensure_ascii=False) if row['usage_signal'] else ''
write_csv(os.path.join(OUT, 'candidates.csv'), CANON_COLS, rows)
json.dump({'generated': D, 'inputs_note': 'one row per canonical platform; no ranking; no invented names',
           'rows': [{k: v for k, v in r.items() if k != 'usage_signal'} for r in rows] if False else rows},
          open(os.path.join(OUT, 'candidates.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False, default=str)
open(os.path.join(OUT, 'candidates.json'), 'a', encoding='utf-8').write('\n')

# merge log
with open(os.path.join(OUT, 'merge-log.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.writer(fh)
    w.writerow(['variant', 'canonical', 'reason'])
    for v, c, r2 in merge_log:
        w.writerow([v, c, r2])
    for u in unresolved:
        w.writerow([u.get('variant'), '', 'UNRESOLVED: ' + (u.get('issue') or '')])

# ================================================================ sources table
src_meta = {}
for run in C_RUNS:
    for s in C[run].get('sources') or []:
        if not isinstance(s, dict): continue
        nu = norm_url(s.get('url'))
        if not nu: continue
        rec2 = src_meta.setdefault(nu, {'type': None, 'language': None, 'is_affiliate': None, 'runs': set(), 'source_runs_raw': []})
        rec2['runs'].add(run)
        rec2['source_runs_raw'].append(f'{run}:{json.dumps(s, ensure_ascii=False)[:160] if False else ""}')
        for field in ('type', 'language', 'is_affiliate'):
            if rec2[field] is None and s.get(field) is not None:
                rec2[field] = s[field]
    # usage_signal sources (attributed as usage-signal source rows)
    for c in C[run].get('platforms') or []:
        sig = c.get('usage_signal') or {}
        nu = norm_url(sig.get('source'))
        if nu:
            rec2 = src_meta.setdefault(nu, {'type': None, 'language': None, 'is_affiliate': None, 'runs': set(), 'source_runs_raw': []})
            rec2['runs'].add(run)
            if rec2['type'] is None:
                rec2['type'] = 'usage_signal.source'
src_rows = [{'url': u, 'type': m['type'] or '', 'language': m['language'] or '', 'is_affiliate': ('' if m['is_affiliate'] is None else ('yes' if m['is_affiliate'] else 'no')),
             'cited_by_runs': ','.join(sorted(m['runs']))} for u, m in sorted(src_meta.items())]
write_csv(os.path.join(OUT, 'sources.csv'), ['url', 'type', 'language', 'is_affiliate', 'cited_by_runs'], src_rows)

# ================================================================ report numbers
run_sets = {}
for run in RUNS:
    run_sets[run] = {r for r, rec in canonicals.items() if run in rec['runs']}

overlap = {}
for i, a_run in enumerate(RUNS):
    for b_run in RUNS[i+1:]:
        overlap[f'{a_run}&{b_run}'] = len(run_sets[a_run] & run_sets[b_run])

def cr(n1, n2, o):
    return None if o in (0, n1, n2) else round(n1 * n2 / o, 1)

cr_pairs = {}
cl = C_RUNS
for i, x in enumerate(cl):
    for y in cl[i+1:]:
        n1, n2 = len(run_sets[x]), len(run_sets[y])
        o = len(run_sets[x] & run_sets[y])
        n1n2 = cr(n1, n2, o)
        cr_pairs[f'{x}&{y}'] = {'n1': n1, 'n2': n2, 'overlap': o, 'N_estimate': n1n2,
                                'note': 'undefined (zero overlap)' if n1n2 is None else ('estimated (identical sets)' if (n1, n2, o) in ((n1, n2, n1),) else None)}

role_counts = Counter(r['ecosystem_role'] or '(none)' for r in rows)
supply_hist = Counter(r['supply_runs_count'] for r in rows)
fronts = [r for r in rows if r['frontend_flag'] == 'yes']

def sig_rows(run, field):
    n = 0
    for r in rows:
        s = r['usage_signal'].get(run) if r['usage_signal'] else None
    return n

sig_counts = {}
for run in C_RUNS:
    total_with = {'web_visits': 0, 'app_downloads': 0}
    for r in rows:
        s = (r['usage_signal'] or {}).get(run)
        if s:
            for k in ('web_visits', 'app_downloads'):
                if s.get(k) not in (None, ''):
                    total_with[k] += 1
    sig_counts[run] = total_with

community_only = [r for r in rows if (r['qualified_A_strawberry'] or r['qualified_B_gemini']) and (r['lf_max'] is None or r['lf_max'] <= 3)]
sup_only = [r for r in rows if r['unique_source_list_count'] > 0 and not r['qualified_A_strawberry'] and not r['qualified_B_gemini'] and (r['community_users_A'] in (None, 0)) and (r['community_users_B'] in (None, 0))]
sup_only.sort(key=lambda r: -(r['unique_source_list_count']))
top25 = sup_only[:25]

aff_rows = [s for s in src_rows if s['is_affiliate'] == 'yes']
aff_share = round(100 * len(aff_rows) / len(src_rows), 1) if src_rows else None
top25_srcs = set()
for r in top25:
    pass
# recompute top-25's own unique sources for affiliate share
top25_aff = 0
top25_total = 0
for r in top25:
    canon = r['canonical_name'] if r['canonical_name'] in canonicals else r['home_run']
    srcs2 = set()
    for run in C_RUNS:
        for c in c_row_index[run].get(r['canonical_name'], []):
            for u in c.get('listed_in') or []:
                if isinstance(u, str): srcs2.add(norm_url(u))
    for u in srcs2:
        m = src_meta.get(u)
        if not m: continue
        top25_total += 1
        if m['is_affiliate']: top25_aff += 1

# tokenizer for failed-parse-vulnerable list_frequency sums etc
report = ['dup']

with open(os.path.join(OUT, 'MERGE-REPORT.md'), 'w', encoding='utf-8') as fh:
    fh.write('# Census merge report\n\n')
    fh.write(f'Generated: {D} (today)\n\n')
    fh.write('Inputs: census A = Strawberry (`census-A-strawberry/nsfw-ai-platform-census.json` + identity-aliases copy), '
             'census B = Gemini (`census-B-gemini.json`), census C = 3 supply runs parsed from `full_census_txt/` '
             '(gemini whole-file JSON; perplexity and venice embedded-in-markdown objects). '
             'No ranking, no quality judgement, no invented names.\n\n')
    fh.write('## Totals\n\n')
    fh.write(f'- canonical platforms: **{len(rows)}** (one row per canonical platform; census-A adjacent-entity names excluded from the table, see counts below)\n')
    fh.write(f'- census-A adjacent entities (models/directories/incidental names) canonical-unique and platform-absent: **{len(excluded_adjacent_only)}** (kept out of the table; logged in merge-log)\n')
    fh.write(f'- by ecosystem_role (majority vote across C runs): ' + ', '.join(f'{k}={v}' for k, v in role_counts.most_common(12)) + '\n')
    fh.write(f'- frontend/local-tool rows flagged: **{len(fronts)}**\n')
    fh.write(f'- supply_runs_count histogram: ' + ', '.join(f'{k} runs={v}' for k, v in sorted(supply_hist.items(), reverse=True)) + '\n')
    fh.write(f'- qualified_A (3-link bar as computed by census A): {sum(1 for r in rows if r["qualified_A_strawberry"])}; '
             f'qualified_B (Gemini, community): {sum(1 for r in rows if r["qualified_B_gemini"])}; '
             f'qualified_recomputed (3+ unique source threads across A+B): {sum(1 for r in rows if r["qualified_recomputed"])}\n\n')
    fh.write('## Run-overlap matrix (canonical names found in both runs)\n\n')
    fh.write('|    | ' + ' | '.join(RUNS) + ' |\n')
    fh.write('|---' * (len(RUNS) + 1) + '|\n')
    for a_run in RUNS:
        fh.write(f'| {a_run} | ' + ' | '.join(
            ('-' if a_run == b_run else str(overlap[f'{a_run}&{b_run}'] if f'{a_run}&{b_run}' in overlap else overlap[f'{b_run}&{a_run}']))
            for b_run in RUNS) + ' |\n')
    fh.write('\n## Capture-recapture on the C runs (pairwise, N ~ n1*n2/overlap)\n\n')
    fh.write('| pair | n1 | n2 | overlap | N estimated | note |\n|---|---|---|---|---|---|\n')
    for k, v in cr_pairs.items():
        fh.write(f'| {k} | {v["n1"]} | {v["n2"]} | {v["overlap"]} | {v["N_estimate"] if v["N_estimate"] is not None else "â€”"} | {v["note"] or ""} |\n')
    fh.write('\n## usage_signal completeness (% of canonical rows with a non-empty value, per run)\n\n')
    fh.write('| run | web_visits | app_downloads |\n|---|---|---|\n')
    for run in C_RUNS:
        ds = sig_counts.get(run, {'web_visits': 0, 'app_downloads': 0})
        pct = lambda n: round(100 * n / len(rows), 1)
        fh.write(f'| {run} | {pct(ds["web_visits"])}% ({ds["web_visits"]}) | {pct(ds["app_downloads"])}% ({ds["app_downloads"]}) |\n')
    fh.write('\n## community-only (qualified in A or B, but list_frequency max <= 3 in supply runs)\n\n')
    fh.write('| canonical_name | community_users_A | community_users_B | qualified flags | note |\n|---|---|---|---|---|\n')
    for r in community_only:
        fh.write(f"| {r['canonical_name']} | {r['community_users_A'] or 0} | {r['community_users_B'] or 0} | "
                 f"{'A' if r['qualified_A_strawberry'] else ('B' if r['qualified_B_gemini'] else '')} | |\n")
    fh.write('\n## supply-only big (top 25 by unique-source count with no community evidence)\n\n')
    fh.write('| canonical_name | unique_source_list_count | lf_max | supply_runs | segment | frontend_flag |\n|---|---|---|---|---|---|\n')
    for r in top25:
        fh.write(f"| {r['canonical_name']} | {r['unique_source_list_count']} | {r['lf_max'] or '-'} | {r['supply_runs_count']} | {r['segments'][:60]} | {r['frontend_flag']} |\n")
    fh.write(f'\n## affiliate-source share\n\n- overall: {len(aff_rows)} of {len(src_rows)} source URLs ({aff_share}%) declared affiliate\n')
    fh.write(f'- top-25 supply-only rows: {top25_aff} of {top25_total} ({round(100 * top25_aff / top25_total, 1) if top25_total else 0}%)\n')
    fh.write('\n## parse failures\n\n')
    if parse_failures:
        fh.write('| run | file | issue | detail |\n|---|---|---|---|\n')
        for f in parse_failures:
            fh.write(f'| {f["run"]} | {f["file"]} | {f["issue"]} | {f.get("detail", "")} |\n')
    else:
        fh.write('None â€” all three C runs parsed to a platforms array.\n')
    fh.write('\n## unresolved merges and domain conflicts\n\n')
    if unresolved:
        fh.write('| variant | run | issue |\n|---|---|---|\n')
        for u in unresolved:
            fh.write(f'| {u["variant"]} | {u["run"]} | {u["issue"]} |\n')
    else:
        fh.write('None flagged.\n')
    if domain_conflicts:
        fh.write('\n### domain conflicts during name-matching (kept separate)\n\n')
        fh.write('| variant | matched-to (existing) | var-domain | existing-domain |\n|---|---|---|---|\n')
        for v, c_, d1, d2 in domain_conflicts[:20]:
            fh.write(f'| {v} | {c_} | {d1} | {d2} |\n')
    fh.write(f'\n## parse mode per C run\n\n')
    for run in C_RUNS:
        fh.write(f'- {run}: {C_parse_mode[run]}\n')

print('MERGE-REPORT written; canonical rows:', len(rows))
print('unresolved:', len(unresolved), 'domain conflicts:', len(domain_conflicts))


