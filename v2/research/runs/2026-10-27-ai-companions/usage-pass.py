# -*- coding: utf-8 -*-
"""Usage pass: join census-U-perplexity.json onto merged/shortlist.csv.

Steps: match -> dedupe same-domain-identical-visits -> flag bad measurement
domains / stale months -> usage_band (never estimates missing values).
Numbers only; no ranking, no judgement.
"""
import json, csv, os, re, sys
from collections import Counter, defaultdict
from urllib.parse import urlparse

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
sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
D = '2026-10-29'
LOGAPPEND = []

def reg_domain(d):
    if not d: return None
    parts = d.split('.')
    return '.'.join(parts[-2:])

def norm_name(s):
    if not s or not isinstance(s, str): return ''
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '', s)
    for suf in ('chatbot', 'companion', 'app', 'chat', 'ai', 'official'):
        if s.endswith(suf) and len(s) - len(suf) >= 4:
            s = s[:-len(suf)]
    return s

BAD_MEASURING_DOMAINS = {
    # stores / search engines / directories: these subjects are never the platform's own traffic
    'google.com', 'play.google.com', 'apps.apple.com', 'itunes.apple.com', 'apple.com',
    'aixploria.com', 'theresanaiforthat.com', 'toolify.ai', 'duckduckgo.com', 'bing.com',
}
# traffic-ranking services measure a subject domain via URL path; the service itself is not the subject
TRAFFIC_SERVICES = {'semrush.com', 'similarweb.com'}

def measure_subject(web_source):
    """Return the domain whose traffic was actually measured by web_source."""
    if not web_source or not isinstance(web_source, str): return None
    u = web_source.replace('https://', '').replace('http://', '')
    host = u.split('/')[0].lower().removeprefix('www.')
    if reg_domain(host) in TRAFFIC_SERVICES:
        m = re.search(r'/website/([^/]+)/', u)
        if m: return m.group(1).lower().removeprefix('www.')
        return None
    return host

def parse_visits(rep):
    """Return (num, month, source) from monthly_web_visits dict."""
    if not isinstance(rep, dict):
        return None, None, None
    num = rep.get('number')
    if not isinstance(num, (int, float)):
        txt = str(rep.get('reported_value') or '')
        m = re.match(r'([\d.,]+)\s*(K|M|B|k|m\b)?', txt)
        if m:
            val = m.group(1).replace(',', '')
            try:
                v = float(val)
                mult = {'k': 1e3, 'K': 1e3, 'm': 1e6, 'M': 1e6, 'B': 1e9}
                suf = rep.get('reported_value', '')
                sm = re.search(r'([\d.,]+)\s*([KMB])\b', suf)
                if sm:
                    v = float(sm.group(1).replace(',', '')) * mult.get(sm.group(2), 1)
                num = v
            except ValueError:
                num = None
    return num, rep.get('month'), rep.get('source_url')

def dl_floor(label):
    """Parse a download range label like '1M+', '500.000+', '50 k+' to a numeric floor."""
    if not label or not isinstance(label, str): return None
    s = label.replace('＋', '+').replace(' ', '').lower()
    m = re.match(r'^([\d.,]+)(k|mil|m|b)?\+?$', s)
    if not m: return None
    raw = m.group(1).replace(',', '')
    # European '500.000' = 500000
    if '.' in raw and ',' not in raw and len(raw.rsplit('.', 1)[1]) == 3:
        raw = raw.replace('.', '')
    else:
        raw = raw.replace(',', '')
    try:
        v = float(raw)
    except ValueError:
        return None
    suf = m.group(2)
    mult = {'k': 1e3, 'mil': 1e6, 'm': 1e6, 'b': 1e9}.get(suf, 1)
    return v * mult

def band(web, dl):
    """A >=30M web or >=10M dl; B 3-30M or 1-10M; C 0.5-3M or 100K-1M; D below; U unknown.
    Take the HIGHER of the web/app bands (by rank, not alphabetical)."""
    RANK = {'U': -1, 'D': 0, 'C': 1, 'B': 2, 'A': 3}
    best = None
    if isinstance(web, (int, float)):
        best = 'A' if web >= 3e7 else 'B' if web >= 3e6 else 'C' if web >= 5e5 else 'D'
    if isinstance(dl, (int, float)):
        b = 'A' if dl >= 1e7 else 'B' if dl >= 1e6 else 'C' if dl >= 1e5 else 'D'
        if best is None or RANK[b] > RANK[best]:
            best = b
    return best or 'U'

