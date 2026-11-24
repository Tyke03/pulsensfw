# -*- coding: utf-8 -*-
"""Build the AI chat/companion category dataset — the living research store.

Reads:  v2/research/runs/2026-10-27-ai-companions/merged/{scoped.csv, redflags.csv}
Writes: platforms.csv + platforms.json (next to this script); README.md is a
curated static document of the rules at build time.

Pipeline roles stay loose: research collects data (this store), the writer
forms an opinion (tools/brief.py prints brief.md from the store — no gates,
no scores), QC checks the result and kicks questions back into
research-queue.json (tools/qc-to-queue.py appends). The store itself is dumb
and auditable: descriptive facts + evidence only — NOT a ranking; aggregator
facts never set anything and affiliate status is a site-level concern.

Scope is an informational column, NOT a filter: one row per platform in the
research universe regardless of scope decision (in/borderline/out rows all
stored). Every value traces to a research record in the run's merged/
outputs and keeps its source + access date, so the store grows over time;
empty means "no evidence found", never a guess. Idempotent: each run
rebuilds both files from scratch to byte-identical content.

Non-shrink guard: a rebuild may only ADD evidence. If the fresh build would
silently lose a platform row, shrink a platform's source set or flag list,
or drop a previously recorded field (answers, verbatim flag, deep-file
provenance), the build fails with the exact deltas. Only an intentional
source retraction may override it, explicitly, with --allow-shrink (the
override is printed, never silent).

Rules of the underlying research (see README.md):
- research files are discovery/leads only; evidence sets rank nowhere;
- merged NSFW/chat fields: a resolved answer beats 'unresolved'; disagreements
  between sources stay side by side as 'conflict'; decided_by logs which
  source(s) decided; verbatim vs paraphrase evidence is labeled;
- red flags: union across models deduped by type; independent users recounted
  conservatively (named handles + one user per distinct independent_user URL);
  affiliate/review-site domains never count as users; 'recurring' needs 2+
  users, lower recounts downgrade the claim and are logged;
- zero flags from every model = coverage 'not_researched', never 'clean';
- records from the deep pass keep their source file (deep_files);
- confidence: high / medium / low as documented in README.md.
New research files: drop them into the run's merged/ (per the redflags
auto-discovery convention) and rerun the chain — unions keep older evidence.
"""
import argparse, csv, json, os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
RUN = os.path.abspath(os.path.join(HERE, '..', '..', 'runs', '2026-10-27-ai-companions', 'merged'))
D = '2026-11-04'


def slugify(name):
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '-', (name or '').lower()).strip('-')
    return s or 'unknown'


def community_users(s):
    """census community-evidence signal: distinct users observed, tier maxes summed (A + B).

    Tier A = strongest census quality, tier B = secondary. A user seen in both
    tiers is counted twice; treat as a lower-bound signal, not popularity.
    """
    def tier(c):
        v = (s.get(c) or '').strip()
        return int(v) if v.isdigit() else None
    a, b = tier('community_users_A'), tier('community_users_B')
    return '' if a is None and b is None else (a or 0) + (b or 0)


def truthy(v):
    return v is True or (isinstance(v, str) and v.strip().lower() == 'true')


def evidence_fingerprint(r):
    """the evidence content that must never silently shrink between rebuilds."""
    return {
        'n_sources': len(r.get('sources') or []),
        'n_flags': len(r.get('flags') or []),
        'has_nsfw': bool((r.get('nsfw_answer') or '') != ''),
        'has_chat': bool((r.get('chat_answer') or '') != ''),
        'has_flag_types': bool(r.get('flag_types')),
        'has_access_dates': bool(r.get('accessed_dates')),
        'nsfw_verbatim': truthy(r.get('nsfw_verbatim')),
        'has_deep_files': bool(r.get('deep_files')),
    }


