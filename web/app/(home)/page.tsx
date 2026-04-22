import Link from 'next/link';
import { source } from '@/lib/source';

export default function HomePage() {
  const pages = source.getPages();
  const bySite = new Map<string, typeof pages>();
  for (const page of pages) {
    const site = (page.data.source_site as string | undefined) ?? 'unknown';
    const list = bySite.get(site) ?? [];
    list.push(page);
    bySite.set(site, list);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-4xl font-bold">Abolition Knowledge Base</h1>
      <p className="text-fd-muted-foreground mb-8">
        Searchable archive of {pages.length} articles from{' '}
        <code>abolitionistsrising.com</code> and <code>freethestates.org</code>.
      </p>
      <Link
        href="/docs"
        className="inline-flex items-center rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:opacity-90"
      >
        Browse all articles →
      </Link>

      <div className="mt-12 grid gap-8">
        {[...bySite.entries()].sort().map(([site, items]) => (
          <section key={site}>
            <h2 className="mb-2 text-xl font-semibold">{site}</h2>
            <p className="text-fd-muted-foreground text-sm">
              {items.length} article{items.length === 1 ? '' : 's'}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