RATING_STORE_LABELS = True  # note stores into usage_notes

# ---------------------------------------------------------------- load
U = json.load(open(os.path.join(BASE, 'census-U-perplexity.json'), encoding='utf-8'))
ALIASES = json.load(open(os.path.join(BASE, 'census-A-strawberry', 'identity-aliases.json'), encoding='utf-8'))
short = list(csv.DictReader(open(os.path.join(OUT, 'shortlist.csv'), encoding='utf-8-sig')))
print('shortlist rows:', len(short), 'usage records:', len(U))

# ---------------------------------------------------------------- matching
matched = {}  # shortlist row index -> U record; plus unmatched logs
u_used = set()
wnorm = {}   # normalized shortlist canonical name -> list of row indices
for idx, r in enumerate(short):
    n = norm_name(re.split(r'\s*\(', r['canonical_name'])[0])
    if n: wnorm.setdefault(n, []).append(idx)
    a = re.sub(r'[^a-z0-9]+', '', (r['canonical_name'] or '').lower())
    if len(a) >= 3: wnorm.setdefault(a, []).append(idx)
# anchor by domain and name FIRST; index is only a fallback that must still agree,
# because the shortlist was re-sorted since usage-pass-input.txt was generated
by_dom = {}
for idx, r in enumerate(short):
    rd = reg_domain(r.get('url_domain') or '')
    if rd: by_dom.setdefault(rd, idx)
ascii_norm = {}
for idx, r in enumerate(short):
    ascii_norm.setdefault(re.sub(r'[^a-z0-9]+', '', (r['canonical_name'] or '').lower()), idx)
    n = norm_name(re.split(r'\s*\(', r['canonical_name'])[0])
    if n: wnorm.setdefault(n, idx)
for rec in U:
    target = None
    how = None
    rd_u = reg_domain(rec.get('domain') or '')
    n_u = norm_name(re.split(r'\s*\(', rec.get('name') or '')[0])
    a_u = re.sub(r'[^a-z0-9]+', '', (rec.get('name') or '').lower())
    # 1) normalized-name keys (norm pieces + ascii); disambiguate by domain when several
    cands = []
    for k in (n_u, a_u):
        if k and k in wnorm:
            cands.append(wnorm[k])
    if cands:
        rd_dom_own = None
        if rd_u:
            name_rows = [i for lst in cands for i in lst]
            for i in name_rows:
                if i in matched: continue
                if by_dom.get(rd_u) == i:
                    target, how = i, 'normalized-name+domain'
                    break
        if target is None:
            for lst in cands:
                for i in lst:
                    if i not in matched:
                        target, how = i, 'normalized-name'
                        break
                if target is not None: break
    # 2) domain (own product domain equal)
    if target is None and rd_u and rd_u in by_dom:
        target, how = by_dom[rd_u], 'domain'
    # 3) dated positional index, only when the name still agrees
    if target is None:
        i0 = (rec.get('input_index') or 0) - 1
        cand = short[i0] if 0 <= i0 < len(short) else None
        if cand is not None:
            n_s = norm_name(re.split(r'\s*\(', cand.get('canonical_name') or '')[0])
            if n_u and n_s and n_u == n_s:
                target, how = i0, 'positional (index+name agree)'
    if target is None:
        LOGAPPEND.append(('UNMATCHED usage record', rec.get('name') or '', f'no shortlist match: idx={rec.get("input_index")}, domain={rec.get("domain")}'))
        continue
    if target in matched:
        LOGAPPEND.append(('DOUBLE MATCH usage record', rec.get('name') or '', 'a different shortlist row already matched this record; skipped'))
        continue
    matched[target] = (rec, how)
# reverse: shortlist rows without a usage record
for i, r in enumerate(short):
    if i not in matched:
        LOGAPPEND.append(('NO USAGE RECORD FOR', r['canonical_name'], ''))

