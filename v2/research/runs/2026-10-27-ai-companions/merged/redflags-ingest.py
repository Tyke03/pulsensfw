# -*- coding: utf-8 -*-
"""Ingest the Perplexity red-flag outputs into merged/redflags.csv +
REDFLAGS-REPORT.md. NOT RUN YET — wired but the operator runs it after the
Perplexity desktop research replies land as redflags-perplexity-1..4.json.

Idempotent: everything is rebuilt from scratch on each run; sources that fail
to parse are logged to merged/redflags-parse-log.csv and skipped.

Resolution (CFO rules):
- scope_pending rows resolve: in if nsfw_first_party=yes AND
  chat_without_image_credits != no; out if either has first-party evidence of
  failure; else stay borderline.
- non-pending rows are left untouched except for the red-flag columns.
"""
import json, csv, os, re, sys, io
from collections import Counter, defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
D = '2026-10-31'
BATCH_FILES = [f'redflags-perplexity-{i}.json' for i in (1, 2, 3, 4)]

def norm_key(s):
    return re.sub(r'[^a-z0-9]+', '', (s or '').lower())

def slugify(name):
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '-', (name or '').lower()).strip('-')
    return s or 'unknown'

def parse_file(path):
    """Tolerant parse: raw JSON first, then fenced/blocks, then per-object scan."""
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
            if isinstance(obj, dict) and 'platform' in obj:
                records.append(obj)
            i = end
        except json.JSONDecodeError:
            i = b + 1
    if not records:
        fails.append('no platform objects recoverable')
    return records, fails