def shrink_check(rows, allow_shrink):
    """a rebuild may only add evidence; report every loss exactly."""
    old_path = os.path.join(HERE, 'platforms.json')
    if not os.path.exists(old_path):
        return
    try:
        old = json.load(open(old_path, encoding='utf-8')).get('platforms') or []
    except (json.JSONDecodeError, OSError) as e:
        print(f'guard: previous platforms.json unreadable ({e}) — proceeding without shrink check')
        return
    if not old:
        return
    old_by_slug = {r.get('slug'): r for r in old}
    new_by_slug = {r['slug']: r for r in rows}
    problems = []
    lost = sorted(set(old_by_slug) - set(new_by_slug))
    if lost:
        problems.append(f'platform rows lost entirely: {lost}')
    for slug in sorted(set(old_by_slug) & set(new_by_slug)):
        o, n = evidence_fingerprint(old_by_slug[slug]), evidence_fingerprint(new_by_slug[slug])
        deltas = [f'{k}: {o[k]} -> {n[k]}' for k in o if n[k] < o[k] or (o[k] is True and n[k] is False)]
        if deltas:
            problems.append(f'  {slug}: ' + ', '.join(deltas))
        lost_src = sorted(set(old_by_slug[slug].get('sources') or []) -
                          set(new_by_slug[slug].get('sources') or []))
        if lost_src:
            problems.append(f'  {slug}: source URLs dropped: {lost_src}')
    if problems:
        print('NON-SHRINK GUARD: this rebuild would discard stored evidence:')
        for p in problems:
            print('  -', p)
        if allow_shrink:
            print('  -> skipped via explicit --allow-shrink (intentional source retraction; logged here).')
            return
        sys.exit('  -> refusing to write. Intentional retraction? rerun with --allow-shrink; '
                 'otherwise fix the research inputs so nothing is lost.')


