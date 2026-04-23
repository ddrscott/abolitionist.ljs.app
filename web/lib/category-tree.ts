import type * as PageTree from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';

const UNCATEGORIZED = 'Uncategorized';
const JOURNEY = 'Reader Journey';

// Explicit reading order for the Journey folder. Matches the path list
// in pages/journey/index.mdx. Anything not in this list is appended
// alphabetically by slug (future additions don't break the layout).
const JOURNEY_SLUG_ORDER = [
  'index',
  'path-secular-pro-choice',
  'path-christian-pro-choice',
  'path-personally-opposed',
  'path-pro-life-with-exceptions',
  'path-pro-life-incrementalist',
  'path-apathetic-christian',
  'path-anti-abortion-non-christian',
  'next-steps',
];

/**
 * Build a Fumadocs page tree where the top level is the article's WordPress
 * categories (curated by the original editors), each containing articles
 * sorted newest-first. Articles with multiple categories appear under each.
 *
 * The "Reader Journey" category is pinned to the top of the sidebar (above
 * "All Articles") because it's the primary orientation path for new readers.
 * Everything else sorts alphabetically with "Uncategorized" at the bottom.
 *
 * Articles still resolve at their original `/pages/<site>/<slug>` URLs; only
 * the sidebar shape changes.
 */
export function buildCategoryTree(): PageTree.Root {
  const pages = source.getPages();

  const buckets = new Map<string, typeof pages>();
  for (const page of pages) {
    const cats = (page.data.categories as string[] | undefined) ?? [];
    const targets = cats.length > 0 ? cats : [UNCATEGORIZED];
    for (const cat of targets) {
      const list = buckets.get(cat) ?? [];
      list.push(page);
      buckets.set(cat, list);
    }
  }

  const sortedCategories = [...buckets.keys()]
    .filter((c) => c !== JOURNEY)
    .sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });

  const byPublishedDesc = (a: (typeof pages)[number], b: (typeof pages)[number]) =>
    String(b.data.published ?? '').localeCompare(String(a.data.published ?? ''));

  const makeFolder = (
    label: string,
    articles: typeof pages,
    defaultOpen = false,
  ): PageTree.Folder => ({
    type: 'folder',
    name: `${label} (${articles.length})`,
    defaultOpen,
    children: articles.map((p) => ({
      type: 'page',
      name: p.data.title as string,
      url: p.url,
      description: p.data.source_site as string | undefined,
    })),
  });

  const children: PageTree.Node[] = sortedCategories.map((cat) => {
    const articles = buckets.get(cat)!.slice().sort(byPublishedDesc);
    return makeFolder(cat, articles);
  });

  // Journey folder: explicit reading order (not newest-first — journey
  // pages have no `published` date, and the order here matches the map).
  const journeyPages = buckets.get(JOURNEY);
  const journeyFolder = journeyPages
    ? [
        makeFolder(
          'Journey',
          journeyPages.slice().sort((a, b) => {
            const ai = JOURNEY_SLUG_ORDER.indexOf(String(a.data.slug ?? ''));
            const bi = JOURNEY_SLUG_ORDER.indexOf(String(b.data.slug ?? ''));
            // Known slugs sort by explicit index; unknowns go to the end
            // and fall back to alphabetical by slug for stability.
            const ax = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
            const bx = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
            if (ax !== bx) return ax - bx;
            return String(a.data.slug ?? '').localeCompare(String(b.data.slug ?? ''));
          }),
          true,
        ),
      ]
    : [];

  return {
    name: 'Categories',
    children: [
      ...journeyFolder,
      {
        type: 'page',
        name: 'All Articles',
        url: '/pages',
      },
      { type: 'separator', name: 'By Category' },
      ...children,
    ],
  };
}