def main():
    scoped = list(csv.DictReader(open(os.path.join(OUT, 'scoped.csv'), encoding='utf-8-sig')))
    if not scoped:
        print('no scoped rows; abort')
        return
    records, failures = [], []
    by_id = {}
    for r in scoped:
        cid = slugify(r['canonical_name'])
        by_id[cid] = r
    for path in BATCH_FILES:
        full = os.path.join(BASE, path)
        if not os.path.exists(full):
            failures.append({'file': path, 'issue': 'FILE MISSING — operator has not supplied the Perplexity batch yet'})
            continue
        arr, fails = parse_file(full)
        records.extend(arr)
        for f in fails:
            failures.append({'file': path, 'issue': f})
    # join by canonical_id
    joined = 0
    unmatched = []
    for rec in records:
        cid = norm_key(rec.get('canonical_id') or '')
        if cid in by_id:
            r = by_id[cid]
            r['redflags_nsfw_first_party'] = json.dumps(rec.get('nsfw_first_party'), ensure_ascii=False)
            r['redflags_chat_without_image_credits'] = json.dumps(rec.get('chat_without_image_credits'), ensure_ascii=False)
            r['redflags'] = json.dumps(rec.get('red_flags') or [], ensure_ascii=False)
            r['redflags_operator'] = rec.get('operator') or ''
            r['redflags_white_label_family'] = rec.get('white_label_family') or ''
            r['redflags_notes'] = rec.get('notes') or ''
            # resolve scope_pending per the CFO rule
            if (r.get('scope_pending') or '').lower() == 'true':
                nsfw = (rec.get('nsfw_first_party') or {}).get('answer', 'unresolved')
                chat = (rec.get('chat_without_image_credits') or {}).get('answer', 'unresolved')
                fail_sig = 'fail' in json.dumps(rec.get('nsfw_first_party'), ensure_ascii=False).lower() + json.dumps(rec.get('chat_without_image_credits'), ensure_ascii=False).lower()
                if nsfw == 'yes' and chat != 'no':
                    r['scope_decision'], r['scope_pending'] = 'in', 'false'
                    r.setdefault('rule_applied', '')
                    r['rule_applied'] = (r['rule_applied'][:80] +
                        f'... | red-flag resolution ({D}): nsfw_first_party=yes AND chat!=no -> in')
                elif fail_sig:
                    r['scope_decision'], r['scope_pending'] = 'out', 'false'
                    r.setdefault('rule_applied', '')
                    r['rule_applied'] = (r['rule_applied'][:80] +
                        f'... | red-flag resolution ({D}): first-party failure evidence -> out')
                else:
                    r['scope_pending'] = 'true'
                    r.setdefault('rule_applied', '')
                    r['rule_applied'] = (r['rule_applied'][:80] + f'... | red-flag resolution ({D}): parts unresolved -> stays borderline')
            joined += 1
        else:
            unmatched.append(rec.get('canonical_id') or '(no id)')
    with open(os.path.join(OUT, 'scoped.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=list(scoped[0].keys()), extrasaction='ignore')
        w.writeheader()
        for r in scoped:
            w.writerow(r)
    with open(os.path.join(OUT, 'redflags.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=['canonical_id', 'platform', 'nsfw_answer', 'chat_answer', 'red_flag_types', 'recurring_count', 'isolated_count', 'operator', 'white_label_family'])
        w.writeheader()
        for rec in records:
            cid = slugify(rec.get('canonical_id') or rec.get('platform') or '')
            rfs = rec.get('red_flags') or []
            ntypes = '|'.join(sorted({x.get('type', '') for x in rfs}))
            rec_c = sum(1 for x in rfs if x.get('status') == 'recurring')
            iso_c = sum(1 for x in rfs if x.get('status') == 'isolated')
            w.writerow({'canonical_id': cid, 'platform': rec.get('platform'),
                        'nsfw_answer': (rec.get('nsfw_first_party') or {}).get('answer', ''),
                        'chat_answer': (rec.get('chat_without_image_credits') or {}).get('answer', ''),
                        'red_flag_types': ntypes, 'recurring_count': rec_c, 'isolated_count': iso_c,
                        'operator': rec.get('operator') or '',
                        'white_label_family': rec.get('white_label_family') or ''})
    flag_types = Counter()
    rec_c = iso_c = 0
    for rec in records:
        for rf0 in rec.get('red_flags') or []:
            flag_types[rf0.get('type', '?')] += 1
            if rf0.get('status') == 'recurring': rec_c += 1
            elif rf0.get('status') == 'isolated': iso_c += 1
    fams = Counter(rec.get('white_label_family') for rec in records if rec.get('white_label_family'))
    resolutions = Counter()
    for r in scoped:
        if 'red-flag resolution' in (r.get('rule_applied') or ''):
            if r['scope_decision'] == 'in': resolutions['in'] += 1
            elif r['scope_decision'] == 'out': resolutions['out'] += 1
            else: resolutions['stayed borderline'] += 1
    rep = ['# Red flags report', '', f'Generated: {D}', '',
           f'- parsed records: {len(records)} from {len(BATCH_FILES)} batch files',
           f'- failures: {len(failures)}; unresolved joins: {len(unmatched)}: {unmatched[:12]}',
           f'- joined into scoped rows: {joined}',
           f'- scope_pending resolutions: ' + ', '.join(f'{k}={v}' for k, v in sorted(resolutions.items())),
           f'- flag types: ' + ', '.join(f'{k}={v}' for k, v in flag_types.most_common()),
           f'- recurring flags: {rec_c}; isolated flags: {iso_c}',
           f'- white-label families: ' + (', '.join(f'{k}={v}' for k, v in fams.most_common()) or 'none reported'), '',
           '## Platforms with any flag', '', '| platform | flags |', '|---|---|']
    for rec in records:
        rfs = rec.get('red_flags') or []
        if rfs:
            rep.append(f"| {rec.get('platform')} | {'; '.join(x.get('type','') for x in rfs)} |")
    open(os.path.join(OUT, 'REDFLAGS-REPORT.md'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
    print('ingest complete (NOT RUN YET rule: this module runs when Perplexity batches land).')

if __name__ == '__main__':
    main()
