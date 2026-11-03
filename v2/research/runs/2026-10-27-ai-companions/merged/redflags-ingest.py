# -*- coding: utf-8 -*-
"""Ingest red-flag research outputs from ANY number of models/batches.

Sources are auto-discovered: merged/redflags-<model>-<n>.json (multiples per
model fine). Models whose name starts with 'deep' are excluded — the deep
pass gets a later ingest of its own (name those redflags-deep-<model>-<n>.json).
Each model keeps its own answer columns, prefixed <pfx>_... : perplexity->pplx,
gemini->gemini, venice->venice; unknown models fall back to a sanitized name.

Extra first-party source: census-scope-checks-perplexity.json as EXECUTED by
scope-resolve.py — its Test A records decompose into the two field-level
answers (chat part / NSFW part); source id 'pplx_scope'. Tests B/C/D/E/F do
not map onto either field and contribute nothing.

Merged-field rules (per field: nsfw / chat):
- a resolved answer (yes/no) beats 'unresolved';
- resolved answers from different sources stay side by side; disagreement
  -> merged answer 'conflict';
- every merged field logs decided_by (source ids holding the winning
  answer, or 'conflict') plus per-source raw answers in
  merged_<field>_sources ('src=answer[verbatim][u]' tokens);
- if the only NSFW 'yes' is non-verbatim (a marketing paraphrase),
  evidence_strength='paraphrase' on the row.

Red flags per platform: unioned across models, deduped by type (one merged
flag per type). Union sources dedupe by URL+source_type; a URL raised as
first_party by one model and as independent_user by another is kept as BOTH
entries. independent_users is RECOUNTED across all sources: named handles
and distinct non-blocked independent_user URLs, one user per URL unit
(conservative); REVIEW_BLOCK domains never count as users.
'recurring' = 2+ users; a model claim of 'recurring' that recounts below 2
users is downgraded to 'isolated' and logged.
Coverage: zero unioned flags for a row = 'not_researched' (never 'clean').

scope_pending resolution (against the pre-ingest state, restored every run
so reruns are byte-identical): in if merged nsfw=yes AND merged chat is not
'no' AND no source's chat answer is 'no'; out if a field's MERGED value is
'no' AND that field carries a URL (the field-level url is the models'
first-party evidence per the research prompt); conflicts never resolve.

Self-revert: previous run's redflags_*/pplx_scope_*/<pfx>_*_answer columns
and pending resolutions are stripped first (redflags_*_before state), then
everything is recomputed from scratch.

Deep pass: rows with a weakness (merged nsfw unresolved/conflict, chat
conflict, coverage not_researched, nsfw-paraphrase-only) AND prominence
(band A/B/C OR community_users A+B>=3 OR supply_runs>=3 OR scope_pending);
conflicts bypass the prominence gate. Owner instruction 2026-11-03: a
paraphrase-only weakness is sustained ONLY by usage band A/B/C or
supply_runs>=3 — community-only or scope_pending prominence no longer
suffices for it. Stale redflags-deep-prompt-*.txt files are deleted every
run before the current set is written.

Pipeline order: scope-pass.py -> scope-resolve.py -> redflags-ingest.py.
Outputs: merged/redflags.csv, merged/REDFLAGS-REPORT.md,
merged/redflags-deep-pass-input.txt (same pipe format as redflags-input),
merged/redflags-deep-prompt-1..N.txt (max 15 platforms per file), plus a
summary join into merged/scoped.csv.
"""
import json, csv, os, re, sys, io
from collections import Counter, defaultdict
from urllib.parse import urlparse, urlunparse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = BASE   # this script lives in merged/ itself
D = '2026-11-03'
MAX_PER_DEEP_FILE = 15
DEEP_PROMPT_PATH = os.path.join(BASE, '..', '..', '..', 'method', '03-red-flags-prompt.txt')
DEEP_EXTRA_LINE = ('Research each platform individually and in depth: check its ToS/content policy and '
                   'pricing pages directly (quote verbatim where possible), and search Reddit/Discord/'
                   'Trustpilot by platform name for billing, purge, filter, and breach reports from '
                   'real users, not review/affiliate sites.')
# Affiliate / review-site domains that NEVER count as independent users
# (owner instruction, 2026-11-03).
REVIEW_BLOCK = ('synonymsvault', 'aifreands', 'aigirlfriendbase', 'funfun',
                'tryclout', 'companaya', 'spicyranked')
MODEL_PREFIX = {'perplexity': 'pplx', 'gemini': 'gemini', 'venice': 'venice'}
DISCOVER_RE = re.compile(r'^redflags-([A-Za-z0-9_\-]+?)-(\d+)\.json$')

# ---- prior first-party answers as EXECUTED by scope-resolve.py (Test A records
# of census-scope-checks-perplexity.json, judged 2026-10-30 strictly from each
# record's own first-party evidence/notes; pass->yes, fail->no). Soulkyn's NSFW
# part maps to 'unresolved' because that record itself kept the combined test
# unresolved (whether custom-character creation consumes the image currency was
# never established). Tests B/C/D/E/F do not decompose onto these two fields.
SCOPESPLIT = {   # norm-key -> (nsfw_answer, chat_answer)
    'candyai':         ('unresolved', 'yes'),
    'ourdreamai':      ('yes', 'yes'),
    'girlfriendgpt':   ('yes', 'unresolved'),
    'dreamgfai':       ('unresolved', 'unresolved'),
    'secretsai':       ('yes', 'yes'),
    'nectarai':        ('yes', 'yes'),
    'swipeyai':        ('yes', 'yes'),
    'darlinkai':       ('unresolved', 'yes'),
    'muahai':          ('unresolved', 'yes'),
    'fantasygf':       ('yes', 'unresolved'),
    'secretdesiresai': ('unresolved', 'yes'),
    'cutiesai':        ('yes', 'unresolved'),
    'soulkyn':         ('unresolved', 'yes'),
    'ehentai':         ('unresolved', 'unresolved'),
}


