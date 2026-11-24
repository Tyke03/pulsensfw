import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

interface RawFact {
  key?: string;
  value?: string;
}

interface RawEntity {
  slug: string;
  type: 'star' | 'site' | 'ai_app' | 'frontend' | 'product' | 'game';
  name: string;
  url: string;
  summary: string;
  tags: string[];
  ranking_rationale?: string;
  pros?: string[];
  cons?: string[];
  pricing?: {
    model?: string;
    free_tier?: string | null;
  };
  image?: {
    src?: string;
    alt?: string;
    source_url?: string;
    license?: string;
    nsfw?: boolean;
  } | null;
  facts?: RawFact[];
  updated: string;
}

const V2_ROOT = fs.existsSync(path.resolve(process.cwd(), 'src/content/entities'))
  ? process.cwd()
  : path.resolve(process.cwd(), 'v2');

const ENTITIES_DIR = path.join(V2_ROOT, 'src/content/entities');
const PUBLIC_DIR = path.join(V2_ROOT, 'public');

const BANNED_STAR_SLUGS = new Set([
  'austin-wolf',
  'traci-lords',
  'alejandra-omana',
  'cara-fawn',
  'indigo-augustine',
  'dayane-callegare',
  'christina-noir',
  'boomer-banks',
  'angel',
  'ron-jeremy',
  'kim-sung-eun',
  'ami-tomite',
  'jorgito-guayaco',
  'thammy-miranda',
  // Cycle 6 Critique #6 & P39/multi-person/SFW purges
  'adajja',
  'brittany-st-jordan',
  'candace-von',
  'chloe-des-lysses',
  'christophe-bier',
  'eva-decastelo',
  'kat-kleevage',
  'lena-juliette',
  'lily-cade',
  'linda-friday',
  'lora-croft',
  'martin-mazza',
  'maurizia-paradiso',
  'michael-vegas',
  'michelle-mcgee',
  'mickey-g',
  'naughty-allie',
  'patrick-collins',
  'rhylee-richards',
  'sabrina-blond',
  'sascha',
  'thierry-schaffauser',
  // Cycle 7 Critique #7 purges
  'linse-kessler',
  'keiji-inafune',
  'chuy-bravo',
  'ivana-knoll',
  'kang-ye-won',
  'lee-tae-im',
  'kang-ye-bin',
  'choi-eun',
  'adrian-bouchet',
  'simona-fusco',
  'kelly-wearstler',
  'bruna-surfistinha',
  'joe-dallesandro',
  'kristine-debell',
  'jeana-keough',
  'jodie-marsh',
  'ozzy-lusth',
  'sara-jean-underwood',
  'shannon-tweed',
  'brande-roderick',
  'kylie-wylde',
  'nikki-nova',
  'nikita-gross',
  'wash-westmoreland',
  // Cycle 8 Critique #8 purges (NSFW/wrong-person/signature/multi-person)
  'victoria-lanz',
  'ron-athey',
  'andrew-blake',
  'billy-dee',
  'alex-taylor',
  'nadia-ali',
  'phil-varone',
  'sibel-kekilli',
  'shelley-lubben',
  'ai-himeno',
  'diamond-monrow',
  'aino-kishi',
  'daniel-weber',
  'jade-laroche',
  'eimi-fukada',
  'miki-sunohara',
  'nanami-kawakami',
]);

const BANNED_NON_STAR_SLUGS = new Set([
  'clubseventeen',
  'dohna-dohna',
  'shemalez',
  'riddle-joker',
  'tubsexer',
  'kinkclips',
  'extralunchmoney',
  'mygirlfund',
  'smutcam',
  'gaytube',
  'porndoe-premium',
  // Cycle 8 Critique #8 purges (piracy/slur/teen/duplicates/SFW-only)
  'jav-guru',
  'trannyvideosxxx',
  'ashemaletube',
  'scarleteen',
  'dame-eva',
  'buttplug-intiface-central',
  'payhip',
  'pcgamingwiki',
  'unvale',
  'dr-pinkcake',
]);

