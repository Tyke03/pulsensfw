# -*- coding: utf-8 -*-
"""qc-to-queue.py — translate a QC reviewer's qc-notes.json into research-queue rows.

Pipeline roles stay loose: research collects data (the store), the writer
forms an opinion (tools/brief.py), QC checks the result and kicks questions
back. QC itself is an LLM step — the reviewer reads the drafted result and
writes qc-notes.json rows:

    {
      "platform": "<platform slug, or 'category-wide'>",
      "concern": "what is wrong, missing or unverified in the drafted result",
      "evidence_that_would_resolve": "what evidence would close it (first-party preferred)",
      "asked_by": "optional; defaults to the --asked-by value ('qc')",
      "why": "optional; defaults to the --why value (QC kickback note)"
    }

Top level: either a bare list of such rows or an object {"notes": [...]} /
{"rows": [...]}.

This tool holds NO QC logic and makes no judgements about the concerns: it
appends each note to the store's research-queue.json as an open row, exactly
as written (append-only; existing rows are never edited, reordered or
deleted — closure happens later as a status change on the row).

Dedupe: a note whose normalized platform+question equals an already-OPEN
row is skipped as a duplicate; the same question on a CLOSED row appends
fresh (the question is open again). Normalization is whitespace collapse
only — wording changes are legitimately different rows.

Validation is structural only: if --dataset contains platforms.json,
platform names that don't map to a stored slug (and aren't 'category-wide')
still get appended but with a warning — a typo'd platform is the reviewer's
row to own, not the tool's to guess.
"""
import argparse, datetime, json, os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def slugify(name):
    # same slugify as build-dataset.py so reviewer spellings land on store slugs
    s = re.sub(r'[^a-z0-9\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]+', '-', (name or '').lower()).strip('-')
    return s or 'unknown'


def norm(s):
    return ' '.join((s or '').split())


def load_notes(path):
    doc = json.load(open(path, encoding='utf-8'))
    if isinstance(doc, list):
        rows = doc
        meta = {}
    elif isinstance(doc, dict):
        rows = doc.get('notes') or doc.get('rows') or []
        meta = {k: v for k, v in doc.items() if k in ('asked_by', 'why')}
    else:
        sys.exit(f'{path}: notes must be a list of rows or an object with a "notes"/"rows" list')
    if not rows:
        sys.exit(f'{path}: no note rows found')
    return rows, meta


def main():
    ap = argparse.ArgumentParser(description='Append QC notes to the store research-queue.json (no QC logic).')
    ap.add_argument('--dataset', required=True, help='dataset directory containing research-queue.json')
    ap.add_argument('--notes', required=True, help='qc-notes.json path')
    ap.add_argument('--asked-by', default='qc', help="asked_by for rows that don't set one (default: qc)")
    ap.add_argument('--why', default='QC kickback: concern in the drafted result',
                    help="why for rows that don't set one")
    ap.add_argument('--date', default=datetime.date.today().isoformat(),
                    help="added date for appended rows (default: today)")
    args = ap.parse_args()

    dataset = os.path.abspath(args.dataset)
    queue_path = os.path.join(dataset, 'research-queue.json')
    if not os.path.exists(queue_path):
        sys.exit(f'{queue_path} not found — the queue lives with the store; create/seed it first (append-only file)')
    queue = json.load(open(queue_path, encoding='utf-8'))
    rows_q = queue.setdefault('rows', [])
    if not isinstance(rows_q, list):
        sys.exit(f'{queue_path}: "rows" is not a list — refusing to touch it')

    # known slugs, for structural warnings only (not QC logic)
    slugs = set()
    pj = os.path.join(dataset, 'platforms.json')
    if os.path.exists(pj):
        try:
            slugs = {p.get('slug') for p in json.load(open(pj, encoding='utf-8')).get('platforms') or []}
        except (json.JSONDecodeError, OSError):
            pass  # store unreadable: skip the slug check, queue append stays valid

    notes, meta = load_notes(os.path.abspath(args.notes))
    open_keys = {(str(r.get('platform') or '').lower(), norm(r.get('question') or ''))
                 for r in rows_q if (r.get('status') or 'open') == 'open'}

    appended, skipped, warns = [], [], []
    for i, n in enumerate(notes):
        if not isinstance(n, dict):
            sys.exit(f'note #{i}: not an object — expected platform/concern/evidence keys')
        platform = (n.get('platform') or '').strip()
        concern = (n.get('concern') or n.get('question') or '').strip()
        evidence = (n.get('evidence_that_would_resolve')
                    or n.get('what_evidence_would_resolve') or '').strip()
        if not platform or not concern:
            sys.exit(f'note #{i}: "platform" and "concern" are both required — got platform={platform!r}')
        if not evidence:
            sys.exit(f'note #{i} ({platform}): "evidence_that_would_resolve" is required — '
                     'a question that cannot be closed is not a queue row')
        slug = platform.lower()
        if slugs and slug not in slugs:
            cand = slugify(platform)
            if cand in slugs:
                slug = cand
            else:
                warns.append(platform)
        key = (slug.lower(), norm(concern))
        if key in open_keys:
            skipped.append((platform, concern[:60]))
            continue
        open_keys.add(key)
        appended.append({
            'added': n.get('added') or args.date,
            'platform': slug,
            'question': concern,
            'asked_by': n.get('asked_by') or meta.get('asked_by') or args.asked_by,
            'why': n.get('why') or meta.get('why') or args.why,
            'evidence_that_would_resolve': evidence,
            'status': 'open',
        })

    rows_q.extend(appended)
    with open(queue_path, 'w', encoding='utf-8') as fh:
        json.dump(queue, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    for w in warns:
        print(f'warning: {w!r} matches no stored platform slug (appended as written)')
    for p, q in skipped:
        print(f'duplicate of an open row, skipped: [{p}] {q}...')
    print(f'appended {len(appended)} QC row(s) to {queue_path}')
    print(f'queue rows now: {len(rows_q)} (append-only; existing rows untouched)')


if __name__ == '__main__':
    main()