def norm_key(s):
    return re.sub(r'[^a-z0-9]+', '', (s or '').lower())


def slugify(name):
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '-', (name or '').lower()).strip('-')
    return s or 'unknown'


def norm_url(u):
    """Dedupe key for a source URL (scheme-less, no trailing slash/fragment)."""
    u = (u or '').strip()
    if not u:
        return ''
    try:
        p = urlparse(u)
        return urlunparse(('', (p.hostname or '').replace('www.', ''), p.path.rstrip('/'), '', '', '')).lower()
    except ValueError:
        return u.lower()


def host_of(u):
    try:
        return (urlparse(u).hostname or '').replace('www.', '')
    except ValueError:
        return ''


def unwrap(u):
    m = re.match(r'^\[(.*)\]\(.*\)$', (u or '').strip())
    return m.group(1) if m else (u or '').strip()


def to_int(v):
    try:
        return int(str(v or '').replace(',', '').strip() or '0')
    except ValueError:
        return 0


def parse_file(path):
    """Tolerant parse: whole-file JSON first, then per-object raw_decode scan."""
    text = open(path, encoding='utf-8', errors='replace').read()
    fails, records = [], []
    try:
        arr = json.loads(text)
        if isinstance(arr, list):
            return arr, fails
    except json.JSONDecodeError:
        pass
    dec = json.JSONDecoder()
    i = 0
    while i < len(text):
        b = text.find('{', i)
        if b == -1:
            break
        try:
            obj, end = dec.raw_decode(text, b)
            if isinstance(obj, dict) and ('platform' in obj or 'canonical_id' in obj):
                records.append(obj)
            i = end
        except json.JSONDecodeError:
            i = b + 1
    if not records:
        fails.append('no platform records recoverable')
    return records, fails


def discover_sources():
    """merged/redflags-<model>-<n>.json files except deep/batches artifacts."""
    srcs, seen_models = [], []
    for fn in sorted(os.listdir(OUT)):
        m = DISCOVER_RE.match(fn)
        if not m:
            continue
        model = m.group(1).lower()
        if model.startswith('deep') or 'batches' in model:
            continue
        srcs.append((model, m.group(2), os.path.join(OUT, fn)))
        if model not in seen_models:
            seen_models.append(model)
    prefixes, taken = {}, set()
    for model in sorted(seen_models):
        p = MODEL_PREFIX.get(model) or re.sub(r'[^a-z0-9]+', '', model)[:12]
        base_p, k = p, 2
        while p in taken:
            p = f'{base_p}_{k}'
            k += 1
        taken.add(p)
        prefixes[model] = p
    return srcs, prefixes


def merge_field(parts):
    """parts: [(srcid, answer, verbatim, url)] ->
    (merged, decided_by, sources_str, paraphrase_only_yes)."""
    srcs_str = ' | '.join(f'{s}={a}{"[verbatim]" if v is True else ""}{("[u] " if u else "")}' for s, a, v, u in parts)
    resolved = [(s, a, v, u) for s, a, v, u in parts if a in ('yes', 'no')]
    if not resolved:
        return 'unresolved', '', srcs_str, False
    vals = {a for _, a, _, _ in resolved}
    if len(vals) > 1:
        return 'conflict', 'conflict', srcs_str, False
    val = resolved[0][1]
    para = all(v is not True for _, _, v, _ in resolved) if val == 'yes' else False
    decided = '+'.join(sorted(s for s, a, _, _ in resolved))
    return val, decided[:140], srcs_str, para


def recount_users(srcs_out):
    """Count distinct independent users across a merged flag's sources:
    named handles from reddit /user|/u/ URL patterns, plus distinct
    non-blocked independent_user URL units (one URL = at most one user; a
    Reddit threadetail or Trustpilot profile page therefore counts once).
    Returns (n_users, handles, n_units, n_blocked)."""
    handles, units, blocked = set(), set(), 0
    for s in srcs_out:
        u, h = s.get('url') or '', host_of(s.get('url')).lower()
        if s.get('blocked_review_site'):
            blocked += 1
            continue
        if s.get('source_type') != 'independent_user':
            continue
        unit = norm_url(u)
        if unit:
            units.add(unit)
        for pf in re.findall(r'reddit\.com/(?:user|u)/([A-Za-z0-9_\-]{3,})', u.lower()):
            handles.add(pf.lower())
    return len(handles | units), sorted(handles), len(units), blocked