def main():
    ap = argparse.ArgumentParser(description='Rebuild the ai-chat-platforms research store (idempotent, non-shrinking).')
    ap.add_argument('--allow-shrink', action='store_true',
                    help='explicit override when stored evidence is intentionally retracted upstream')
    args = ap.parse_args()

    scoped = list(csv.DictReader(open(os.path.join(RUN, 'scoped.csv'), encoding='utf-8-sig')))
    rflags = list(csv.DictReader(open(os.path.join(RUN, 'redflags.csv'), encoding='utf-8-sig')))
    rf_by_slug = {r['canonical_id']: r for r in rflags}
    # model prefixes = answer columns in scoped.csv except the pplx_scope executed-checks source
    prefixes = sorted({re.match(r'^([a-z][a-z0-9_]*)_(nsfw|chat)_answer$', c).group(1)
                       for c in scoped[0] if re.match(r'^([a-z][a-z0-9_]*)_(nsfw|chat)_answer$', c)}
                      - {'pplx_scope'})

    rows = []
    for s in scoped:                       # every row in the research universe — no scope filter
        rf = rf_by_slug.get(slugify(s['canonical_name']), {})
        flags = json.loads(rf['flags_json']) if rf.get('flags_json') else []
        # sources: NSFW/chat answer URLs (per model + executed checks) + flag source URLs
        urls, dates = [], []
        seen = set()
        for col in ('pplx_scope_nsfw_url', *(f'{p}_nsfw_url' for p in prefixes), *(f'{p}_chat_url' for p in prefixes)):
            u = (rf.get(col) or '').strip() or (s.get(col) or '').strip()
            if not u:
                continue
            k = u.lower().rstrip('/')
            if k in seen:
                continue
            seen.add(k)
            urls.append(u)
        for f in flags:
            for src in f.get('sources') or []:
                u = (src.get('url') or '').strip()
                if u and u.lower().rstrip('/') not in seen:
                    seen.add(u.lower().rstrip('/'))
                    urls.append(u)
                ad = (src.get('accessed') or '').strip()
                if ad and ad not in dates:
                    dates.append(ad)
        rows.append({
            'slug': slugify(s['canonical_name']),
            'name': s['canonical_name'],
            'domain': s.get('url_domain') or '',
            'category': s.get('category_id') or '',
            'usage_band': s.get('usage_band') or '',
            'supply_runs': s.get('supply_runs_count') or '',
            'community_users': community_users(s),
            'scope_decision': s['scope_decision'],
            'scope_pending': 'true' if s.get('scope_pending') == 'true' else 'false',
            'nsfw_answer': s.get('redflags_nsfw_answer') or '',
            'nsfw_decided_by': s.get('redflags_nsfw_decided_by') or '',
            'nsfw_verbatim': s.get('redflags_nsfw_verbatim') or '',
            'evidence_strength': s.get('redflags_evidence_strength') or '',
            'chat_answer': s.get('redflags_chat_answer') or '',
            'chat_decided_by': s.get('redflags_chat_decided_by') or '',
            'coverage': s.get('redflags_coverage') or '',
            'confidence': s.get('redflags_confidence') or '',
            'flag_types': s.get('redflags_flag_types') or '',
            'flag_count': s.get('redflags_flag_count') or '',
            'recurring_count': s.get('redflags_recurring_count') or '',
            'isolated_count': s.get('redflags_isolated_count') or '',
            'downgraded_count': s.get('redflags_downgraded_count') or '',
            'white_label_family': s.get('redflags_white_label_family') or '',
            'deep_files': s.get('redflags_deep_files') or '',
            'sources': sorted(urls),
            'accessed_dates': sorted(dates),
            'flags': flags,
        })
    rows.sort(key=lambda x: x['slug'])

    shrink_check(rows, args.allow_shrink)

    csv_cols = [c for c in rows[0] if c != 'flags']
    with open(os.path.join(HERE, 'platforms.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=csv_cols, extrasaction='ignore')
        w.writeheader()
        for x in rows:
            flat = {**{k: v for k, v in x.items() if k not in ('sources', 'accessed_dates')},
                    'sources': ' | '.join(x['sources']),
                    'accessed_dates': ' | '.join(x['accessed_dates'])}
            w.writerow(flat)

    def jval(v):
        if isinstance(v, list):
            return [jval(x) for x in v]
        if isinstance(v, dict):
            return {k: jval(x) for k, x in v.items()}
        if v == '':
            return None
        if v == 'true':
            return True
        if v == 'false':
            return False
        if isinstance(v, str) and re.match(r'^\d+$', v):
            return int(v)
        return v

    json_doc = {
        'dataset': 'ai-chat-platforms',
        'built': D,
        'source_run': '2026-10-27-ai-companions',
        'source_files': ['merged/scoped.csv', 'merged/redflags.csv'],
        'description': ('Living research store: descriptive facts and evidence for every platform in the '
                        'research universe regardless of scope decision. NOT a ranking; empty = no '
                        'evidence found, never a guess. Scope is a column, not a filter. Rebuild with '
                        'build-dataset.py (idempotent, refuses to shrink stored evidence without '
                        '--allow-shrink).'),
        'scope_note': ('scope_decision (in/borderline/out) is informational: filtering for a specific use '
                       'happens in consumers (e.g. rank-config.json eligibility or the writer), never here.'),
        'queue_file': 'research-queue.json',
        'writer_tool': 'v2/research/tools/brief.py',
        'rows': len(rows),
        'platforms': [{k: jval(v) for k, v in x.items()} for x in rows],
    }
    with open(os.path.join(HERE, 'platforms.json'), 'w', encoding='utf-8') as fh:
        json.dump(json_doc, fh, ensure_ascii=False, indent=1)
        fh.write('\n')

    # ------------------------------------------------------------- summary
    dec = {}
    for x in rows:
        dec[x['scope_decision']] = dec.get(x['scope_decision'], 0) + 1
    conf = {}
    ns = {}
    ch = {}
    recur = 0
    for x in rows:
        conf[x['confidence']] = conf.get(x['confidence'], 0) + 1
        ns[x['nsfw_answer']] = ns.get(x['nsfw_answer'], 0) + 1
        ch[x['chat_answer']] = ch.get(x['chat_answer'], 0) + 1
        recur += 1 if int(x['recurring_count'] or 0) > 0 else 0
    print(f'dataset rows: {len(rows)} (in {dec.get("in", 0)} / borderline {dec.get("borderline", 0)} / '
          f'out {dec.get("out", 0)}) — scope stored, not filtered')
    print('confidence: ' + ', '.join(f'{k}={v}' for k, v in sorted(conf.items())))
    print('nsfw answers: ' + ', '.join(f'{k}={v}' for k, v in sorted(ns.items())))
    print('chat answers: ' + ', '.join(f'{k}={v}' for k, v in sorted(ch.items())))
    print(f'platforms with at least one recurring flag: {recur}')
    print(f'flags union: {sum(len(x["flags"]) for x in rows)} '
          f'(recurring {sum(1 for x in rows for f in x["flags"] if f["status"] == "recurring")} / '
          f'isolated {sum(1 for x in rows for f in x["flags"] if f["status"] == "isolated")})')


if __name__ == '__main__':
    main()
