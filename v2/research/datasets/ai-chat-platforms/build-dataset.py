# -*- coding: utf-8 -*-
"""Build the AI chat/companion category dataset from the merged pipeline outputs.

Reads:  v2/research/runs/2026-10-27-ai-companions/merged/{scoped.csv, redflags.csv}
Writes: platforms.csv + platforms.json (next to this script); README.md is a
curated static document of the rules at build time.

One row per platform whose merged scope decision is in/borderline (hosted
sign-up-and-chat category; BYO-model frontends are ranked separately under /ai;
out rows are excluded). Descriptive facts + evidence only — NOT a ranking;
aggregator facts never set rank and affiliate status is a site-level concern
(not in this dataset). Every value traces to a research record in the run's
merged/ outputs; empty means "no evidence found", never a guess. Idempotent:
each run rebuilds both files from scratch to byte-identical content.

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
"""
import csv, json, os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
RUN = os.path.abspath(os.path.join(HERE, '..', '..', 'runs', '2026-10-27-ai-companions', 'merged'))
D = '2026-11-04'


def slugify(name):
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '-', (name or '').lower()).strip('-')
    return s or 'unknown'


def main():
    scoped = list(csv.DictReader(open(os.path.join(RUN, 'scoped.csv'), encoding='utf-8-sig')))
    rflags = list(csv.DictReader(open(os.path.join(RUN, 'redflags.csv'), encoding='utf-8-sig')))
    rf_by_slug = {r['canonical_id']: r for r in rflags}
    # model prefixes = answer columns in scoped.csv except the pplx_scope executed-checks source
    prefixes = sorted({re.match(r'^([a-z][a-z0-9_]*)_(nsfw|chat)_answer$', c).group(1)
                       for c in scoped[0] if re.match(r'^([a-z][a-z0-9_]*)_(nsfw|chat)_answer$', c)}
                      - {'pplx_scope'})

    rows = []
    for s in scoped:
        if s['scope_decision'] not in ('in', 'borderline'):
            continue
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
        'description': ('Descriptive facts and evidence for every AI chat/companion platform with a '
                        'merged scope decision of in/borderline. NOT a ranking; empty = no evidence '
                        'found, never a guess. Rebuild with build-dataset.py (idempotent).'),
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
    print(f'dataset rows: {len(rows)} (in {dec.get("in", 0)} / borderline {dec.get("borderline", 0)})')
    print('confidence: ' + ', '.join(f'{k}={v}' for k, v in sorted(conf.items())))
    print('nsfw answers: ' + ', '.join(f'{k}={v}' for k, v in sorted(ns.items())))
    print('chat answers: ' + ', '.join(f'{k}={v}' for k, v in sorted(ch.items())))
    print(f'platforms with at least one recurring flag: {recur}')
    print(f'flags union: {sum(len(x["flags"]) for x in rows)} '
          f'(recurring {sum(1 for x in rows for f in x["flags"] if f["status"] == "recurring")} / '
          f'isolated {sum(1 for x in rows for f in x["flags"] if f["status"] == "isolated")})')


if __name__ == '__main__':
    main()
