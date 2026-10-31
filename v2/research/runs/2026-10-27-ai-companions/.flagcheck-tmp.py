import csv, sys, re
sys.stdout.reconfigure(encoding='utf-8')
pre = list(csv.DictReader(open('merged/pre-argon/shortlist.csv', encoding='utf-8-sig')))
cur = list(csv.DictReader(open('merged/shortlist.csv', encoding='utf-8-sig')))
def nkey(s): return re.sub(r'[^a-z0-9]+', '', (s or '').lower())
for pat in ['love', 'nsfwg', 'pephop', 'soulkyn', 'dream companion', 'dreampress', 'lovescape']:
    hits = [r['canonical_name'] for r in pre if pat in r['canonical_name'].lower()]
    curh = [r['canonical_name'] for r in cur if pat in r['canonical_name'].lower()]
    print(pat, '| PRE:', hits, '| CUR:', curh)
print()
# test nucleus: naive looks_dup emulation
def norm_name(s):
    s = (s or '').lower().strip()
    s = re.sub(r'[^a-z0-9]+', '', s)
    for suf in ('chatbot','companion','girlfriend','boyfriend','app','chat','web','site','online','platform','com','org','net','io','official'):
        if s.endswith(suf) and len(s)-len(suf) >= 4: s = s[:-len(suf)]
    return s
def looks_dup(new_name, old_name):
    na, nb = norm_name(new_name), norm_name(old_name)
    if not na or not nb: return False
    if na.startswith(nb) or nb.startswith(na): return True
    ta = set(t for t in re.split(r'[\s\-]+', na) if t not in ('ai','app','chat'))
    tb = set(t for t in re.split(r'[\s\-]+', nb) if t not in ('ai','app','chat'))
    return bool(ta and tb and (ta <= tb or tb <= ta))
print('looks_dup(Lovescape, LoveChat):', looks_dup('Lovescape','LoveChat'))
print('norm LoveChat:', norm_name('LoveChat'), 'norm Lovescape:', norm_name('Lovescape'))