const OFFENDER_TEXT_RE = /\b(?:convicted|sex offender|csam|child sexual|pedophil|traffick|homicide|murder)\b/i;
const BAD_WAVE6_FILE_RE = /(?:_and_|(?<!on_set)_with_|unknown_|pasties|topless|nude|naked|thong|nipple|mugshot|mural|sign\.|sign_|signature|autograph|署名)/i;
const SIGNATURE_ANY_WAVE_RE = /(?:_sign\.|sign_|signature|autograph|%e7%bd%b2%e5%90%8d|署名)/i;
const RISKY_BRAND_PHRASE_RE = /\b(?:teenfidelity|college-age|young-adult)\b/i;

function loadAllEntities(): Array<{ file: string; entity: RawEntity }> {
  const files = fs.readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.json')).sort();
  return files.map((file) => ({
    file,
    entity: JSON.parse(fs.readFileSync(path.join(ENTITIES_DIR, file), 'utf8')) as RawEntity,
  }));
}

function getFactValue(entity: RawEntity, ...keys: string[]): string | undefined {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  return entity.facts?.find((f) => f.key && want.has(f.key.toLowerCase()))?.value;
}

function parseYear(val: string | undefined): number | null {
  if (!val) return null;
  const m = /(19\d\d|20\d\d)/.exec(val);
  return m ? Number(m[1]) : null;
}

