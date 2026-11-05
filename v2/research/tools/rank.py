# -*- coding: utf-8 -*-
"""rank.py — turn any category dataset into a documented top-N ranking.

Usage:
  python rank.py --dataset <dataset_dir> --config <rank-config.json>
                 [--n N] [--out-dir <dir>]

Inputs:
  <dataset_dir>/platforms.json  (self-documenting dataset rows with
  per-flag source detail) and the --config JSON.

Topic-free by construction: this script contains no topic names, no category
ids, no slugs and no hand-picked platforms. Every topic-specific choice lives
in the config — which categories form which list, eligibility gates and
exclusion reasons, factor source columns, weights, points and caps, red-flag
severity, list sizes, labels and the replacement rule. Porting to another
category = writing a new config; this file is reusable as is.

Scoring: score = SUM(factor_weight x factor_points) - SUM(flag cost), where a
flag costs severity(type) x unit(status); all numbers live in the config.
Unknown values score the config's unknown_points (never guessed); near-miss
rows report what kept them out as per-factor deltas to the last pick.

Stability: deterministic (stable sort, no wall-clock writes) — two runs over
unchanged dataset + config are byte-identical. Outputs are never hand-edited;
change the config and rerun. A pick keeps its slot only while no
higher-scoring evidenced row replaces it, which is exactly what every rerun
recomputes.

Guards:
- a category id named by a list that the dataset doesn't know -> hard error;
- eligible categories mapped to no list and absent from ignored_categories
  -> warning, so a config cannot silently drop a group.
"""
import argparse, csv, hashlib, io, json, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def numeric(v):
    if isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        v = v.strip()
        try:
            return float(v) if v else 0.0
        except ValueError:
            return 0.0
    return 0.0


def fmt(x, signed=False):
    x = 0.0 if abs(x) < 1e-9 else x
    s = '%.1f' % x
    if signed and not s.startswith('-'):
        s = '+' + s
    return s


def rule_value(row, rule):
    """value of the rule's dataset column, as string ('' for None)."""
    v = row.get(rule['column'])
    if v is None:
        return ''
    return v if isinstance(v, str) else str(v)


def matches_rule(row, rule):
    return rule_value(row, rule) in rule['equals_any']


def score_row(row, factors, fl):
    """returns (total, parts [{id, contrib}], flag_costs [(cost, type, status)])"""
    parts, total, flag_costs = [], 0.0, []
    for fac in factors:
        w = numeric(fac.get('weight', 1))
        raw = row.get(fac['column'])
        if 'points' in fac:
            key = raw if isinstance(raw, str) else ('' if raw is None else str(raw))
            pts = numeric(fac['points'].get(key, fac.get('unknown_points', 0)))
            contrib = w * pts
        else:
            val = numeric(raw)
            if fac.get('cap') is not None:
                val = min(val, numeric(fac['cap']))
            pts = val
            contrib = w * val
        total += contrib
        parts.append({'id': fac['id'], 'contrib': contrib, 'points': pts})
    if fl:
        sev, units = fl.get('type_severity') or {}, fl.get('status_units') or {}
        sdef, udef = numeric(fl.get('default_severity', 1)), numeric(fl.get('default_status_unit', 1))
        for f in row.get('flags') or []:
            cost = numeric(sev.get(str(f.get('type') or ''), sdef)) * numeric(units.get(str(f.get('status') or ''), udef))
            flag_costs.append((cost, str(f.get('type') or 'unknown_flag'), str(f.get('status') or 'unknown')))
        p = numeric(fl.get('weight', 1)) * sum(c for c, _, _ in flag_costs)
        total -= p
        parts.append({'id': 'flags', 'contrib': -p, 'points': None})
    return total, parts, flag_costs


def is_provisional(row, rules):
    return any(matches_rule(row, r) for r in rules)


def factor_short(factors, fl):
    """compact labels for breakdown strings, ordered as the config lists them."""
    ids = [f['id'] for f in factors]
    if fl:
        ids.append('flags')
    return ids


