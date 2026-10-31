# -*- coding: utf-8 -*-
"""Resolve scope decisions from census-scope-checks-perplexity.json against
merged/scoped.csv with the CFO resolution rules:

- Test A split (judged strictly from the JSON's own evidence/notes):
  a) chat part: pass if first-party evidence shows multi-turn memory AND ordinary
     chat on a standard tier does not consume image credits. One-time character-
     creation fees do not fail it (CFO override of Perplexity's strict reading).
  b) NSFW part: pass if the platform's own first-party pages (ToS, FAQ, or
     product/marketing copy) affirmatively offer explicit adult chat for 18+.
  Row = in if both pass; borderline-retained if one unresolved; out only if a
  part has first-party failure evidence.
- Tests B-F: take Perplexity's answer as-is; "unresolved" -> default_if_unresolved.
- CamSoda AI: E pass -> in, note 'separate product surface from CamSoda cam site;
  cross-promotion not ruled out'.
- Replika: stays out, needs_check retained (F unresolved -> out).

The per-record A-split verdicts below are declared in one table, each citing the
JSON's own evidence/notes; outcomes are applied mechanically.
"""
import json, csv, os, re, sys, io
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'merged')
D = '2026-10-31'

CHECKS = json.load(open(os.path.join(BASE, 'census-scope-checks-perplexity.json'), encoding='utf-8'))
rows = list(csv.DictReader(open(os.path.join(OUT, 'scoped.csv'), encoding='utf-8-sig')))
print('scoped rows in:', len(rows), '| check records:', len(CHECKS))

def norm_key(s):
    return re.sub(r'[^a-z0-9]+', '', (s or '').lower())

def unwrap(url):
    if not url:
        return ''
    m = re.search(r'\((https?://[^)]+)\)', url)
    return m.group(1) if m else url.strip()

by_platform = {norm_key(rec.get('platform')): rec for rec in CHECKS}

