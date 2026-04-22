import type * as PageTree from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';

const UNCATEGORIZED = 'Uncategorized';

/**
 * Build a Fumadocs page tree where the top level is the article's WordPress
 * categories (curated by the original editors), each containing articles
 * sorted newest-first. Articles with multiple categories appear under each.
 *
 * Articles still resolve at their original `/docs/<site>/<slug>` URLs; only
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

  const sortedCategories = [...buckets.keys()].sort((a, b) => {
    // Always sink "Uncategorized" to the bottom.
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  const children: PageTree.Node[] = sortedCategories.map((cat) => {
    const articles = buckets.get(cat)!.slice().sort((a, b) =>
      String(b.data.published ?? '').localeCompare(
        String(a.data.published ?? ''),
      ),
    );
    const folder: PageTree.Folder = {
      type: 'folder',
      name: `${cat} (${articles.length})`,
      defaultOpen: false,
      children: articles.map((p) => ({
        type: 'page',
        name: p.data.title as string,
        url: p.url,
        description: p.data.source_site as string | undefined,
      })),
    };
    return folder;
  });

  return {
    name: 'Categories',
    children: [
      // A persistent link to the flat /docs catalog.
      {
        type: 'page',
        name: 'All Articles',
        url: '/docs',
      },
      { type: 'separator', name: 'By Category' },
      ...children,
    ],
  };
}
