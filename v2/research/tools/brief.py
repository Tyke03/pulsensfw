# -*- coding: utf-8 -*-
"""brief.py — the writer's evidence brief from a research store (topic-agnostic).

Usage: python brief.py --dataset <dir> --topic "<free text>" [--out <file>]

Pipeline roles stay loose: research collects data (the dataset living in
--dataset), the writer forms an opinion (this brief is the orientation sheet,
not a verdict), QC checks the result and kicks questions back into the
store's research-queue.json. This tool takes no stance: NO eligibility
gates, NO scores, NO picks, NO hand-picked platforms — one compact block per
platform, sorted by usage band only for readability. Every line traces to a
stored value with provenance; known gaps are listed, never filled by
guessing.

Output: brief.md (default: next to platforms.json in the dataset dir).
Deterministic: reruns over unchanged inputs are byte-identical.

rank.py + rank-config.json stay in the store as an OPTIONAL weighted
reference signal the writer may consult — never as a decision-maker.
"""
import argparse, json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BAND_ORDER = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'U': 4}
BAND_LABEL = {'A': 'strongest observed usage signals',
              'B': 'strong usage signals',
              'C': 'moderate usage signals',
              'D': 'weak / low usage signals',
              'U': 'unknown or none recorded'}


def truthy(v):
    return v is True or (isinstance(v, str) and v.strip().lower() == 'true')


def dashes(v):
    if v is None:
        return '-'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).strip()
    return s if s else '-'


def known_gaps(r):
    """mechanical gaps read off the stored row — never guessed."""
    g = []
    na, ca = r.get('nsfw_answer'), r.get('chat_answer')
    if na == 'unresolved':
        g.append('nsfw: no resolved first-party answer yet')
    elif na == 'conflict':
        g.append('nsfw: first-party sources disagree (conflict)')
    elif na in ('yes', 'no'):
        if r.get('evidence_strength') == 'paraphrase':
            g.append('nsfw yes rests on non-verbatim paraphrase only')
        elif not truthy(r.get('nsfw_verbatim')):
            g.append('nsfw answer is resolved but no verbatim first-party quote is on file')
    if ca == 'unresolved':
        g.append('chat without image credits: unresolved')
    elif ca == 'conflict':
        g.append('chat: first-party sources disagree (conflict)')
    if (r.get('coverage') or '') == 'not_researched':
        g.append('red flags never researched in this store (empty != clean)')
    dc = r.get('downgraded_count') or 0
    if dc:
        g.append(f'{dc} flag claim(s) downgraded in the conservative recount')
    if truthy(r.get('scope_pending')):
        g.append('scope pending: borderline case unresolved by research')
    return g or ['none noted']


def evidence_line(r):
    na = r.get('nsfw_answer')
    verbatim = truthy(r.get('nsfw_verbatim'))
    na_str = '-' if na is None else str(na)
    if na in ('yes', 'no'):
        na_str = f"{na} — {'verbatim' if verbatim else 'non-verbatim'} evidence"
    if r.get('evidence_strength') == 'paraphrase':
        na_str += ' (paraphrase-only row)'
    part = f"nsfw: {na_str}"
    if r.get('nsfw_decided_by'):
        part += f" · decided by {r['nsfw_decided_by']}"
    chat = r.get('chat_answer')
    chat_str = '-' if chat is None else str(chat)
    return f"{part} | chat (no image credits): {chat_str}" + (
        f" · decided by {r['chat_decided_by']}" if r.get('chat_decided_by') else '')


def flags_line(r):
    flags = r.get('flags') or []
    if not flags:
        return 'red flags: none recorded'
    rec = sorted({f['type'] for f in flags if f.get('status') == 'recurring'})
    iso = sorted({f['type'] for f in flags if f.get('status') == 'isolated'})
    other = [f for f in flags if f.get('status') not in ('recurring', 'isolated')]
    parts = []
    if rec:
        parts.append(f"{sum(1 for f in flags if f.get('status') == 'recurring')} recurring ({', '.join(rec)})")
    if iso:
        parts.append(f"{sum(1 for f in flags if f.get('status') == 'isolated')} isolated ({', '.join(iso)})")
    for f in other:
        parts.append(f"{f.get('status')}: {f.get('type')}")
    out = 'red flags: ' + ' · '.join(parts)
    dc = r.get('downgraded_count') or 0
    return out + (f" · recounts downgraded {dc} claim(s)" if dc else '')