# per-record decided outcomes (key = normalized platform prefix)
# chat/nsfw verdicts are read directly from each record's own evidence/notes text.
RESOLVE = {
  'candyai': dict(test='A', chat='pass', nsfw='unresolved', verdict='borderline',
      why="Chat part passes from Candy's own ToS (unlimited messaging + separate monthly token allowance; ordinary chat not metered against image credits) and first-party memory copy. NSFW part unresolved: community guidelines reviewed do not affirmatively authorize explicit adult text and Perplexity declines to treat erotic-chat marketing as policy permission.",
      url='https://candy.ai/terms-of-service'),
  'ourdreamai': dict(test='A', chat='pass', nsfw='pass', verdict='in',
      why="CFO override applied: one-time character-creation fees (documented 5/10 Dreamcoin creation charge) do NOT fail the chat part. Chat pass: first-party help page shows subscriber chats at zero Dreamcoins on standard models plus Auto Memory/Pinned memories/Persona. NSFW pass: acceptable-use policy affirmatively allows sexual content between consenting adult characters for age-confirmed users.",
      url='https://help.ourdream.ai/en/articles/10808513',
      needs='confirm in creation screens that editing an existing character costs nothing further'),
  'girlfriendgpt': dict(test='A', chat='unresolved', nsfw='pass', verdict='borderline',
      why="NSFW part passes via own product copy (NSFW AI chat platform; sexting/roleplay advertised). Chat part unresolved: no first-party evidence located for memory plus credit-independent custom prompting.",
      url='https://www.gptgirlfriend.online/tag/robot',
      needs='first-party memory + billing page'),
  'dreamgfai': dict(test='A', chat='unresolved', nsfw='unresolved', verdict='borderline',
      why="Chat part unresolved (only a special fictional-character page was reviewed; its limitations do not generalize to the main product). NSFW part unresolved (no affirmative first-party policy permission located).",
      url='https://dreamgf.ai/terms',
      needs='first-party companion-dialog memory + billing page and explicit-text policy permission'),
  'secretsai': dict(test='A', chat='pass', nsfw='pass', verdict='in',
      why="Chat part passes: first character free, initial personality setup free on every tier, Moments meter image/video/audio beyond basic chatting, custom characters use the regular memory system. NSFW part passes: own ToS describes adult-themed chatbot conversations and AI-generated sexual descriptions for 18+ users.",
      url='https://wiki.secrets.ai/create/custom-characters',
      needs='confirm the first-free-character exception in the creation screen (the guide FAQ repeats the 500-Moments figure without the exception)'),
  'nectarai': dict(test='A', chat='pass', nsfw='pass', verdict='in',
      why="Chat part passes: free plan includes character creator and AI chat with persistent memory; credits meter premium actions, not ordinary chat. NSFW part passes: own ToS expressly provides SFW and NSFW areas restricted to 18+ users.",
      url='https://nectar.ai/faq',
      needs='paid-only advanced roleplay/models still metered; record the distinction'),
  'swipeyai': dict(test='A', chat='pass', nsfw='pass', verdict='in',
      why="Chat part passes: free tier includes character creation and basic chat; Hearts meter images/video/calls, not chat; Premium Memories keep details. NSFW part passes: own product FAQ expressly offers fully explicit text chat and roleplay with cross-session continuity for adults 18+.",
      url='https://swipey.ai/'),
  'darlinkai': dict(test='A', chat='pass', nsfw='unresolved', verdict='borderline',
      why="Chat part passes on plan-selection evidence (separate message allowances + memory levels; image/video separately tokenized). NSFW part unresolved: an NSFW pricing label alone is not affirmative policy permission.",
      url='https://darlink.ai/plan-selection',
      needs='first-party policy/FAQ text permitting explicit adult chat'),
  'muahai': dict(test='A', chat='pass', nsfw='unresolved', verdict='borderline',
      why="Chat part passes: official first-party FAQ documents permanent memory with chat/voice/photos (custom-prompt billing not contradicted). NSFW part unresolved: no first-party policy permission located.",
      url='https://muah.ai/info/about.php',
      needs='first-party explicit-text policy permission page'),
  'fantasygf': dict(test='A', chat='unresolved', nsfw='pass', verdict='borderline',
      why="NSFW part passes via first-party product copy (NSFW chat/erotic roleplay on own character pages). Chat part unresolved: memory plus credit-independent custom prompting not established.",
      url='https://fantasygf.ai/character/barbara-barber',
      needs='first-party memory/billing page'),
  'secretdesiresai': dict(test='A', chat='pass', nsfw='unresolved', verdict='borderline',
      why="Chat part passes (unlimited messaging, no-Hearts chat/creation per their own comparison page; memory documented via guide). NSFW part unresolved: no affirmative first-party policy permission located.",
      url='https://secretdesires.ai/plans',
      needs='first-party policy/FAQ text permitting explicit adult chat'),
  'cutiesai': dict(test='A', chat='unresolved', nsfw='pass', verdict='borderline',
      why="NSFW part passes (own site: adults-only; conversations may contain pornographic materials). Chat part unresolved: memory plus no-image-credit custom prompting not established.",
      url='https://cuties.ai/',
      needs='first-party memory/billing page'),
  'soulkyn': dict(test='A', chat='pass', nsfw='pass', verdict='borderline',
      why="Borderline-retained as the record itself keeps the combined test unresolved: FAQ documents memory + uncensored adult conversations, but Perplexity's note says the file does not establish that custom character creation/setup never consumes the image currency. CFO creation-fee tolerance does not fill that gap (it covers one-time fees, not evidence absence).",
      url='https://landing.soulkyn.com/l/en-US/ai-companion-platform',
      needs='first-party confirmation that custom character creation/setup does not consume the image-generation currency'),
  'ehentai': dict(test='A', chat='unresolved', nsfw='unresolved', verdict='borderline',
      why="Chat and NSFW parts both unresolved (terms cover DreamAI SRL identity and plan wording only).",
      url='https://ehentai.ai/terms',
      needs='first-party companion memory/billing page and explicit-text permission'),
  'veniceai': dict(test='B', ans='pass', verdict='in',
      why="Test B pass taken as-is: first-party pages document built-in character creation/management and hosted inference with no external frontend or API key â€” this settles the earlier role-conflict (raw gateway vs host) in favor of host.",
      url='https://venice.ai/characters',
      needs='note: custom-character creation can require Pro tier'),
  'unorouterai': dict(test='B', ans='pass', verdict='in',
      why="Test B pass taken as-is: homepage documents built-in personas/presets/SillyTavern card import with pre-connected free models (no signup/key) â€” not a raw router.",
      url='https://unorouter.ai/'),
  'gptsovits': dict(test='B', ans='fail', verdict='out',
      why="Test B fail taken as-is: first-party GitHub states the project is a voice-conversion/TTS WebUI, not a hosted persona-chat service â€” first-party failure evidence on the B part (borderline case 4 resolved).",
      url='https://github.com/RVC-Boss/GPT-SoVITS'),
  'zetaai': dict(test='C', ans='unresolved', verdict='out',
      why="Test C unresolved -> default_if_unresolved applied verbatim: 'exclude_main (Gemini borderline default)' (B4 regional). Perplexity found no full localization/payment/explicit-permission first-party evidence.",
      url='https://zeta-ai.io/en/policy/terms',
      needs='full English localization + international payments + explicit-permission policy page would flip to in'),
  'caveduck': dict(test='C', ans='unresolved', verdict='out',
      why="Test C unresolved -> default applied verbatim (B4 regional). Perplexity found English + NSFW classification, but localization and payments unestablished.",
      url='https://caveduck.io/en',
      needs='full English localization + international payments + explicit-text permission page'),
  'grok': dict(test='D', ans='unresolved', verdict='out',
      why="Test D unresolved -> default applied verbatim (B1 adult-mode assistant). First-party docs cover work-oriented Bots; companion-persona memory and explicit-text permission not established.",
      url='https://docs.x.ai/grok-bot/bots',
      needs='xAI first-party confirmation that Companion personas persist with explicit-text permission'),
  'camsodaai': dict(test='E', ans='pass', verdict='in',
      why="Test E pass taken as-is: camsoda.ai presents the AI-girlfriend chat (own free/Premium offering, 200+ characters) as a standalone product surface. Note: separate product surface from CamSoda cam site; cross-promotion not ruled out.",
      url='https://camsoda.ai/'),
  'replikaai': dict(test='F', ans='unresolved', verdict='out',
      why="Replika stays OUT per the CFO rule (needs_check retained): Test F unresolved â€” no current first-party statement entitles a brand-new account to explicit roleplay on a standard paid tier.",
      url='https://help.replika.com/hc/en-us/articles/39551043419149-Choosing-a-Subscription',
      needs='first-party statement confirming explicit roleplay entitlement for new accounts'),
}
# canonical-name key correction: 'replikaai' vs 'replika', 'ehentai' vs 'ehentaiai'
RESOLVE['replika'] = RESOLVE.pop('replikaai')
RESOLVE['ehentai'] = RESOLVE['ehentai']
RESOLVE.pop('replikaai', None)