# ---------------------------------------------------------------- attach + flags + dedupe
# Argon figures: separate columns, never overwriting Perplexity's values
ARGON = json.load(open(os.path.join(BASE, 'census-C-argon.json'), encoding='utf-8'))
argon_rows = ARGON.get('platforms') or []
def argon_visits(sig):
    """Parse '189.54M' style strings to numbers; never guesses."""
    if not isinstance(sig, dict): return None
    v = sig.get('web_visits')
    if v is None: return None
    if isinstance(v, (int, float)): return v
    m = re.search(r'([\d.,]+)\s*([KMB])\b', str(v))
    if not m: return None
    mult = { 'K': 1e3, 'M': 1e6, 'B': 1e9 }.get(m.group(2), 1)
    try:
        return float(m.group(1).replace(',', '')) * mult
    except ValueError:
        return None
argon_index = {}
for p in argon_rows:
    dom_raw = domain_of(p.get('url'))
    n = norm_name(re.split(r's*\(', p.get('name') or '')[0]) if False else norm_name(re.split(r'\s*\(', p.get('name') or '')[0])
    rd = reg_domain(dom_raw)
    for k in (n, rd):
        if k and k not in argon_index:
            argon_index[k] = p

def find_argon(row):
    rd = reg_domain(row.get('url_domain') or '')
    base = re.split(r'\s*\(', row.get('canonical_name') or '')[0]
    n2 = norm_name(base)
    if rd and rd in argon_index:
        p0 = argon_index[rd]
        n1 = norm_name(re.split(r'\s*\(', p0.get('name') or '')[0])
        if not n1 or not n2 or n1.startswith(n2) or n2.startswith(n1):
            return p0
    if n2 and n2 in argon_index:
        return argon_index[n2]
    return None


bad_domain_rows = []
stale_rows = []
domain_mismatch_rows = []
combined = []
for i, r in enumerate(short):
    row = dict(r)
    notes = []
    flags = []
    rec, how = matched.get(i, (None, None))
    web = None; web_month = None; web_source = None; dl_num = None; store_rating = None; rating_count = None
    if rec:
        web, web_month, web_source = parse_visits(rec.get('monthly_web_visits'))
        own = reg_domain(r['url_domain'] or '')
        udom = reg_domain(rec.get('domain') or '')
        src_dom = measure_subject(web_source)
        # step 3: the measured subject must be the platform's own domain
        # (a store/search/directory subject is never the platform's traffic)
        measurement_bad = ((udom and udom in BAD_MEASURING_DOMAINS)
                           or (src_dom and (src_dom in BAD_MEASURING_DOMAINS or (own and src_dom != own)))
                           or (udom and own and udom != own and udom not in BAD_MEASURING_DOMAINS))
        if measurement_bad and web is not None:
            flags.append('domain_mismatch')
            web = None
            domain_mismatch_rows.append(r['canonical_name'] + f' (measured subject: {src_dom or udom}, own: {own})')
        if not web_source or not web:
            if not web:
                if not rec.get('monthly_web_visits'):
                    notes.append('no first-party/traffic source found for web visits')
        # stale month (web_month older than 2026-01)
        if web_month:
            try:
                y, m2 = web_month.split('-')
                if (int(y), int(m2)) < (2026, 1):
                    flags.append('stale')
                    stale_rows.append(f"{r['canonical_name']} ({web_month})")
            except ValueError:
                notes.append(f'unparsed web_month {web_month}')
        # downloads: max range floor across store entries
        floors = []
        for a in (rec.get('app_downloads') or []):
            f = dl_floor(a.get('range'))
            if f is not None:
                floors.append((f, a.get('store'), a.get('range'), a.get('source_url')))
        if floors:
            dl_num = max(f[0] for f in floors)
            dl_note = 'downloads ranges: ' + '; '.join(sorted({f'{t}: {ran} ({src})' for f, t, ran, src in floors}, key=str))[:300]
            notes.append(dl_note)
        # store rating: highest rating row (note store)
        for s in (rec.get('store_ratings') or []):
            if isinstance(s.get('store_rating'), (int, float)):
                if store_rating is None or s['store_rating'] > store_rating:
                    store_rating = s['store_rating']
                    rating_count = s.get('rating_count')
                    notes.append(f"store rating taken from {s.get('store')} ({s.get('source_status') or ''})")
        for n2 in rec.get('notes') or []:
            notes.append(str(n2))
        for cs in rec.get('checked_sources') or []:
            if cs and web_source and cs != web_source:
                pass  # checked_sources stay in the JSON record
    usage_band = band(web, dl_num)
    # Argon figures: added as separate columns; never overwrite Perplexity's values
    a_plat = find_argon(r)
    a_web = argon_visits(a_plat.get('usage_signal') if a_plat else None)
    a_src = (a_plat.get('usage_signal') or {}).get('source') if a_plat else None
    # store_build_may_differ: band would be lower (or empty) without app downloads
    band_web_only = band(web, None)
    RANK = {'U': -1, 'D': 0, 'C': 1, 'B': 2, 'A': 3}
    store_only = bool(dl_num is not None and RANK[usage_band] > RANK[band_web_only])
    if store_only:
        flags.append('store_build_may_differ')
    argon_row = {
        'web_visits_argon': '' if a_web is None else (int(a_web) if float(a_web).is_integer() else a_web),
        'web_month_argon': '',
        'web_source_argon': a_src or '',
        'matched_argon': 'yes' if a_plat else 'no',
    }
    row.update({
        'web_visits': '' if web is None else (int(web) if float(web).is_integer() else web),
        'web_month': web_month or '',
        'web_source': web_source or '',
        'app_downloads_floor': '' if dl_num is None else (int(dl_num) if float(dl_num).is_integer() else dl_num),
        'store_rating': '' if store_rating is None else store_rating,
        'rating_count': rating_count or '',
        'usage_notes': ' | '.join([f'{x}' for x in notes] + [f'FLAG:{f}' for f in flags]),
        'usage_band': usage_band,
        'matched_by': how or '',
    })
    row.update(argon_row)
    if flags:
        for f in flags: bad_domain_rows.append(f"{r['canonical_name']}: {f}")
    # keep dedupe key
    row['_regdom'] = (reg_domain(r['url_domain'] or '') or '').lower()
    row['_visits_key'] = '' if web is None else str(int(web) if float(web).is_integer() else web)
    combined.append(row)