def breakdown_str(parts):
    return ' - '.join(f"{p['id']} {fmt(p['contrib'])}" for p in parts)


def main():
    ap = argparse.ArgumentParser(description='Config-driven top-N ranking of a category dataset (topic-agnostic).')
    ap.add_argument('--dataset', required=True, help='dataset directory containing platforms.json')
    ap.add_argument('--config', required=True, help='rank-config.json path (all topic specifics live here)')
    ap.add_argument('--n', type=int, default=10, help='default list size for lists whose config has no explicit size')
    ap.add_argument('--out-dir', default=None, help='write ranking.csv/ranking.md here (default: the dataset dir)')
    args = ap.parse_args()

    dataset = os.path.abspath(args.dataset)
    doc = json.load(open(os.path.join(dataset, 'platforms.json'), encoding='utf-8'))
    rows = doc.get('platforms') or doc.get('rows') or []
    if not rows:
        sys.exit(f'no platform rows in {dataset}/platforms.json')
    cfg = json.load(open(args.config, encoding='utf-8'))
    out_dir = os.path.abspath(args.out_dir or dataset)
    os.makedirs(out_dir, exist_ok=True)
    digest = hashlib.sha256(open(args.config, 'rb').read()).hexdigest()[:12]
    factors, fl = cfg.get('factors') or [], cfg.get('flags_factor') or {}
    eligible_cfg = cfg['eligibility']
    excl_cfg = eligible_cfg.get('exclusions') or []
    prov_rules = cfg.get('provisional_rules') or []
    lists_cfg = cfg['lists']
    sshow = int(fl.get('top_show', 3))
    built = doc.get('built') or ''

    # ---- category sanity ----------------------------------------------------
    data_cats = {str(row.get('category') or '') for row in rows}
    for L in lists_cfg:
        unknown = [c for c in L['categories'] if c not in data_cats]
        if unknown:
            sys.exit(f"config list '{L['id']}' names unknown categories: {unknown}")
    mapped = {c for L in lists_cfg for c in L['categories']} | {str(c) for c in (cfg.get('ignored_categories') or {})}

    # ---- eligibility ----------------------------------------------------------
    excluded, eligible, dropped = [], [], 0
    for row in rows:
        hit = next((ex for ex in excl_cfg if matches_rule(row, ex)), None)
        if hit is not None:
            excluded.append((row, hit['reason']))
            continue
        if all(matches_rule(row, g) for g in eligible_cfg.get('require') or []):
            eligible.append(row)
        else:
            dropped += 1
    eligible_cats = {str(row.get('category') or '') for row in eligible}
    unmapped = sorted(eligible_cats - mapped)
    if unmapped:
        print(f"WARNING: eligible categories mapped to no list and not in ignored_categories: {unmapped}")

    # ---- score -----------------------------------------------------------------
    scored = []
    for row in eligible:
        total, parts, flag_costs = score_row(row, factors, fl)
        scored.append({'row': row, 'total': total, 'parts': parts, 'flag_costs': flag_costs,
                       'provisional': is_provisional(row, prov_rules)})

    # ---- lists -----------------------------------------------------------------
    fid = factor_short(factors, fl)
    csv_rows, md = [], []
    lists_meta = []
    for L in lists_cfg:
        lid, label = L['id'], L['label']
        size = int(L.get('size', args.n))
        n_near = int(L.get('near_misses', 0))
        members = sorted((s for s in scored if str(s['row'].get('category') or '') in L['categories']),
                         key=lambda s: (-s['total'], str(s['row'].get('slug') or '')))
        picks, near = members[:size], members[size:size + n_near]
        cut = picks[-1] if picks and len(picks) == size else None
        for s in near:
            if cut is not None:
                s['gap'] = cut['total'] - s['total']
                bmap = {p['id']: p['contrib'] for p in cut['parts']}
                smap = {p['id']: p['contrib'] for p in s['parts']}
                deltas = [(k, smap.get(k, 0.0) - bmap.get(k, 0.0)) for k in fid]
                diffs = [(k, v) for k, v in deltas if abs(v) > 1e-9]
                diffs.sort(key=lambda kv: kv[1])
                s['kept'] = ', '.join(f'{k} {fmt(v, signed=True)}' for k, v in diffs) if diffs else 'tied on every factor; lost the slug tie-break'
            else:
                s['gap'] = 0.0
                s['kept'] = 'list not full (fewer eligible rows than the size)'
        lists_meta.append({'id': lid, 'label': label, 'config': L, 'picks': picks, 'near': near,
                           'eligible': len(members), 'cut': cut})
        start_rank = size + 1
        for s, rank_no in ([(p, i + 1) for i, p in enumerate(picks)] +
                           [(s, start_rank + i) for i, s in enumerate(near)]):
            s['rank'] = rank_no
            row, parts_by = s['row'], {p['id']: p['contrib'] for p in s['parts']}
            fcs = sorted(s['flag_costs'], key=lambda x: (-x[0], x[1], x[2]))
            lab = {'recurring': 'rec', 'isolated': 'iso'}
            tf = ' | '.join(f"{t}[{lab.get(st, st)}]" for _, t, st in fcs[:sshow]) if s['flag_costs'] else ''
            csv_rows.append({
                'list': lid, 'rank': rank_no,
                'slug': row.get('slug') or '', 'name': row.get('name') or '',
                'category': row.get('category') or '', 'usage_band': row.get('usage_band') or '',
                'score': fmt(s['total']),
                **{f'score_{k}': fmt(parts_by.get(k, 0.0)) for k in fid},
                'confidence': row.get('confidence') or '',
                'provisional': 'true' if s['provisional'] else 'false',
                'coverage': row.get('coverage') or '',
                'flag_types': row.get('flag_types') or '',
                'recurring_count': row.get('recurring_count') if row.get('recurring_count') is not None else '',
                'isolated_count': row.get('isolated_count') if row.get('isolated_count') is not None else '',
                'top_flags': tf,
                'sources': ' | '.join(row.get('sources') or []),
                'gap_to_cut': fmt(s['gap']) if s.get('gap') is not None else '',
                'kept_out_by': s.get('kept') or '',
                'reason': '',
            })

    for row, reason in excluded:
        csv_rows.append({
            'list': 'excluded', 'rank': '', 'slug': row.get('slug') or '', 'name': row.get('name') or '',
            'category': row.get('category') or '', 'usage_band': row.get('usage_band') or '', 'score': '',
            **{f'score_{k}': '' for k in fid},
            'confidence': row.get('confidence') or '', 'provisional': '', 'coverage': row.get('coverage') or '',
            'flag_types': row.get('flag_types') or '',
            'recurring_count': row.get('recurring_count') if row.get('recurring_count') is not None else '',
            'isolated_count': row.get('isolated_count') if row.get('isolated_count') is not None else '',
            'top_flags': '', 'sources': ' | '.join(row.get('sources') or []),
            'gap_to_cut': '', 'kept_out_by': '', 'reason': reason,
        })

    # ---- csv --------------------------------------------------------------------
    cols = (['list', 'rank', 'slug', 'name', 'category', 'usage_band', 'score'] +
            [f'score_{k}' for k in fid] +
            ['confidence', 'provisional', 'coverage', 'flag_types', 'recurring_count', 'isolated_count',
             'top_flags', 'sources', 'gap_to_cut', 'kept_out_by', 'reason'])
    with open(os.path.join(out_dir, 'ranking.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for r in csv_rows:
            w.writerow(r)

    # ---- markdown ----------------------------------------------------------------
    A = md.append
    A(f"# {cfg.get('title') or 'Ranked picks'}")
    A('')
    A(f"Built from `platforms.json` (dataset built {built}) with config `"
      f"{os.path.basename(args.config)}` (digest {digest}) by `v2/research/tools/rank.py` "
      "- deterministic: reruns over unchanged inputs are byte-identical. The underlying "
      "dataset stays descriptive; this ranking adds the documented preference weighting "
      "below. **Never hand-edit the outputs — change the config and rerun.** "
      f"{cfg.get('replacement_rule') or ''}".strip())
    A('')
    A('## Eligibility (from the config)')
    for g in eligible_cfg.get('require') or []:
        A(f"- required: `{g['column']}` one of {g['equals_any']}" + (f" — {g['label']}" if g.get('label') else ''))
    A(f"- rows failing a requirement: {dropped} (labels only, not ranked)")
    A(f"- listed separately below with reasons instead of silently dropped: {len(excluded)}")
    A('')
    A('## Scoring (all weights and points from the config)')
    A('score = SUM(factor_weight x factor_points) - SUM(flag cost); flag cost = severity(type) x unit(status)')
    A('')
    A('| factor | source column | weight | points / cap |')
    A('|---|---|---:|---|')
    for fac in factors:
        if 'points' in fac:
            pts = ' '.join(f'{k}={numeric(fac["points"][k]):g}' for k in fac['points'])
            extra = f" unknown={numeric(fac.get('unknown_points', 0)):g}"
            A(f"| {fac['id']} | `{fac['column']}` | {fmt(numeric(fac.get('weight', 1)))} | {pts}{extra} |")
        else:
            cap = f", capped at {numeric(fac['cap']):g}" if fac.get('cap') is not None else ''
            A(f"| {fac['id']} | `{fac['column']}` | {fmt(numeric(fac.get('weight', 1)))} | value{cap} |")
    if fl:
        sev = ' · '.join(f'{k}={numeric(v):g}' for k, v in (fl.get('type_severity') or {}).items())
        units = ' · '.join(f'{k}={numeric(v):g}' for k, v in (fl.get('status_units') or {}).items())
        A(f"| flags (penalty) | `flags` | {fmt(numeric(fl.get('weight', 1)))} | unit(status): {units} |")
        A(f"| | | | severity(type): {sev} · unknown type={numeric(fl.get('default_severity', 1)):g} |")
    A('')
    A(f"[rec] = recurring flag (2+ independent users recounted) · [iso] = isolated report. "
      f"Top {sshow} flags shown per row; see `rank-config.json` severity table for all types.")
    if prov_rules:
        pr = ' ; '.join(f"`{r['column']}` one of {r['equals_any']}" for r in prov_rules)
        A(f"Provisional rows ({pr}) keep their rank but are flagged: unverified weighting inputs, not errors.")
    A('')
    for meta in lists_meta:
        L, picks, near = meta['config'], meta['picks'], meta['near']
        A(f"## {meta['label']} (top {int(L.get('size', args.n))} of {meta['eligible']} eligible)")
        A('')
        headers = [(k + ' −' if k == 'flags' else k + ' pts') for k in fid]
        A('| # | platform | score | ' + ' | '.join(headers) + ' | top red flags | confidence | provisional |')
        A('|---:|---|---:|' + '---:|' * len(fid) + '---|---|---|')
        for s in picks:
            parts_by = {p['id']: fmt(p['contrib']) for p in s['parts']}
            row = s['row']
            lab = {'recurring': 'rec', 'isolated': 'iso'}
            tf = ' · '.join(f"{t}[{lab.get(st, st)}]" for _, t, st in sorted(s['flag_costs'], key=lambda x: (-x[0], x[1], x[2]))[:sshow]) if s['flag_costs'] else ''
            A(f"| {s['rank']} | {row['name']} (`{row['slug']}`) | {fmt(s['total'])} | "
              + ' | '.join(parts_by.get(k, '') for k in fid) +
              f" | {tf} | {row.get('confidence') or ''} | {'PROVISIONAL' if s['provisional'] else ''} |")
        if not picks:
            A('| (no eligible rows) | |' + '|' * (len(fid) + 3) + '|')
        if picks and len(picks) < int(L.get('size', args.n)):
            A('')
            A(f"fewer eligible rows than the configured size ({len(picks)}/{int(L.get('size', args.n))}).")
        if near:
            A('')
            A(f"### Near misses — {meta['label']}"
              f" (ranks {int(L.get('size', args.n)) + 1}-{int(L.get('size', args.n)) + len(near)})")
            A('')
            cut_no = int(L.get('size', args.n))
            A('| # | platform | score | gap to cut | kept out by (factor deltas vs the last pick) |')
            A('|---:|---|---:|---:|---|')
            for s in near:
                row = s['row']
                A(f"| {s['rank']} | {row['name']} (`{row['slug']}`) | {fmt(s['total'])} | "
                  f"{fmt(s['gap'], signed=True)} | {s['kept']} (vs pick #{cut_no}) |")
        # sources detail
        A('')
        A(f"### {meta['label']} — evidence sources")
        for s in picks + near:
            row = s['row']
            srcs = row.get('sources') or []
            fcs = sorted(s['flag_costs'], key=lambda x: (-x[0], x[1], x[2]))
            lab = {'recurring': 'rec', 'isolated': 'iso'}
            tf = '; '.join(f'{t} [{lab.get(st, st)}]' for _, t, st in fcs) if fcs else 'none recorded'
            A('')
            A(f"**{s['rank']}. {row['name']}** (`{row['slug']}`) — score {fmt(s['total'])}"
              + (' · PROVISIONAL (low confidence)' if s['provisional'] else ''))
            A(f"    - band={row.get('usage_band') or '-'} supply={row.get('supply_runs') if row.get('supply_runs') is not None else '-'} "
              f"community={row.get('community_users') if row.get('community_users') is not None else '-'} "
              f"coverage={row.get('coverage') or '-'} · red flags: {tf}")
            A(f"    - sources ({len(srcs)}): " + '; '.join(srcs) if srcs else f"    - sources: none recorded")
        A('')
    A('## Excluded (never silently dropped)')
    if excluded:
        A('| platform | category | reason |')
        A('|---|---|---|')
        for row, reason in excluded:
            A(f"| {row['name']} (`{row['slug']}`) | {row.get('category') or '-'} | {reason} |")
    else:
        A('none.')
    A('')
    ignored = cfg.get('ignored_categories') or {}
    if ignored:
        A('## Categories deliberately outside every list (from config)')
        A('| category | reason |')
        A('|---|---|')
        for c, why in ignored.items():
            A(f"| {c} | {why} |")
        A('')
    if unmapped:
        A(f"UNMAPPED eligible categories (config should cover them or move them into "
          f"`ignored_categories` with a reason): {', '.join(unmapped)}")
        A('')
    with open(os.path.join(out_dir, 'ranking.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(md).rstrip('\n') + '\n')

    # ---- summary -----------------------------------------------------------------
    printed = [f"lists: " + ', '.join(f"{m['id']} {len(m['picks'])}/{int(m['config'].get('size', args.n))}"
              f" (eligible {m['eligible']})" for m in lists_meta)]
    prov_n = sum(1 for m in lists_meta for s in m['picks'] if s['provisional'])
    prov_near = sum(1 for m in lists_meta for s in m['near'] if s['provisional'])
    printed.append(f"provisional rows: {prov_n} in lists, {prov_near} in near misses")
    printed.append(f"excluded with reasons: {len(excluded)} | ineligible (no/unresolved nsfw etc.): {dropped}")
    printed.append('wrote ' + os.path.join(out_dir, 'ranking.csv') + ' and ' + os.path.join(out_dir, 'ranking.md'))
    for line in printed:
        print(line)


if __name__ == '__main__':
    main()
