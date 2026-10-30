# -*- coding: utf-8 -*-
"""Usage pass: join census-U-perplexity.json onto merged/shortlist.csv.

Steps: match -> dedupe same-domain-identical-visits -> flag bad measurement
domains / stale months -> usage_band (never estimates missing values).
Numbers only; no ranking, no judgement.
"""
import json, csv, os, re, sys
from collections import Counter, defaultdict
from urllib.parse import urlparse
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
short = list(csv.DictReader(open(os.path.join(OUT, 'shortlist.csv'), encoding='utf-8-sig')))
print('shortlist rows:', len(short), 'usage records:', len(U))

# ---------------------------------------------------------------- matching
matched = {}  # shortlist row index -> U record; plus unmatched logs
u_used = set()
wnorm = {}   # normalized shortlist canonical name -> index
for idx, r in enumerate(short):
    n = norm_name(re.split(r'\s*\(', r['canonical_name'])[0])
    wnorm.setdefault(n, idx)
    for k in re.split(r' / ', ''):
        pass
for rec in U:
    target = None
    how = None
    i0 = (rec.get('input_index') or 0) - 1
    cand = short[i0] if 0 <= i0 < len(short) else None
    if cand is not None:
        rd_u = reg_domain(rec.get('domain') or '')
        rd_s = reg_domain(cand.get('url_domain') or '')
        n_u = norm_name(re.split(r'\s*\(', rec.get('name') or '')[0])
        n_s = norm_name(re.split(r'\s*\(', cand.get('canonical_name') or '')[0])
        if (rd_u and rd_s and rd_u == rd_s) or (n_u and n_u == n_s):
            target, how = i0, 'positional (index+domain/name agree)'
    if target is None:
        # fallback: normalized-name match
        n_u = norm_name(rec.get('name') or '')
        if n_u in wnorm:
            target, how = wnorm[n_u], 'normalized-name'
        else:
            # try full-name ascii normal
            a = re.sub(r'[^a-z0-9]+', '', (rec.get('name') or '').lower())
            if a in {re.sub(r'[^a-z0-9]+', '', x['canonical_name'].lower()) for x in short}:
                pass
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
    if flags:
        for f in flags: bad_domain_rows.append(f"{r['canonical_name']}: {f}")
    # keep dedupe key
    row['_regdom'] = (reg_domain(r['url_domain'] or '') or '').lower()
    row['_visits_key'] = '' if web is None else str(int(web) if float(web).is_integer() else web)
    combined.append(row)

# ---------------------------------------------------------------- dedupe (step 2)
groups = defaultdict(list)
for row in combined:
    groups[(row['_regdom'], row['_visits_key'])].append(row)
kept = []
same_product = lambda a, b: (norm_name(a) and (norm_name(a).startswith(norm_name(b)) or norm_name(b).startswith(norm_name(a))))
for key, rows_g in groups.items():
    keep_row = rows_g[0]
    others = rows_g[1:]
    if not others:
        kept.append(keep_row)
        continue
    variants = all(same_product(keep_row['canonical_name'], o['canonical_name']) for o in others)
    if not variants:
        # shared measurement domain but clearly different products (e.g. two github tools) — keep separate
        LOGAPPEND.append(('kept separate at usage dedupe', ' + '.join(o['canonical_name'] for o in rows_g),
                          f'same registrable domain {key[0]} and identical web_visits but names are not variants of one product'))
        kept.extend(rows_g)
        continue
    names = ' + '.join(o['canonical_name'] for o in [keep_row] + others)
    LOGAPPEND.append(('usage-pass duplicate', names,
                      f'same registrable domain {key[0]} and identical web_visits ({key[1] or "none"})'))
    base = keep_row
    for o in others:
        for att in ('community_users_A', 'community_users_B', 'community_evidence_count_B', 'community_threads_A_plus_B'):
            try:
                base[att] = str(max(int(base.get(att) or 0), int(o.get(att) or 0)))
            except (TypeError, ValueError):
                base[att] = base.get(att) or o.get(att) or ''
        if o.get('qualified_A_strawberry') in ('True', 'true', '1'):
            base['qualified_A_strawberry'] = o['qualified_A_strawberry']
        if o.get('qualified_B_gemini') in ('True', 'true', '1'):
            base['qualified_B_gemini'] = o['qualified_B_gemini']
        if o.get('qualified_recomputed') in ('True', 'true', '1'):
            base['qualified_recomputed'] = o['qualified_recomputed']
        if not base.get('web_visits') and o.get('web_visits'): base['web_visits'] = o['web_visits']
        if not base.get('app_downloads_floor') and o.get('app_downloads_floor'): base['app_downloads_floor'] = o['app_downloads_floor']
        if not base.get('store_rating') and o.get('store_rating'): base['store_rating'] = o['store_rating']
        if not base.get('rating_count') and o.get('rating_count'): base['rating_count'] = o['rating_count']
        if not base.get('web_month') and o.get('web_month'): base['web_month'] = o['web_month']
        if not base.get('web_source') and o.get('web_source'): base['web_source'] = o['web_source']
        for att in ('segments', 'census_A_classification'):
            if o.get(att) and o[att] not in (base.get(att) or ''):
                base[att] = ((base.get(att) or '') + ' | ' + o[att]).strip(' |')[:400]
        for runk in ('lf_C-gem', 'lf_C-ppx', 'lf_C-ven'):
            if o.get(runk) and base.get(runk) in ('', None): base[runk] = o[runk]
        try:
            if o.get('lf_max') is not None and base.get('lf_max') in ('', None):
                base['lf_max'] = o['lf_max']
            if o.get('lf_sum') and (base.get('lf_sum') or 0) < int(o['lf_sum']):
                base['lf_sum'] = o['lf_sum']
        except (TypeError, ValueError):
            pass
        if o.get('frontend_flag') and not base.get('frontend_flag'):
            base['frontend_flag'] = o['frontend_flag']
        if o.get('ecosystem_role') and not base.get('ecosystem_role'):
            base['ecosystem_role'] = o['ecosystem_role']
        for k2 in ('community_users_A', 'community_users_B', 'community_evidence_count_B'):
            pass
    kept.append(keep_row)

for row in kept:
    row.pop('_regdom', None); row.pop('_visits_key', None)
print('after dedupe:', len(kept), '(from', len(combined), ')')

# ---------------------------------------------------------------- write
ADD = ['web_visits', 'web_month', 'web_source', 'app_downloads_floor', 'store_rating', 'rating_count', 'usage_notes', 'usage_band', 'matched_by']
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
rep += ['', '## Match notes', '', f'- matched_by positional: {sum(1 for _, h in matched.values() if h and h.startswith("positional"))}; by normalized-name: {sum(1 for _, h in matched.values() if h == "normalized-name")}',
        f'- unmatched usage records: {len([x for x in LOGAPPEND if x[0] == "UNMATCHED usage record"])}',
        f'- shortlist rows with NO usage record: {len([x for x in LOGAPPEND if x[0] == "NO USAGE RECORD FOR"])}',
        '', '## duplicate-platform merges (logged in merge-log.csv)', '']
for a in LOGAPPEND:
    if a[0] == 'usage-pass duplicate':
        rep.append(f'- {a[1]} → same domain {a[2]}')
open(os.path.join(OUT, 'USAGE-PASS-REPORT.md'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
print('band counts:', bands.most_common())
print('flags:', len(bad_domain_rows), 'domain_mismatch rows:', len(domain_mismatch_rows), 'stale:', len(stale_rows))