# ---------------------------------------------------------------- dedupe (step 2)
# identity-alias table from census A identity resolution (variant-norm -> canonical display)
alias_map = {}
for variant, canon in ALIASES.items():
    pieces = variant.split(' / ') if ' / ' in variant else [variant]
    for v in pieces:
        v = v.strip()
        if not v: continue
        n = norm_name(v)
        if len(n) >= 2: alias_map.setdefault(n, canon)

ALIAS_ENTRIES = []  # sets of alias strings from census-A identity resolution (variant + canonical)
for variant, canon in ALIASES.items():
    s = set()
    pieces = variant.split(' / ') if ' / ' in variant else [variant]
    for p2 in pieces + [canon if isinstance(canon, str) else None]:
        if p2 and isinstance(p2, str):
            s.add(p2.strip().lower())
    if s: ALIAS_ENTRIES.append(s)

def same_product(a, b):
    """Name-variant test: stem-prefix relation, alias-entry linkage, or token-subset."""
    na = norm_name(a); nb = norm_name(b)
    if not na or not nb: return False
    if na.startswith(nb) or nb.startswith(na): return True
    if na in alias_map and alias_map[na].lower() == (b or '').lower(): return True
    if nb in alias_map and alias_map[nb].lower() == (a or '').lower(): return True
    for entry in ALIAS_ENTRIES:
        if (a or '').lower() in entry and (b or '').lower() in entry: return True
    ta = set(t for t in re.split(r'[\s\-]+', a.lower()) if t not in ('ai', 'app', 'chat'))
    tb = set(t for t in re.split(r'[\s\-]+', b.lower()) if t not in ('ai', 'app', 'chat'))
    if ta and tb and (ta <= tb or tb <= ta): return True
    return False

groups = defaultdict(list)
for row in combined:
    groups[row['_regdom']].append(row)
