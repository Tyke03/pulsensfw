import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { entitySchema, type Entity } from '../src/lib/content/entity-schema';
import { submissionSchema } from '../src/lib/content/submission-schema';

const fileArg = process.argv.slice(2).find((arg) => arg !== '--force');
if (!fileArg) {
  console.error('Usage: npm run ingest -- path/to/submission.json [--force]');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const entitiesDir = resolve(root, 'src/content/entities');
const articlesDir = resolve(root, 'src/content/articles');
const force = process.argv.includes('--force');
const today = new Date().toISOString().slice(0, 10);

function fail(message: string): never {
  console.error(`ingest: ${message}`);
  process.exit(1);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`cannot read ${path}: ${(error as Error).message}`);
  }
}

const parsed = submissionSchema.safeParse(readJson(resolve(process.cwd(), fileArg)));
if (!parsed.success) {
  console.error(parsed.error.flatten());
  fail('submission did not match src/schemas/submission.json');
}

const { article, entity_updates: updates } = parsed.data;
const currentSlugs = new Set(
  readdirSync(entitiesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, '')),
);
const updateSlugs = new Set(updates.map((update) => update.slug));
for (const slug of article.entities) {
  if (!currentSlugs.has(slug) && !updateSlugs.has(slug)) {
    fail(`article references unknown entity "${slug}" and no update in this submission creates it`);
  }
}

function mergeEntity(existing: Entity, update: (typeof updates)[number]): Entity {
  const next: Entity = {
    ...existing,
    type: update.type ?? existing.type,
    url: update.url ?? existing.url,
    affiliate_url: update.affiliate_url ?? existing.affiliate_url,
    summary: update.summary ?? existing.summary,
    tags: update.tags ?? existing.tags,
    platforms: update.platforms ?? existing.platforms,
    score: update.score !== undefined ? update.score : existing.score,
    pros: update.pros ?? existing.pros,
    cons: update.cons ?? existing.cons,
    updated: update.updated ?? today,
  };
  if (update.pricing) {
    next.pricing = {
      ...existing.pricing,
      ...update.pricing,
      plans: update.pricing.plans ?? existing.pricing.plans,
    };
  }
  if (update.image) {
    next.image = { ...existing.image, ...update.image };
  }
  if (update.facts) {
    const facts = new Map(existing.facts.map((fact) => [fact.key, fact]));
    for (const fact of update.facts) facts.set(fact.key, fact);
    next.facts = [...facts.values()];
  }
  return next;
}

for (const update of updates) {
  const path = resolve(entitiesDir, `${update.slug}.json`);
  if (existsSync(path)) {
    const existing = entitySchema.safeParse(readJson(path));
    if (!existing.success) {
      console.error(existing.error.flatten());
      fail(`existing entity "${update.slug}" is invalid`);
    }
    const merged = entitySchema.safeParse(mergeEntity(existing.data, update));
    if (!merged.success) {
      console.error(merged.error.flatten());
      fail(`merged entity "${update.slug}" is invalid`);
    }
    writeFileSync(path, `${JSON.stringify(merged.data, null, 2)}\n`);
    console.log(`updated entity ${update.slug}`);
  } else {
    const created = entitySchema.safeParse({ ...update, updated: update.updated ?? today });
    if (!created.success) {
      console.error(created.error.flatten());
      fail(`new entity "${update.slug}" must include every required entity field`);
    }
    writeFileSync(path, `${JSON.stringify(created.data, null, 2)}\n`);
    console.log(`created entity ${update.slug}`);
  }
}

const articlePath = resolve(articlesDir, `${article.slug}.mdx`);
if (existsSync(articlePath) && !force) {
  fail(`article "${article.slug}" already exists; pass --force to overwrite`);
}
const { body, ...frontmatter } = article;
if (!frontmatter.checkedAt) frontmatter.checkedAt = today;
const header = stringify(frontmatter, { lineWidth: 0 });
writeFileSync(articlePath, `---\n${header}---\n\n${body.trim()}\n`);
console.log(`wrote article ${article.slug}.mdx`);
console.log(`ingest ok: ${updates.length} entity update(s), ${article.entities.length} entity reference(s)`);
