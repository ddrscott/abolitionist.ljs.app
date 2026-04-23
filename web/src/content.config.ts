import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';

// Extend Starlight's frontmatter schema with the fields our extractor emits.
// Every field is optional because journey MDX and some articles may lack
// certain fields; downstream components tolerate `undefined`.
const articleExtras = z.object({
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

export const collections = {
  // The canonical content corpus lives at <project root>/pages (one level
  // up from web/). A custom glob loader reads it from outside the Astro
  // src tree so the corpus stays portable across framework choices.
  //
  // Entry IDs are mapped so URLs land at `/pages/<site>/<slug>/` and
  // `/pages/journey/<slug>/` — preserving the public URL contract that
  // the chat citations (R2 key → URL) depend on.
  docs: defineCollection({
    loader: glob({
      // Per-site subdirs only; the auto-generated pages/README.md sits at
      // the top level and is excluded by requiring at least one subdir.
      pattern: '*/**/*.{md,mdx}',
      base: '../pages',
      generateId: ({ entry }) => {
        // entry is the relative path like "abolitionistsrising.com/foo.md"
        // or "journey/path-secular-pro-choice.mdx".
        // Prepend "pages/" so Starlight serves the content at /pages/<...>/.
        const stripped = entry.replace(/\.(md|mdx)$/, '');
        return `pages/${stripped}`;
      },
    }),
    schema: docsSchema({ extend: articleExtras }),
  }),
};