kept = []
def mergeable(keep_r, o):
    if same_product(keep_r['canonical_name'], o['canonical_name']):
        # identical visits when both present, or either side has no usage data
        if keep_r.get('_visits_key') == o.get('_visits_key'):
            return True
        if not keep_r.get('web_visits') or not o.get('web_visits'):
            return True
    return False
for rd, rows_g in groups.items():
    # cluster rows within the domain via the variant relation (connected components)
    parent = list(range(len(rows_g)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[max(ra, rb)] = min(ra, rb)
    for a in range(len(rows_g)):
        for b in range(a + 1, len(rows_g)):
            if mergeable(rows_g[a], rows_g[b]): union(a, b)
    clusters = defaultdict(list)
    for idx in range(len(rows_g)):
        clusters[find(idx)].append(rows_g[idx])
    for cluster_rows in clusters.values():
        keep_row = sorted(cluster_rows, key=lambda r: (-(int(r['lf_max']) if str(r.get('lf_max')).strip('.').isdigit() else 0), r['canonical_name']))[0]
        others = [r for r in cluster_rows if r is not keep_row]
        if not others:
            kept.append(keep_row)
            continue
        names = ' + '.join(o['canonical_name'] for o in [keep_row] + others)
        LOGAPPEND.append(('usage-pass duplicate', names,
                          f'same registrable domain {rd} and identical or single-side web_visits ({keep_row["_visits_key"] or "none"})'))
        base = keep_row
        for o in others:
            for att in ('community_users_A', 'community_users_B', 'community_evidence_count_B', 'community_threads_A_plus_B'):
                try:
                    base[att] = str(max(int(base.get(att) or 0), int(o.get(att) or 0)))
                except (TypeError, ValueError):
                    base[att] = base.get(att) or o.get(att) or ''
            if o.get('qualified_A_strawberry') in ('True', 'true', '1'): base['qualified_A_strawberry'] = o['qualified_A_strawberry']
            if o.get('qualified_B_gemini') in ('True', 'true', '1'): base['qualified_B_gemini'] = o['qualified_B_gemini']
            if o.get('qualified_recomputed') in ('True', 'true', '1'): base['qualified_recomputed'] = o['qualified_recomputed']
            if o.get('web_visits') and not base.get('web_visits'): base['web_visits'] = o['web_visits']
            if o.get('web_month') and not base.get('web_month'): base['web_month'] = o['web_month']
            if o.get('web_source') and not base.get('web_source'): base['web_source'] = o['web_source']
            if o.get('app_downloads_floor') and not base.get('app_downloads_floor'): base['app_downloads_floor'] = o['app_downloads_floor']
            if o.get('store_rating') and not base.get('store_rating'): base['store_rating'] = o['store_rating']
            if o.get('rating_count') and not base.get('rating_count'): base['rating_count'] = o['rating_count']
            if o.get('usage_notes') and not base.get('usage_notes'): base['usage_notes'] = o['usage_notes']
            RB2 = {'U': -1, 'D': 0, 'C': 1, 'B': 2, 'A': 3}
            if RB2.get(base.get('usage_band'), -9) < RB2.get(o.get('usage_band'), -9): base['usage_band'] = o['usage_band']
            for att in ('segments', 'census_A_classification'):
                if o.get(att) and o[att] not in (base.get(att) or ''):
                    base[att] = ((base.get(att) or '') + ' | ' + o[att]).strip(' |')[:400]
            for runk in ('lf_C-gem', 'lf_C-ppx', 'lf_C-ven', 'lf_C-argon'):
                if o.get(runk) and base.get(runk) in ('', None): base[runk] = o[runk]
            try:
                if o.get('lf_max') is not None and base.get('lf_max') in ('', None): base['lf_max'] = o['lf_max']
                if o.get('lf_sum') and (base.get('lf_sum') or 0) < int(o['lf_sum']): base['lf_sum'] = o['lf_sum']
            except (TypeError, ValueError):
                pass
            if o.get('frontend_flag') and not base.get('frontend_flag'): base['frontend_flag'] = o['frontend_flag']
            if o.get('ecosystem_role') and not base.get('ecosystem_role'): base['ecosystem_role'] = o['ecosystem_role']
            if o.get('web_visits_argon') and not base.get('web_visits_argon'): base['web_visits_argon'] = o['web_visits_argon']
            if o.get('web_source_argon') and not base.get('web_source_argon'): base['web_source_argon'] = o['web_source_argon']
            if o.get('matched_argon') == 'yes': base['matched_argon'] = 'yes'
        kept.append(base)

for row in kept:
    row.pop('_regdom', None); row.pop('_visits_key', None)
print('after dedupe:', len(kept), '(from', len(combined), ')')

# ---------------------------------------------------------------- write
ADD = ['web_visits', 'web_month', 'web_source', 'app_downloads_floor', 'store_rating', 'rating_count', 'usage_notes', 'usage_band', 'matched_by', 'web_visits_argon', 'web_month_argon', 'web_source_argon', 'matched_argon']
cols = list(short[0].keys()) + ADD
with open(os.path.join(OUT, 'shortlist-usage.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
    w.writeheader()
    for row in kept:
        w.writerow(row)
json.dump(kept, open(os.path.join(OUT, 'shortlist-usage.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False, default=str)
open(os.path.join(OUT, 'shortlist-usage.json'), 'a', encoding='utf-8').write('\n')
# append merge-log: rebuild with only base rows + this run's entries (idempotent on rerun)
OMIT_CLASSES = {'usage-pass duplicate', 'kept separate at usage dedupe', 'UNMATCHED usage record', 'NO USAGE RECORD FOR'}
base_rows = []
with open(os.path.join(OUT, 'merge-log.csv'), encoding='utf-8-sig') as fh:
    for l in csv.reader(fh):
        if l and l[0] not in OMIT_CLASSES:
            base_rows.append(l)
with open(os.path.join(OUT, 'merge-log.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.writer(fh)
    for l in base_rows:
        w.writerow(l)
    for a in LOGAPPEND: w.writerow(a)

# ---------------------------------------------------------------- report
bands = Counter(r['usage_band'] for r in kept)
rank = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'U': 4}
ordered = sorted(kept, key=lambda r: (rank[r['usage_band']], -(r['web_visits'] or 0), -(r['app_downloads_floor'] or 0)))
rep = ['# Usage pass report', '', f'Generated: {D}', '',
       f'- shortlist rows in: {len(short)}; usage records in: {len(U)}; matched: {len(matched)}',
       f'- rows after dedupe: **{len(kept)}** (merged duplicate-platform rows: {len(combined) - len(kept)})',
       f'- usage_band counts: ' + ', '.join(f'{k}={v}' for k, v in sorted(bands.items())),
       f'- flagged rows (domain_mismatch / stale): {len(domain_mismatch_rows) + len(stale_rows)}', '', '## Band counts (usage_band)', '']
for b in ['A', 'B', 'C', 'D', 'U']:
    n = bands.get(b, 0)
    rep.append(f'- {b}: {n}')
rep += ['', '## Flagged rows', '',
        '### domain_mismatch (web_visits set to null)', '| row | measured on |', '|---|---|']
dm_seen = set()
for row in combined:
    fl = [f for f in (row.get('usage_notes') or '').split(' | ') if f.startswith('FLAG:domain_mismatch')]
    if fl:
        dom = (row.get('web_source') or '')
        rep.append(f"| {row['canonical_name']} | {dom} |")
rep += ['', '### stale (web_month older than 2026-01; visits kept, flagged)', '| row | month |', '|---|---|']
for row in combined:
    fl = [f for f in (row.get('usage_notes') or '').split(' | ') if f.startswith('FLAG:stale')]
    if fl:
        rep.append(f"| {row['canonical_name']} | {row['web_month']} |")
rep += ['', '## Top 30 by band, then web visits', '', '| row | band | web_visits | web_month | downloads floor | store_rating |', '|---|---|---|---|---|---|']
for row in ordered[:30]:
    rep.append(f"| {row['canonical_name']} | {row['usage_band']} | {row['web_visits']} | {row['web_month']} | {row['app_downloads_floor']} | {row['store_rating']} |")
rep += ['', '## Match notes', '', f'- matched_by domain: {sum(1 for _, h in matched.values() if h == "domain")}; normalized-name: {sum(1 for _, h in matched.values() if h == "normalized-name")}; positional-agreeing: {sum(1 for _, h in matched.values() if h and h.startswith("positional"))}',
        f'- unmatched usage records: {len([x for x in LOGAPPEND if x[0] == "UNMATCHED usage record"])}',
        f'- shortlist rows with NO usage record: {len([x for x in LOGAPPEND if x[0] == "NO USAGE RECORD FOR"])}',
        '', '## duplicate-platform merges (logged in merge-log.csv)', '']
for a in LOGAPPEND:
    if a[0] == 'usage-pass duplicate':
        rep.append(f'- {a[1]} → {a[2]}')
rep += ['', '## Match notes / duplicate merges', '']
for a in LOGAPPEND:
    if a[0] in ('kept separate at usage dedupe', 'DOUBLE MATCH usage record'):
        rep.append(f'- {a[0]}: {a[1]} ({a[2][:160]})')

# ---------------------------------------------------------------- Argon integration section
store_flag_rows = [r for r in kept if 'FLAG:store_build_may_differ' in (r.get('usage_notes') or '')]
new_rows = []
band_changes = []
try:
    prev = json.load(open(os.path.join(OUT, 'pre-argon', 'shortlist-usage.json'), encoding='utf-8'))
    pk = {re.sub(r'[^a-z0-9]+', '', (x.get('canonical_name') or '').lower()): x for x in prev}
    nk = {re.sub(r'[^a-z0-9]+', '', (x.get('canonical_name') or '').lower()): x for x in kept}
    for k, x in nk.items():
        if k not in pk:
            new_rows.append(x)
        elif pk[k].get('usage_band') != x.get('usage_band'):
            band_changes.append((x.get('canonical_name') or '', pk[k].get('usage_band'), x.get('usage_band'),
                                 pk[k].get('web_visits'), x.get('web_visits'), x.get('web_visits_argon')))
    # also rows in prev that are NOT in new (dropped rows)
    dropped = [pk[k] for k in pk if k not in nk]
except FileNotFoundError:
    prev = None
    dropped = []
bandc_old = Counter(x.get('usage_band') for x in (prev or []))
rep += ['', '## Argon integration (C-argon run added to the merge)', '',
        f'- Pre-argon shortlist: 197 rows; now: **{len(short)}** rows; shortlist-usage rows after dedupe: {len(kept)}',
        f'- Shortlist rows NEW because of C-argon (supply_runs_count reached 2+ with the fourth run): **{len(new_rows)}**'
        + (f'; rows dropped: {len(dropped)}' if dropped else ''),
        f'- store_build_may_differ rows (band comes only from app downloads): **{len(store_flag_rows)}**', '',
        '### New shortlist rows', '', '| canonical_name | found in | supply runs | lf_max | argon visits | band |', '|---|---|---|---|---|---|']
for x in new_rows:
    rep.append(f"| {x['canonical_name']} | {x['found_in_runs']} | {x['supply_runs_count']} | {x.get('lf_max') or '-'} | {x.get('web_visits_argon') or '-'} | {x['usage_band']} |")
rep += ['', '### store_build_may_differ rows', '', '| canonical | band | web_visits | downloads floor |', '|---|---|---|---|']
for x in store_flag_rows:
    rep.append(f"| {x['canonical_name']} | {x['usage_band']} | {x.get('web_visits') or '-'} | {x.get('app_downloads_floor') or '-'} |")
rep += ['', '### Band changes (rows present in both pre- and post-Argon runs)', '', '| row | old band | new band | old visits | new visits | argon visits |', '|---|---|---|---|---|---|']
for c, ob, nb, ov, nv_, av in band_changes:
    rep.append(f'| {c} | {ob} | {nb} | {ov or "-"} | {nv_ or "-"} | {av or "-"} |')
if not band_changes:
    rep.append('| (none - no band changed for rows carried through) | | | | | |')
open(os.path.join(OUT, 'USAGE-PASS-REPORT.md'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
print('band counts:', bands.most_common())
print('flags total:', len(bad_domain_rows), 'domain_mismatch rows:', len(domain_mismatch_rows), 'stale:', len(stale_rows))
print('argon: new shortlist rows', len(new_rows), 'band changes', len(band_changes), 'store_build_may_differ', len(store_flag_rows))
