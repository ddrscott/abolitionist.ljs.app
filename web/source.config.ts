import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';

// Extended frontmatter to capture every field our extractor emits, so the
// values are queryable inside MDX pages without losing strict typing.
const articleSchema = frontmatterSchema.extend({
  slug: z.string().optional(),
  source_url: z.string().url().optional(),
  source_site: z.string().optional(),
  source_path: z.string().optional(),
  content_type: z.enum(['post', 'page']).optional(),
  published: z.string().optional(),
  modified: z.string().optional(),
  author: z.string().optional(),
  author_url: z.string().url().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  reading_time_minutes: z.number().optional(),
  featured_image: z.string().optional(),
  excerpt: z.string().optional(),
  source_post_id: z.number().optional(),
});

// Articles live at <project root>/pages (one level up from web/). Fumadocs
// MDX accepts any directory; no symlinks or copies needed.
//
// pages/README.md and pages/index.json are not articles — they're the human
// TOC and the machine manifest. Restrict the collection to files inside
// per-site subdirectories so those auxiliary files are ignored.
export const docs = defineDocs({
  dir: '../pages',
  docs: {
    schema: articleSchema,
    files: ['*/*.{md,mdx}'],
  },
  meta: {
    files: ['*/meta.json'],
  },
});

export default defineConfig();
