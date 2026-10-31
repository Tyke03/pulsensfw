import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { articleFrontmatterSchema } from './lib/content/article-schema';
import { entitySchema } from './lib/content/entity-schema';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/articles' }),
  schema: articleFrontmatterSchema,
});

/**
 * The one catalog. Every star, site, AI app, product, and game is a row
 * here. Articles reference slugs from `articles[].entities` instead of
 * copying scores, prices, or pros/cons.
 */
const entities = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/entities' }),
  schema: entitySchema,
});

export const collections = { articles, entities };