def main():
    ap = argparse.ArgumentParser(description="Writer's evidence brief from a research store (no gates, no scores).")
    ap.add_argument('--dataset', required=True, help='dataset directory containing platforms.json')
    ap.add_argument('--topic', required=True, help='free-text topic the writer is developing (recorded verbatim in the brief)')
    ap.add_argument('--out', default=None, help='output file (default: brief.md in the dataset dir)')
    args = ap.parse_args()

    dataset = os.path.abspath(args.dataset)
    doc = json.load(open(os.path.join(dataset, 'platforms.json'), encoding='utf-8'))
    platforms = doc.get('platforms') or []
    built = doc.get('built') or ''
    out_path = os.path.abspath(args.out or os.path.join(dataset, 'brief.md'))

    m = []

    def A(line=''):
        m.append(line)

    A(f"# Writer brief — {args.topic}")
    A('')
    A(f"Store: `{doc.get('dataset')}` (platforms.json built {built}; {doc.get('rows')} platforms). "
      "This brief adds no opinions: facts with provenance, sorted by usage band for readability only. "
      "It has no eligibility gates, no scores, and no picks. The writer forms the opinion; QC checks "
      "the result and kicks open questions into the store's `research-queue.json` (append-only). "
      "`rank.py` exists in the store dir as an optional weighted reference signal — consult it, never obey it.")
    A('')
    A('Per block: usage band · supply runs (independent census runs, 0-4) · community users (distinct users '
      'observed in census evidence, tier A+B floor) · NSFW/chat evidence with decided_by + verbatim flag · '
      'red flags (recurring = 2+ recounted independent users; isolated = a single report; empty != clean) · '
      'confidence · known gaps. Full sources + access dates live in platforms.csv / platforms.json; each '
      'block below shows the first few URLs.')
    A('')

    order = sorted(platforms, key=lambda r: (BAND_ORDER.get(str(r.get('usage_band') or ''), len(BAND_ORDER)),
                                             str(r.get('slug') or '')))
    by_band = {}
    for r in order:
        by_band.setdefault(str(r.get('usage_band') or '?'), []).append(r)
    for band in sorted(by_band, key=lambda b: (BAND_ORDER.get(b, len(BAND_ORDER)), b)):
        rows = by_band[band]
        label = BAND_LABEL.get(band, 'band not set in the store')
        A(f"## Band {band} — {label} ({len(rows)} platforms)")
        A('')
        for r in rows:
            A(f"### {dashes(r.get('name'))} (`{dashes(r.get('slug'))}`)"
              f" — scope: {dashes(r.get('scope_decision'))}{', scope pending' if truthy(r.get('scope_pending')) else ''}"
              f" — confidence: {dashes(r.get('confidence'))}")
            A('')
            A(f"- usage: band {dashes(r.get('usage_band'))} · supply {dashes(r.get('supply_runs'))} census runs · "
              f"community users {dashes(r.get('community_users'))}")
            A(f"- evidence: {evidence_line(r)}")
            A(f"- {flags_line(r)} · coverage: {dashes(r.get('coverage'))}")
            A(f"- known gaps: {', '.join(known_gaps(r))}")
            srcs = r.get('sources') or []
            if srcs:
                shown = srcs[:3]
                more = f" (+{len(srcs) - 3} more in platforms.csv)" if len(srcs) > 3 else ''
                A(f"- sources ({len(srcs)}): " + '; '.join(shown) + more)
            else:
                A('- sources: none recorded')
            deep = r.get('deep_files')
            if deep:
                A(f"- research provenance: deep pass files {deep}")
            A('')
        A('')

    scope_counts = {}
    for r in platforms:
        scope_counts[str(r.get('scope_decision') or '?')] = scope_counts.get(str(r.get('scope_decision') or '?'), 0) + 1
    A(f"--- footer: {len(platforms)} platforms by scope: "
      + ', '.join(f'{k}={v}' for k, v in sorted(scope_counts.items()))
      + '. Gaps are stored facts, not assignments; new questions belong in research-queue.json '
      '(who asked + why appended), never in this file.')
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(m).rstrip('\n') + '\n')

    low = sum(1 for r in platforms if (r.get('confidence') or '') == 'low')
    nr = sum(1 for r in platforms if (r.get('coverage') or '') == 'not_researched')
    print(f'brief.md: {len(platforms)} platform blocks | low-confidence blocks {low} | '
          f'flags never researched {nr} | wrote {out_path}')


if __name__ == '__main__':
    main()