def main():
    # ---------------------------------------------------------------- inputs
    scoped = list(csv.DictReader(open(os.path.join(OUT, 'scoped.csv'), encoding='utf-8-sig')))
    if not scoped:
        print('no scoped rows; abort')
        return
    srcs, prefixes = discover_sources()
    model_records = defaultdict(dict)
    parsed_count = defaultdict(int)
    parse_failures = []
    for model, n, path in srcs:
        arr, fails = parse_file(path)
        parsed_count[model] += len(arr)
        for f in fails:
            parse_failures.append({'file': os.path.basename(path), 'issue': f})
        for rec in arr:
            raw = rec.get('canonical_id') or rec.get('platform') or ''
            cid = slugify(raw) if slugify(raw) != 'unknown' else norm_key(raw)
            if not cid:
                parse_failures.append({'file': os.path.basename(path), 'issue': f'record without usable id: {json.dumps(raw, ensure_ascii=False)[:60]}'})
                continue
            if cid in model_records[model]:
                parse_failures.append({'file': os.path.basename(path), 'issue': f'duplicate record {cid}; first kept'})
                continue
            model_records[model][cid] = rec
    models = sorted(model_records)

    # Ingest OWNS these column names in scoped.csv: everything prefixed
    # redflags_/pplx_scope_ or ending _nsfw_answer/_chat_answer. They are
    # captured (excluded) BEFORE the merge so reruns never duplicate columns.
    RF_OWN_RE = re.compile(r'^[a-z][a-z0-9_]*_(nsfw|chat)_answer$')
    base_cols = [c for c in scoped[0].keys()
                 if c != '_gkey' and not c.startswith('redflags_')
                 and not c.startswith('pplx_scope_') and not RF_OWN_RE.match(c)]

    row_ids = {slugify(r['canonical_name']) for r in scoped}

    # Re-key every record onto the scoped row it corresponds to: exact slug,
    # else a UNIQUE slug-prefix match (>=4 chars; catches model-shorthand ids
    # like venice's 'aimy' -> scoped 'aimy-アイミー'). Still-unmatched records
    # are lead-logged, never silently dropped.
    rec_by_row = {}
    unmatched_records = set()
    for m in models:
        keyed = {}
        for cid in model_records[m]:
            row = cid if cid in row_ids else None
            if row is None:
                cands = [rt for rt in row_ids
                         if len(cid) >= 4 and (rt.startswith(cid) or cid.startswith(rt))]
                if len(cands) == 1:
                    row = cands[0]
            if row is None:
                unmatched_records.add(cid)
                continue
            if row in keyed:
                parse_failures.append({'file': m, 'issue': f'record {cid} collapses onto an already-keyed row; first kept'})
                continue
            keyed[row] = model_records[m][cid]
        rec_by_row[m] = keyed
    model_records = rec_by_row
    unmatched_records = sorted(unmatched_records)

    # pplx_scope first-party evidence URL per normalized key (first first_party
    # evidence entry of each census-scope-checks-perplexity.json record).
    scopeurls = {}
    checks_path = os.path.join(BASE, 'census-scope-checks-perplexity.json')
    if os.path.exists(checks_path):
        for rec in json.load(open(checks_path, encoding='utf-8')):
            k = norm_key(rec.get('platform'))
            if k in scopeurls:
                continue
            for ev in (rec.get('evidence') or []):
                eu = unwrap(ev.get('url'))
                if eu and (ev.get('source_type') or '') == 'first_party':
                    scopeurls[k] = eu
                    break

    # -------------------------------------------------- self-revert (reruns)
    for r in scoped:
        if (r.get('redflags_pending_before') or '').strip() == 'true':
            r['scope_decision'] = r.get('redflags_scope_decision_before') or 'borderline'
            if r.get('redflags_rule_before'):
                r['rule_applied'] = r['redflags_rule_before']
        for c in list(r.keys()):
            if c.startswith('redflags_') or c.startswith('pplx_scope_') or \
               re.match(r'^[a-z][a-z0-9_]*_(nsfw|chat)_answer$', c):
                r.pop(c, None)
        r['scope_pending'] = 'true' if r['scope_decision'] == 'borderline' else 'false'

    # ------------------------------------------------------- per-row merge
    flag_docs = {}                # cid -> flag union document (for redflags.csv)
    conflictRows = {'nsfw': [], 'chat': []}
    paraphraseRows = []
    downgrades = []
    pending_res = {'in': [], 'out': [], 'stays': []}
    not_researched = []
    fam_counter = Counter()

    for r in scoped:
        cid = slugify(r['canonical_name'])
        cid_norm = norm_key(cid)
        r['redflags_scope_decision_before'] = ''
        r['redflags_rule_before'] = ''
        r['redflags_pending_before'] = ''
        mrecs = {}
        for m in models:
            p = prefixes[m]
            rec = model_records[m].get(cid)
            if rec is None:
                r[f'{p}_nsfw_answer'] = ''
                r[f'{p}_chat_answer'] = ''
                continue
            mrecs[m] = rec
            nsfw = rec.get('nsfw_first_party') or {}
            chat = rec.get('chat_without_image_credits') or {}
            r[f'{p}_nsfw_answer'] = nsfw.get('answer') or ''
            r[f'{p}_chat_answer'] = chat.get('answer') or ''
        rec_any = sorted(mrecs)
        nsfw_parts = [(prefixes[m], (mrecs[m].get('nsfw_first_party') or {}).get('answer', 'unresolved'),
                       (mrecs[m].get('nsfw_first_party') or {}).get('verbatim'),
                       (mrecs[m].get('nsfw_first_party') or {}).get('url')) for m in rec_any]
        chat_parts = [(prefixes[m], (mrecs[m].get('chat_without_image_credits') or {}).get('answer', 'unresolved'),
                       None, (mrecs[m].get('chat_without_image_credits') or {}).get('url')) for m in rec_any]
        def scope_lookup(tbl, is_pair):
            """lookup by slug, then normalized key, then conservative unique prefix
            match (latin keys only, 6+ chars) — mirrors scope-resolve's matching."""
            if cid in tbl:
                return tbl[cid]
            if cid_norm and cid_norm in tbl:
                return tbl[cid_norm]
            if cid_norm and cid_norm.isascii():
                cands = [tbl[k3] for k3 in tbl
                         if k3.isascii() and min(len(k3), len(cid_norm)) >= 6
                         and (k3.startswith(cid_norm) or cid_norm.startswith(k3))]
                if len(cands) == 1:
                    return cands[0]
            return (None, None) if is_pair else None
        scope_n, scope_c = scope_lookup(SCOPESPLIT, True) or (None, None)
        su = scope_lookup(scopeurls, False) or ''
        if scope_n:
            nsfw_parts.insert(0, ('pplx_scope', scope_n, None, su))
            r['pplx_scope_nsfw_answer'] = scope_n
        if scope_c:
            chat_parts.insert(0, ('pplx_scope', scope_c, None, su))
            r['pplx_scope_chat_answer'] = scope_c
        r['pplx_scope_nsfw_url'] = su
        merged_n, dec_n, src_n, para_n = merge_field(nsfw_parts)
        merged_c, dec_c, src_c, _ = merge_field(chat_parts)
        r['redflags_nsfw_answer'] = merged_n
        r['redflags_nsfw_decided_by'] = dec_n
        r['redflags_nsfw_sources'] = src_n
        r['redflags_chat_answer'] = merged_c
        r['redflags_chat_decided_by'] = dec_c
        r['redflags_chat_sources'] = src_c
        r['redflags_evidence_strength'] = 'paraphrase' if para_n else ''
        if para_n:
            paraphraseRows.append((cid, src_n))
        if merged_n == 'conflict':
            conflictRows['nsfw'].append((cid, src_n))
        if merged_c == 'conflict':
            conflictRows['chat'].append((cid, src_c))

        # -------------------------------------------------- flags union
        per_type = {}
        for m in rec_any:
            rec = mrecs[m]
            for rf in (rec.get('red_flags') or []):
                t = (rf.get('type') or '?').strip() or '?'
                e = per_type.setdefault(t, {'sources': [], 'per_model': [], 'claims': []})
                e['per_model'].append({'model': prefixes[m], 'summary': (rf.get('summary') or '')[:600],
                                       'independent_users': rf.get('independent_users'),
                                       'status': rf.get('status')})
                if rf.get('status') == 'recurring':
                    e['claims'].append(f'{prefixes[m]}: status recurring')
                elif (rf.get('independent_users') or 0) >= 2:
                    e['claims'].append(f'{prefixes[m]}: declared {rf.get("independent_users")} users')
                for s in (rf.get('sources') or []):
                    if not s:
                        continue
                    e['sources'].append({'url': s.get('url') or '', 'source_type': s.get('source_type') or '',
                                         'date_shown': s.get('date_shown') or '',
                                         'accessed': s.get('accessed') or '', 'verbatim': bool(s.get('verbatim'))})
        merged_flags, row_downgrades = [], 0
        for t, e in sorted(per_type.items()):
            sset, ordered = {}, []
            for s in e['sources']:
                k = (norm_url(s['url']), s['source_type'])
                if k in sset:
                    continue
                h = host_of(s['url']).lower()
                s2 = dict(s)
                s2['blocked_review_site'] = bool(h) and any(b in h for b in REVIEW_BLOCK)
                sset[k] = s2
                ordered.append(s2)
            n_users, handles, n_units, n_blocked = recount_users(ordered)
            dgs = [{'claim': cl, 'recounted_users': n_users} for cl in e['claims'] if n_users < 2]
            status = 'recurring' if n_users >= 2 else 'isolated'
            if dgs:
                downgrades.append({'platform': slugify(r['canonical_name']), 'type': t,
                                   'downgraded': dgs, 'new_status': status})
                row_downgrades += 1
            merged_flags.append({'type': t, 'status': status, 'independent_users': n_users,
                                 'named_handles': handles, 'distinct_source_units': n_units,
                                 'blocked_review_site_sources': n_blocked,
                                 'downgraded_claims': dgs,
                                 'recurring_claims_from_models': e['claims'],
                                 'sources': ordered, 'per_model': e['per_model']})
        fams = sorted({(mrecs[m].get('white_label_family') or '').strip() for m in rec_any
                       if (mrecs[m].get('white_label_family') or '').strip()})
        if fams:
            fam_counter[' | '.join(fams)] += 1
        r['redflags_flag_types'] = '|'.join(x['type'] for x in merged_flags)
        r['redflags_flag_count'] = str(len(merged_flags))
        r['redflags_recurring_count'] = str(sum(1 for x in merged_flags if x['status'] == 'recurring'))
        r['redflags_isolated_count'] = str(sum(1 for x in merged_flags if x['status'] == 'isolated'))
        r['redflags_downgraded_count'] = str(row_downgrades)
        r['redflags_white_label_family'] = ' | '.join(fams)
        r['redflags_coverage'] = 'not_researched' if not merged_flags else 'researched'
        if not merged_flags and r['scope_decision'] in ('in', 'borderline'):
            not_researched.append(cid)
        flag_docs[cid] = {
            'canonical_id': slugify(r['canonical_name']), 'platform': r['canonical_name'],
            'flags': merged_flags,
            'excluded_accounts': [ex for m in rec_any for ex in (mrecs[m].get('excluded_accounts') or [])],
            'white_label_union': fams,
            'joined_models': rec_any,
        }

        # -------------------------------------------------- resolution
        if r['scope_pending'] == 'true':
            r['redflags_scope_decision_before'] = 'borderline'
            r['redflags_rule_before'] = r['rule_applied'] or ''
            r['redflags_pending_before'] = 'true'
            chat_no_urls = [u for _, a, _, u in chat_parts if a == 'no' and u]
            nsfw_no_urls = [u for _, a, _, u in nsfw_parts if a == 'no' and u]
            left = (r['rule_applied'][:200] + '...') if r['rule_applied'] and len(r['rule_applied']) > 200 else (r['rule_applied'] or '')
            if merged_n == 'yes' and merged_c != 'no' and not chat_no_urls:
                why = (f'red-flag resolution ({D}): merged nsfw_first_party=yes '
                       f'(decided_by={dec_n or "none"}, evidence_strength={r["redflags_evidence_strength"] or "verbatim-or-unknown"}) '
                       f'AND chat_without_image_credits!=no -> in')
                r['rule_applied'] = (left + ' | ' + why).strip(' |')
                r['scope_decision'] = 'in'
                r['scope_pending'] = 'false'
                pending_res['in'].append({'platform': slugify(r['canonical_name']), 'decided_by': dec_n,
                                          'paraphrase': bool(para_n)})
            elif (merged_n == 'no' and nsfw_no_urls) or (merged_c == 'no' and chat_no_urls):
                fld = 'nsfw_first_party' if (merged_n == 'no' and nsfw_no_urls) else 'chat_without_image_credits'
                urls = nsfw_no_urls if (merged_n == 'no' and nsfw_no_urls) else chat_no_urls
                why = (f'red-flag resolution ({D}): first-party failure evidence on {fld} '
                       f'(url={"; ".join(urls)[:300]}) -> out')
                r['rule_applied'] = (left + ' | ' + why).strip(' |')
                r['scope_decision'] = 'out'
                r['scope_pending'] = 'false'
                pending_res['out'].append({'platform': slugify(r['canonical_name']), 'field': fld, 'urls': urls})
            else:
                why = (f'red-flag resolution ({D}): merged nsfw={merged_n} / chat={merged_c} '
                       f'without first-party failure evidence -> stays borderline (deep pass)')
                r['rule_applied'] = (left + ' | ' + why).strip(' |')
                pending_res['stays'].append({'platform': slugify(r['canonical_name'])})

    # --------------------------------------------------------------- writes
    added = []
    for m in models:
        p = prefixes[m]
        added += [f'{p}_nsfw_answer', f'{p}_chat_answer']
    added += ['redflags_nsfw_answer', 'redflags_nsfw_decided_by', 'redflags_nsfw_sources',
             'redflags_chat_answer', 'redflags_chat_decided_by', 'redflags_chat_sources',
             'redflags_evidence_strength', 'redflags_coverage', 'redflags_flag_types',
             'redflags_flag_count', 'redflags_recurring_count', 'redflags_isolated_count',
             'redflags_downgraded_count', 'redflags_white_label_family',
             'pplx_scope_nsfw_answer', 'pplx_scope_chat_answer', 'pplx_scope_nsfw_url',
             'redflags_scope_decision_before', 'redflags_rule_before', 'redflags_pending_before']
    cols = base_cols + added
    for r in scoped:
        for c in cols:
            if c not in r:
                r[c] = ''
            elif r[c] is None:
                r[c] = ''
    with open(os.path.join(OUT, 'scoped.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for r in scoped:
            w.writerow({k: v for k, v in r.items() if k != '_gkey'})

    # per-model detail columns for redflags.csv
    ml_cols = []
    for m in models:
        p = prefixes[m]
        ml_cols += [f'{p}_nsfw_answer', f'{p}_nsfw_url', f'{p}_nsfw_verbatim', f'{p}_nsfw_quote',
                    f'{p}_chat_answer', f'{p}_chat_url', f'{p}_flag_types', f'{p}_flags_summary',
                    f'{p}_operator', f'{p}_white_label_family', f'{p}_notes']
    RF_COLS = (['canonical_id', 'platform'] + ml_cols +
               ['pplx_scope_nsfw_answer', 'pplx_scope_chat_answer', 'pplx_scope_nsfw_url',
                'merged_nsfw_answer', 'merged_nsfw_decided_by', 'merged_nsfw_sources',
                'merged_chat_answer', 'merged_chat_decided_by', 'merged_chat_sources',
                'evidence_strength', 'coverage', 'flag_types', 'flag_count', 'recurring_count',
                'isolated_count', 'downgraded_count', 'white_label_union', 'flags_json'])
    with open(os.path.join(OUT, 'redflags.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=RF_COLS, extrasaction='ignore')
        w.writeheader()
        for r in scoped:
            cid = slugify(r['canonical_name'])
            doc = flag_docs.get(cid)
            if doc is None or not doc['joined_models']:
                continue
            row = {'canonical_id': doc['canonical_id'], 'platform': r['canonical_name']}
            for m in models:
                p = prefixes[m]
                rec = model_records[m].get(cid)
                if rec is None:
                    for extra in ('nsfw_answer', 'nsfw_url', 'nsfw_verbatim', 'nsfw_quote', 'chat_answer',
                                  'chat_url', 'flag_types', 'flags_summary', 'operator', 'white_label_family', 'notes'):
                        row[f'{p}_{extra}'] = ''
                    continue
                nsfw = rec.get('nsfw_first_party') or {}
                chat = rec.get('chat_without_image_credits') or {}
                row[f'{p}_nsfw_answer'] = nsfw.get('answer') or ''
                row[f'{p}_nsfw_url'] = nsfw.get('url') or ''
                row[f'{p}_nsfw_verbatim'] = {True: 'true', False: 'false'}.get(nsfw.get('verbatim'), '')
                row[f'{p}_nsfw_quote'] = (nsfw.get('quote_or_paraphrase') or '')[:400]
                row[f'{p}_chat_answer'] = chat.get('answer') or ''
                row[f'{p}_chat_url'] = chat.get('url') or ''
                fts, summ = [], []
                for rf in (rec.get('red_flags') or []):
                    fts.append(rf.get('type') or '?')
                    summ.append(f"{rf.get('type') or '?'}[{rf.get('status')}|{rf.get('independent_users')}u]: {(rf.get('summary') or '')[:180]}")
                row[f'{p}_flag_types'] = '|'.join(fts)
                row[f'{p}_flags_summary'] = ' || '.join(summ)
                row[f'{p}_operator'] = rec.get('operator') or ''
                row[f'{p}_white_label_family'] = rec.get('white_label_family') or ''
                row[f'{p}_notes'] = (rec.get('notes') or '')[:900]
            row.update({'pplx_scope_nsfw_answer': r.get('pplx_scope_nsfw_answer') or '',
                        'pplx_scope_chat_answer': r.get('pplx_scope_chat_answer') or '',
                        'pplx_scope_nsfw_url': r.get('pplx_scope_nsfw_url') or '',
                        'merged_nsfw_answer': r['redflags_nsfw_answer'],
                        'merged_nsfw_decided_by': r['redflags_nsfw_decided_by'],
                        'merged_nsfw_sources': r['redflags_nsfw_sources'],
                        'merged_chat_answer': r['redflags_chat_answer'],
                        'merged_chat_decided_by': r['redflags_chat_decided_by'],
                        'merged_chat_sources': r['redflags_chat_sources'],
                        'evidence_strength': r['redflags_evidence_strength'],
                        'coverage': r['redflags_coverage'],
                        'flag_types': r['redflags_flag_types'],
                        'flag_count': r['redflags_flag_count'],
                        'recurring_count': r['redflags_recurring_count'],
                        'isolated_count': r['redflags_isolated_count'],
                        'downgraded_count': r['redflags_downgraded_count'],
                        'white_label_union': doc['white_label_union'] and ' | '.join(doc['white_label_union']) or '',
                        'flags_json': json.dumps(doc['flags'], ensure_ascii=False)})
            w.writerow(row)

    # ----------------------------------------------------------- deep pass
    def weakness_reasons(r):
        rs = []
        if r.get('redflags_nsfw_answer') == 'unresolved':
            rs.append('nsfw_unresolved')
        if r.get('redflags_nsfw_answer') == 'conflict':
            rs.append('nsfw_conflict')
        if r.get('redflags_chat_answer') == 'conflict':
            rs.append('chat_conflict')
        if r.get('redflags_coverage') == 'not_researched':
            rs.append('coverage_not_researched')
        if r.get('redflags_evidence_strength') == 'paraphrase':
            rs.append('nsfw_yes_paraphrase_only')
        return rs
    def prominence_reasons(r):
        rs = []
        band = (r.get('usage_band') or '').strip().upper()
        if band in ('A', 'B', 'C'):
            rs.append(f'band_{band}')
        if to_int(r.get('community_users_A')) + to_int(r.get('community_users_B')) >= 3:
            rs.append(f'community_users_{to_int(r.get("community_users_A")) + to_int(r.get("community_users_B"))}')
        if to_int(r.get('supply_runs_count')) >= 3:
            rs.append(f'supply_runs_{to_int(r.get("supply_runs_count"))}')
        if (r.get('scope_pending') or '') == 'true':
            rs.append('scope_pending')
        return rs

    deep = []
    for r in scoped:
        if r.get('scope_decision') == 'out':
            continue
        wk = weakness_reasons(r)
        if not wk:
            continue
        pr = prominence_reasons(r)
        conf = 'nsfw_conflict' in wk or 'chat_conflict' in wk
        # Owner instruction 2026-11-03: a paraphrase-only weakness is sustained
        # ONLY by usage band A/B/C or supply_runs >= 3 (community-only or
        # scope_pending prominence no longer suffices). Rows carrying any other
        # weakness keep the previous gate; conflicts still bypass it.
        tight = ((r.get('usage_band') or '').strip().upper() in ('A', 'B', 'C')
                 or to_int(r.get('supply_runs_count')) >= 3)
        other_wk = [w for w in wk if w != 'nsfw_yes_paraphrase_only']
        if not other_wk and not conf:
            if not tight:
                continue
        elif not pr and not conf:
            continue
        deep.append({'row': r, 'weakness': wk, 'prominence': pr, 'conflict_override': conf})
    deep_rows = [d['row'] for d in sorted(deep, key=lambda d: slugify(d['row']['canonical_name']))]

    lines = ['canonical_id|name|primary_domain|category_id|scope_pending|store_build_may_differ']
    for r in deep_rows:
        lines.append('|'.join([
            slugify(r['canonical_name']),
            r['canonical_name'],
            r.get('url_domain') or '',
            r.get('category_id') or '',
            'true' if r.get('scope_pending') == 'true' else 'false',
            'true' if 'store_build_may_differ' in (r.get('usage_notes') or '') else 'false',
        ]))
    with open(os.path.join(OUT, 'redflags-deep-pass-input.txt'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')

    prompt_text = open(DEEP_PROMPT_PATH, encoding='utf-8').read().strip()
    for fn in sorted(os.listdir(OUT)):   # delete stale higher-numbered prompts first
        if fn.startswith('redflags-deep-prompt-') and fn.endswith('.txt'):
            os.remove(os.path.join(OUT, fn))
    n_prompts = 0
    for i in range(0, max(len(lines) - 1, 0), MAX_PER_DEEP_FILE):
        rows_chunk = lines[1 + i:1 + i + MAX_PER_DEEP_FILE]
        n_prompts += 1
        with open(os.path.join(OUT, f'redflags-deep-prompt-{n_prompts}.txt'), 'w', encoding='utf-8') as fh:
            fh.write(prompt_text + '\n\n' + DEEP_EXTRA_LINE + '\n\nPLATFORMS:\n' + lines[0] + '\n' + '\n'.join(rows_chunk) + '\n')

    # ------------------------------------------------------------- report
    rep = ['# Red flags report', '', f'Generated: {D}', '',
           'Idempotent: rebuilt from scratch every run; scope-pass -> scope-resolve ->',
           'redflags-ingest is the required pipeline order for merged/scoped.csv.', '',
           '## Model sources', '']
    if parse_failures:
        rep += ['| file | issue |', '|---|---|']
        for f in parse_failures:
            rep.append(f"| {f['file']} | {f['issue']} |")
        rep.append('')
    rep.append('| model | prefix | file(s) | records parsed | rows joined |')
    rep.append('|---|---|---|---|---|')
    for m in models:
        filelist = ', '.join(sorted({os.path.basename(p) for mm, n, p in srcs if mm == m}))
        rep.append(f'| {m} | {prefixes[m]} | {filelist} | {parsed_count[m]} | '
                   f'{sum(1 for r in scoped if r.get(f"{prefixes[m]}_nsfw_answer"))} |')
    rep += ['', f'Records that did not join any scoped row: {len(unmatched_records)}' +
            (': ' + ', '.join(unmatched_records) if unmatched_records else ''),
            f'Parse/log failures: {len(parse_failures)}' + ('; see table above' if parse_failures else ''), '']

    cov = {m: Counter() for m in models}
    for r in scoped:
        for m in models:
            p = prefixes[m]
            a1 = r.get(f'{p}_nsfw_answer')
            a2 = r.get(f'{p}_chat_answer')
            if a1:
                cov[m]['nsfw_' + a1] += 1
            if a2:
                cov[m]['chat_' + a2] += 1
    rep += ['## Per-model answer coverage (joined rows)', '', '| model | nsfw yes | nsfw no | nsfw unresolved | chat yes | chat no | chat unresolved |', '|---|---|---|---|---|---|---|']
    for m in models:
        c = cov[m]
        rep.append(f"| {prefixes[m]} | {c.get('nsfw_yes', 0)} | {c.get('nsfw_no', 0)} | {c.get('nsfw_unresolved', 0)} | "
                   f"{c.get('chat_yes', 0)} | {c.get('chat_no', 0)} | {c.get('chat_unresolved', 0)} |")
    rep += ['', 'pplx_scope = census-scope-checks-perplexity.json Test A first-party answers as executed by',
            'scope-resolve.py (chat part -> chat_without_image_credits, NSFW part -> nsfw_first_party;',
            f'soulkyn kept unresolved per that record itself; {sum(1 for r in scoped if r.get("pplx_scope_nsfw_answer"))} nsfw plus '
            f'{sum(1 for r in scoped if r.get("pplx_scope_chat_answer"))} chat contributions joined).', '',
            '## Merged counts (all scoped rows joined by any model)', '']
    nscw = Counter(r.get('redflags_nsfw_answer') or 'no-record' for r in scoped if r.get('scope_decision') in ('in', 'borderline'))
    cscw = Counter(r.get('redflags_chat_answer') or 'no-record' for r in scoped if r.get('scope_decision') in ('in', 'borderline'))
    rep += [f'- merged nsfw_first_party (in+borderline rows): ' + ', '.join(f'{k}={v}' for k, v in sorted(nscw.items())),
            f'- merged chat_without_image_credits (in+borderline rows): ' + ', '.join(f'{k}={v}' for k, v in sorted(cscw.items())),
            f'- nsfw yes rows whose only yes sources are non-verbatim (evidence_strength=paraphrase): {len(paraphraseRows)}', '',
            '## Conflicts (resolved sources disagree — kept side by side)']
    for fld in ('nsfw', 'chat'):
        rowsx = conflictRows[fld]
        rep += ['', f'### {fld} field: {len(rowsx)} row(s)', '', '| platform | merged answer sources |', '|---|---|'] if rowsx else ['', f'### {fld} field: 0 rows', '']
        for cid, srcs_str in rowsx:
            rep.append(f'| {cid} | {srcs_str} |')
    rep += ['', 'Conflict rows go to the deep pass regardless of prominence (owner instruction:', 'resolved-source disagreement cannot be collapsed silently).', '']

    rep += ['## Downgraded flags (model claimed recurring/2+ users, recount below that)', '',
            'Recount method: each username counted once; usernames come from named handles', '(reddit /user/ patterns) plus one user per distinct non-blocked', 'independent_user source URL — conservative; Reddit thread URLs with several', 'complainers inside count as ONE unit until named-handle evidence exists.', 'Affiliate/review-site domains never count: ' + ', '.join(REVIEW_BLOCK) + '.',
            '', f'Downgraded flags: {len(downgrades)}']
    if downgrades:
        rep += ['', '| platform | flag | new status | downgraded claims |', '|---|---|---|---|']
        for dg in downgrades:
            cl = '; '.join(f"{d['claim']} -> {d['recounted_users']} users" for d in dg['downgraded'])
            rep.append(f"| {dg['platform']} | {dg['type']} | {dg['new_status']} | {cl} |")

    rep += ['', '## Coverage', '',
            f"- rows with at least one unioned flag (coverage=researched): {sum(1 for r in scoped if r.get('redflags_coverage') == 'researched')}",
            f"- rows with zero flags from every model (coverage=not_researched — never 'clean'): {len(not_researched)}"]

    rep += ['', '## scope_pending resolutions', '',
            f'- pending rows at run start: {sum(len(v) for v in pending_res.values())}',
            f'- resolved in: {len(pending_res["in"])}',
            f'- resolved out (first-party failure evidence): {len(pending_res["out"])}',
            f'- stayed borderline: {len(pending_res["stays"])}',
            f'- final scope_pending=true rows: {sum(1 for r in scoped if r.get("scope_pending") == "true")}']
    if pending_res['in']:
        rep += ['', '| resolved in | decided_by | of which paraphrase-only yes |', '|---|---|---|']
        for p0 in pending_res['in']:
            rep.append(f"| {p0['platform']} | {p0['decided_by'] or 'none'} | {'yes' if p0['paraphrase'] else ''} |")
    if pending_res['out']:
        rep += ['', '| resolved out | field | evidence urls |', '|---|---|---|']
        for p0 in pending_res['out']:
            rep.append(f"| {p0['platform']} | {p0['field']} | {'; '.join(p0['urls'])[:300]} |")
    if pending_res['stays']:
        rep += ['', 'Stayed borderline: ' + ', '.join(p0['platform'] for p0 in pending_res['stays'])]

    nfam = sum(1 for r in scoped if r.get('redflags_white_label_family'))
    rep += ['', '## White-label families (union across models)', '']
    if fam_counter:
        rep += ['| family | rows |', '|---|---|']
        for fam, c in fam_counter.most_common():
            rep.append(f'| {fam} | {c} |')
    else:
        rep += ['None reported.', '']

    rep += ['', '## Deep pass inputs', '',
            f'- deep-pass rows: {len(deep_rows)} (weakness criteria: merged nsfw unresolved/conflict,',
            '  chat conflict, coverage not_researched, nsfw-paraphrase-only; AND prominence: usage',
            '  band A/B/C OR community users A+B>=3 OR supply_runs>=3 OR scope_pending; conflicts',
            '  bypass the prominence gate; a paraphrase-only weakness is sustained ONLY by band',
            '  A/B/C or supply_runs>=3 — community-only or scope_pending prominence no longer',
            '  suffices for it — owner instruction 2026-11-03)',
            f'- outputs: merged/redflags-deep-pass-input.txt; {n_prompts} prompt file(s) '
            f'merged/redflags-deep-prompt-1..{max(n_prompts, 1)}.txt (max {MAX_PER_DEEP_FILE} platforms per file; '
            'stale higher-numbered files deleted each run)']
    if deep_rows:
        wk_counts = Counter(rsn for d in deep for rsn in d['weakness'])
        rep += ['', '| weakness triggers | count |', '|---|---|']
        for k, v in sorted(wk_counts.items()):
            rep.append(f'| {k} | {v} |')
        n_over = sum(1 for d in deep if d['conflict_override'])
        rep += ['', f'Rows entering via the conflict bypass (no band/community/supply/pending): {n_over}']
    rep += ['', '## Output files', '',
            '- merged/redflags.csv (per-model answer columns, merged fields with decided_by + sources,',
            '  union flags with recount + downgrade audit trail, flags_json)',
            f"- merged/redflags-deep-pass-input.txt ({len(deep_rows)} rows)",
            f'- merged/redflags-deep-prompt-1..{max(n_prompts, 1)}.txt' if n_prompts else '- (no deep prompt files: zero deep rows)',
            '- merged/scoped.csv (joined summary columns; full detail lives in redflags.csv)',
            '- v2/research/method/03-red-flags-prompt.txt remains the verbatim prompt; deep prompts add',
            '  the in-depth research line above each PLATFORMS list', '']
    open(os.path.join(OUT, 'REDFLAGS-REPORT.md'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')

    # -------------------------------------------------------------- summary
    rows_per_batch = Counter()
    print(f'ingested models: {", ".join(f"{m}->{prefixes[m]}" for m in models)} | '
          f'records: {", ".join(str(len(model_records[m])) for m in models)} | '
          f'failures: {len(parse_failures)} | unmatched records: {len(unmatched_records)}')
    decs = Counter(r['scope_decision'] for r in scoped)
    print(f"scoped rows: {len(scoped)} | decisions: {dict(sorted(decs.items()))} | "
          f"scope_pending true: {sum(1 for r in scoped if r.get('scope_pending') == 'true')}")
    print(f"merged nsfw (in+bord): {dict(sorted(nscw.items()))} | merged chat: {dict(sorted(cscw.items()))} | "
          f"paraphrase-only yes: {len(paraphraseRows)}")
    print(f'flags union: {sum(len(d["flags"]) for d in flag_docs.values())} across '
          f'{sum(1 for d in flag_docs.values() if d["flags"])} rows | downgrades: {len(downgrades)} | '
          f'not_researched: {len(not_researched)}')
    print(f'deep pass rows: {len(deep_rows)} in {n_prompts} prompt file(s) (max {MAX_PER_DEEP_FILE}/file)')
    print('scope_pending resolutions: in ' + str(len(pending_res['in'])) + ', out ' + str(len(pending_res['out'])) +
          ', stays ' + str(len(pending_res['stays'])))


if __name__ == '__main__':
    main()