matched, changes, unmatched = 0, [], []
for i, r0 in enumerate(rows):
    r = dict(r0)
    name = r['canonical_name']
    k = norm_key(re.split(r's*(\(', name)[0]) if False else norm_key(re.split(r'\s*\(', name)[0])
    k = norm_key(re.split(r'\s*\(', name)[0])
    rec = by_platform.get(k)
    if rec is None and k and not re.search(r'[\u00c0-\u024f\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]', name):
        for pk, cand in by_platform.items():
            if pk.startswith(k) or k.startswith(pk):
                rec = cand
                break
    r['check_answer_raw'] = json.dumps(rec, ensure_ascii=False) if rec else ''
    r['check_test'] = (rec or {}).get('test', '')[:1] if rec else ''
    r['check_answer'] = (rec or {}).get('answer', '')
    ev = unwrap(((rec or {}).get('evidence') or [{}])[0].get('url')) if rec else ''
    r['check_evidence_url'] = ev
    r['prior_decision_before_checks'] = r0['scope_decision']
    before = r['scope_decision']
    before_rule = r['rule_applied']
    if rec is None:
        continue
    matched += 1
    kk0 = None
    for kk in RESOLVE:
        if k == kk or (len(kk) >= 5 and (k.startswith(kk) or kk.startswith(k))):
            kk0 = kk
            break
    if kk0 is None:
        unmatched.append(name)
        continue
    out = RESOLVE[kk0]
    tag = 'Test ' + out['test']
    if out['verdict'] == 'in':
        new_cat = 'byok_local_frontends' if kk0.startswith('unorouter') else 'hosted_character_hubs'
        r.update({'scope_decision': 'in',
                  'category_id': new_cat,
                  'rule_applied': f"{tag} resolved (Perplexity first-party evidence, {D}). {out['why']} Review verdict = '{out.get("ans")}; prior decision '{before}', prior rule: {before_rule[:120]}... .",
                  'needs_check': out.get('needs', 'none â€” first-party A/B/C/D/E/F evidence recorded in census-scope-checks-perplexity.json')})
        changes.append((name, before, 'in', ev, out.get('test'), out.get('ans')))
    elif out['verdict'] == 'out':
        r.update({'scope_decision': 'out',
                  'category_id': 'out',
                  'rule_applied': f"{tag} resolved (Perplexity first-party evidence, {D}). {out['why']} Review verdict = '{out.get("ans")}; prior decision '{before}'.",
                  'needs_check': out.get('needs', (rec.get('notes') or '')[:200])})
        changes.append((name, before, 'out', ev, out.get('test'), out.get('ans')))
    else:
        r.update({'scope_decision': 'borderline'})
        r['rule_applied'] = (f"{tag} unresolved (Perplexity first-party evidence, {D}): borderline-retained. {out['why']}"
                             f" Review verdict = '{out.get('ans', 'unresolved')}'; prior decision '{before}'. default_if_unresolved NOT fired (rule says A unresolved keep borderline).")
        r['needs_check'] = out.get('needs', '')
        changes.append((name, before, 'borderline', ev, out.get('test'), out.get('ans')))
    rows[i] = r