function canonicalCommonsFile(sourceUrl: string): string | null {
  const idx = sourceUrl.toLowerCase().indexOf('file:');
  if (idx === -1) return null;
  const raw = sourceUrl.slice(idx + 5).split(/[?#]/)[0];
  try {
    return decodeURIComponent(raw).replace(/\s+/g, '_').toLowerCase();
  } catch {
    return raw.replace(/\s+/g, '_').toLowerCase();
  }
}

test('catalog has unique slugs matching filenames and valid on-disk SFW images', () => {
  const rows = loadAllEntities();
  assert.ok(rows.length >= 2000, `Expected at least 2000 catalog entities, found ${rows.length}`);

  const seenSlugs = new Set<string>();
  for (const { file, entity } of rows) {
    assert.equal(file, `${entity.slug}.json`, `Filename ${file} must match slug ${entity.slug}`);
    assert.ok(!seenSlugs.has(entity.slug), `Duplicate slug found: ${entity.slug}`);
    seenSlugs.add(entity.slug);
    assert.ok(!BANNED_NON_STAR_SLUGS.has(entity.slug), `Banned non-star slug must not exist: ${entity.slug}`);

    if (entity.type === 'star') {
      assert.ok(entity.image?.src, `Star ${entity.slug} must have a non-empty image.src`);
    }

    if (entity.image?.src) {
      assert.equal(entity.image.nsfw, false, `Entity ${entity.slug} image must remain SFW`);
      const imgPath = path.join(PUBLIC_DIR, entity.image.src.replace(/^\/+/, ''));
      assert.ok(fs.existsSync(imgPath), `Missing image asset on disk for ${entity.slug}: ${entity.image.src}`);
      assert.ok(fs.statSync(imgPath).size > 500, `Empty/corrupt image asset for ${entity.slug}: ${entity.image.src}`);
    }
  }
});

test('stars pass CSAM/offender exclusion, adulthood compliance, and unique Commons portrait rules', () => {
  const rows = loadAllEntities().filter((r) => r.entity.type === 'star');
  const commonsFiles = new Map<string, string>();
  const normalizedNames = new Map<string, string>();

  for (const { entity } of rows) {
    assert.ok(!BANNED_STAR_SLUGS.has(entity.slug), `Banned star slug must not exist: ${entity.slug}`);
    assert.ok(
      !OFFENDER_TEXT_RE.test(`${entity.name} ${entity.summary}`),
      `Star ${entity.slug} summary failed offender keyword exclusion`,
    );

    const normName = entity.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normName.length >= 4) {
      assert.ok(
        !normalizedNames.has(normName),
        `Duplicate normalized star name "${entity.name}" (${entity.slug} conflicts with ${normalizedNames.get(normName)})`,
      );
      normalizedNames.set(normName, entity.slug);
    }

    const bornRaw = getFactValue(entity, 'Born', 'Birth year', 'DOB');
    const bornYear = parseYear(bornRaw);
    if (bornYear !== null) {
      assert.ok(bornYear >= 1935 && bornYear <= 2003, `Star ${entity.slug} has disallowed birth year ${bornYear}`);
    }

    if (entity.updated >= '2026-11-25') {
      assert.ok(bornYear !== null && bornYear <= 2003, `Recent star ${entity.slug} (${entity.updated}) must include Born <= 2003`);

      const ctRaw = getFactValue(entity, 'Career timeline');
      const startMatch = ctRaw ? /Active\s+(19\d\d|20\d\d)/.exec(ctRaw) : null;
      if (startMatch && bornYear !== null) {
        const startYear = Number(startMatch[1]);
        assert.ok(
          startYear - bornYear >= 18,
          `Star ${entity.slug} career start ${startYear} minus birth year ${bornYear} < 18`,
        );
      }

      const sumBorn = /\((?:born|b\.)\s*(19\d\d|20\d\d)/i.exec(entity.summary);
      if (sumBorn && bornYear !== null) {
        assert.equal(
          Number(sumBorn[1]),
          bornYear,
          `Star ${entity.slug} summary year ${sumBorn[1]} disagrees with Born fact ${bornYear}`,
        );
      }
    }

    const cFile = entity.image?.source_url ? canonicalCommonsFile(entity.image.source_url) : null;
    if (cFile) {
      assert.ok(
        !commonsFiles.has(cFile),
        `Duplicate Wikimedia Commons image "${cFile}" shared by ${entity.slug} and ${commonsFiles.get(cFile)}`,
      );
      commonsFiles.set(cFile, entity.slug);
      assert.ok(
        !SIGNATURE_ANY_WAVE_RE.test(cFile),
        `Star ${entity.slug} Commons filename must not be an autograph/signature: ${cFile}`,
      );
      if (entity.updated >= '2026-11-26') {
        assert.ok(
          !BAD_WAVE6_FILE_RE.test(cFile),
          `Wave 6 star ${entity.slug} Commons filename failed SFW/solo check: ${cFile}`,
        );
      }
    }

    if (entity.updated >= '2026-11-26') {
      assert.ok(
        !/\b(?:born|b\.)\s*(19\d\d|20\d\d)\s*\(b\.\s*\1\)/i.test(entity.summary),
        `Wave 6 star ${entity.slug} has duplicate birth year in summary`,
      );
    }
  }
});

test('non-stars pass hub hygiene, free_tier integrity, unique new URLs, and copy checks', () => {
  const rows = loadAllEntities().filter((r) => r.entity.type !== 'star');
  const MANUAL_PRODUCTS = new Set([
    'tenga-flip-zero',
    'tenga-flip-orb',
    'magic-wand-plus',
    'magic-wand-original',
    'womanizer-duo-2',
    'lelo-ina-3',
    'dame-aer',
    'le-wand-petite',
    'aneros-progasm',
    'njoy-pure-plug-2',
    'tenga-egg',
  ]);
  const UTILITY_NO_VR_SLUGS = new Set([
    'eroscripts',
    'xbvr',
    'whisparr',
    'funscript-io',
    'handyfeeling',
    'multi-fun-player',
    'openfunscripter',
    'scriptplayer',
    'stripchat-vr',
  ]);
  const NON_PLATFORM_SLUGS = new Set([
    'itch-io-adult',
    'booth-pm',
    'getchu',
    'toranoana',
    'digiket',
    'skeb',
    'fansmetrics',
    'hubite',
    'suruga-ya',
    'mandarake',
    'vgen',
  ]);
  const ART_STREAM_SLUGS = new Set(['picarto', 'piczel']);
  const NO_FREE_TIER_SLUGS = new Set([
    'babeland',
    'good-vibrations',
    'lovehoney',
    'peepshow-toys',
    'shevibe',
    'suruga-ya',
    'mandarake',
    'getchu',
    'toranoana',
    'digiket',
    'skeb',
    'allthingsworn',
    'snifffr',
    'throne',
    'youpay',
    'curvage',
    'mfc-share',
    'cammodeldirectory',
    'futekiya',
    'radish-fiction',
    'bomtoon',
    'coolmic',
    'ridibooks',
    'tappytoon',
    'manta-comics',
    'toomics',
    'dfans-ai',
    'crushlive',
    'islive',
    'komiflo',
  ]);

  const canonicalUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, 'https://').replace(/\/+$/, '');
  const urlToSlugs = new Map<string, string[]>();
  for (const { entity } of rows) {
    const normUrl = canonicalUrl(entity.url);
    const list = urlToSlugs.get(normUrl) ?? [];
    list.push(entity.slug);
    urlToSlugs.set(normUrl, list);

    const tagsLower = entity.tags.map((t) => t.toLowerCase());

    if (entity.type === 'ai_app') {
      assert.ok(!tagsLower.includes('ai'), `AI app ${entity.slug} must not have redundant "ai" tag`);
      assert.ok(!tagsLower.includes('nsfw'), `AI app ${entity.slug} must not have redundant "nsfw" tag`);
    }

    if (entity.type === 'product') {
      assert.ok(!tagsLower.includes('sex-tech'), `Product ${entity.slug} must not have redundant "sex-tech" tag`);
      if (tagsLower.includes('manual') || MANUAL_PRODUCTS.has(entity.slug)) {
        assert.ok(
          !tagsLower.includes('haptics') && !tagsLower.includes('app'),
          `Manual product ${entity.slug} must not carry haptics/app tags`,
        );
      }
    }

    if (UTILITY_NO_VR_SLUGS.has(entity.slug)) {
      assert.ok(!tagsLower.includes('vr'), `Utility site ${entity.slug} must not carry "vr" tag`);
    }

    if (NON_PLATFORM_SLUGS.has(entity.slug)) {
      assert.ok(
        !tagsLower.includes('platform') && !tagsLower.includes('creator'),
        `Store/directory ${entity.slug} must not carry creator-platform tags`,
      );
    }

    if (ART_STREAM_SLUGS.has(entity.slug)) {
      assert.ok(!tagsLower.includes('live') && !tagsLower.includes('cams'), `Art stream ${entity.slug} must not leak into Live Cams`);
    }

    if (NO_FREE_TIER_SLUGS.has(entity.slug)) {
      assert.equal(entity.pricing?.free_tier ?? null, null, `Retail/transactional site ${entity.slug} must set pricing.free_tier = null`);
    }

    const copyBlob = [entity.summary, entity.ranking_rationale ?? '', ...(entity.pros ?? []), ...(entity.cons ?? [])].join(' ');
    assert.ok(!copyBlob.includes('$$'), `Entity ${entity.slug} contains $$ typo`);
    assert.ok(!entity.name.includes('☆'), `Entity ${entity.slug} name contains missing-glyph symbol`);
    if (entity.updated >= '2026-11-26') {
      assert.ok(!RISKY_BRAND_PHRASE_RE.test(copyBlob), `Wave 6+ entity ${entity.slug} contains disallowed risky phrasing`);
    }
    if (entity.updated >= '2026-11-27' && entity.ranking_rationale) {
      assert.ok(
        !/\(trade-off:\s*[^)]*\([^)]*\)[^)]*\)/.test(entity.ranking_rationale),
        `Wave 7 entity ${entity.slug} ranking_rationale contains nested parentheses`,
      );
    }

    const catFact = getFactValue(entity, 'Category');
    if (catFact) {
      assert.notEqual(catFact, 'Vr & Games', `Category fact casing bug on ${entity.slug}`);
      assert.notEqual(catFact, 'Vr Studio', `Category fact casing bug on ${entity.slug}`);
      assert.notEqual(catFact, 'Local Ai', `Category fact casing bug on ${entity.slug}`);
      assert.notEqual(catFact, 'Ai Platform', `Category fact casing bug on ${entity.slug}`);
      if (catFact === 'Directory / Forum' && entity.updated >= '2026-11-26') {
        assert.ok(
          !tagsLower.includes('cams') && !tagsLower.includes('live'),
          `Directory/Forum ${entity.slug} must not leak into Live Cams`,
        );
      }
    }
  }

  for (const { entity } of rows.filter((r) => r.entity.updated >= '2026-11-26')) {
    const normUrl = canonicalUrl(entity.url);
    const peers = urlToSlugs.get(normUrl) ?? [];
    assert.equal(peers.length, 1, `Wave 6 entity ${entity.slug} duplicates URL ${normUrl} with ${peers.join(', ')}`);
  }
});