with open(os.path.join(OUT, 'scoped.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), extrasaction='ignore')
    w.writeheader()
    for row in rows:
        w.writerow(row)
json.dump(rows, open(os.path.join(OUT, 'scoped.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False, default=str)
open(os.path.join(OUT, 'scoped.json'), 'a', encoding='utf-8').write('\n')

# Rebuild-from-scratch the Perplexity scope-check rows: drop any prior
# Perplexity rows, keep the pass's pre-resolution rows, and re-emit the 22
# fresh rows from the JSON — reruns are byte-identical and idempotent.
try:
    prior_rows = list(csv.DictReader(open(os.path.join(OUT, 'scope-checks.csv'), encoding='utf-8-sig')))
except FileNotFoundError:
    prior_rows = []
base_rows = [r for r in prior_rows
             if not (r.get('what') or '').split(' (')[0].strip().startswith('Perplexity scope check')]
with open(os.path.join(OUT, 'scope-checks.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.DictWriter(fh, fieldnames=['canonical_name', 'url', 'what', 'result'])
    w.writeheader()
    for r in base_rows:
        w.writerow(r)
    for rec in CHECKS:
        w.writerow({'canonical_name': rec['platform'], 'url': unwrap((rec.get('evidence') or [{}])[0].get('url')),
                    'what': 'Perplexity scope check (census-scope-checks-perplexity.json): ' + (rec.get('test') or '')[:80],
                    'result': (rec.get('answer') or '')})

print('matched:', matched, '| unmatched records:', unmatched)
print('changes:', len(changes))
for c in changes:
    print(f"  {c[0]}: {c[1]} -> {c[2]} | {c[3]} {c[4]} | {c[5]}")

# ---------------------------------------------------------------- SCOPE-REPORT.md regen
from collections import defaultdict, Counter
SCOPE_SPEC = json.load(open(os.path.join(BASE, '01-scope-gemini.json'), encoding='utf-8'))
IDS = {c['id']: c for c in SCOPE_SPEC['categories']}
cats = Counter(o['category_id'] for o in rows)
decs = Counter(o['scope_decision'] for o in rows)
rep = ['# Scope report', '', f'Generated: {D}', '',
       'Applied 01-scope-gemini.json mechanically to merged/shortlist-usage.csv (runs through scope-pass.py),',
       'then resolved via census-scope-checks-perplexity.json with the CFO resolution rules (scope-resolve.py).',
       'Used only facts already in our data plus logged first-party check URLs. No list positions, no traffic,', 'no affiliate status were used.', '',
       f'- rows scoped: **{len(rows)}**',
       f'- decisions: ' + ', '.join(f'{k}={v}' for k, v in sorted(decs.items())),
       f'- categories: ' + ', '.join(f'{k}={v}' for k, v in sorted(cats.items())), '',
       '## Counts per (category, decision)', '', '| category | in | borderline | out |', '|---|---|---|---|']
groups = defaultdict(list)
for o in rows:
    groups[o['category_id']].append(o)
for cat in sorted(groups):
    dd = Counter(o['scope_decision'] for o in groups[cat])
    rep.append(f"| {cat} | {dd.get('in', 0)} | {dd.get('borderline', 0)} | {dd.get('out', 0)} |")
rep += ['', '## Out rows (rule applied + needs_check)', '', '| row | rule applied | needs_check |', '|---|---|---|']
for o in rows:
    if o['scope_decision'] == 'out':
        rep.append(f"| {o['canonical_name']} | {o['rule_applied'][:250]} | {o['needs_check'][:200]} |")
rep += ['', '## Borderline rows (rule applied + needs_check)', '', '| row | rule applied | needs_check |', '|---|---|---|']
for o in rows:
    if o['scope_decision'] == 'borderline':
        rep.append(f"| {o['canonical_name']} | {o['rule_applied'][:250]} | {o['needs_check'][:250]} |")
rep += ['', '## Categories reference', '']
for cid, c in IDS.items():
    rep.append(f"- **{cid}** ({c['name']}){' (ranked separately)' if c.get('ranked_separately') else ''} — {c['definition'][:320]}")
rep += ['', '## Census-scope-checks-perplexity: every checked row, before → after', '',
        '| row | test | review verdict | before | after | deciding evidence URL |', '|---|---|---|---|---|---|']
for rec in CHECKS:
    pk = norm_key(rec['platform'])
    row2 = next((o for o in rows if norm_key(o['canonical_name']) == pk), None)
    if row2 is None:
        row2 = next((o for o in rows if pk.startswith(norm_key(o['canonical_name'])) or norm_key(o['canonical_name']).startswith(pk)), None)
    ev = unwrap((rec.get('evidence') or [{}])[0].get('url'))
    if row2:
        rep.append(f"| {row2['canonical_name']} | {rec.get('test','')[:60].split(' —')[0]} | {rec.get('answer')} | {row2.get('prior_decision_before_checks') or 'see scoped.json history'} | {row2['scope_decision']} | {ev} |")
    else:
        rep.append(f"| (recorded platform not matched) {rec['platform']} | {rec.get('test','')[:60].split(' —')[0]} | {rec.get('answer')} |  |  | {ev} |")
rep += ['', '## Variant-row side notes', '',
        '- Zeta (제타 / ゼタ): variant row of Scatterlab zeta (same product as Zeta AI); Test C unresolved applies — variant row keeps its needs_check pending the same first-party fact set.',
        '- Replika: test F unresolved → stays OUT per the CFO rule (needs_check retained). Prior decision unchanged.']
open(os.path.join(OUT, 'SCOPE-REPORT.md'), 'w', encoding='utf-8').write('\n'.join(rep) + '\n')

