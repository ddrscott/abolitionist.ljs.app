import Link from 'next/link';
import { source } from '@/lib/source';
import { ChatBox } from '@/components/chat-box';

export default function HomePage() {
  const pages = source.getPages();
  const sites = new Set<string>();
  for (const p of pages) {
    const s = p.data.source_site as string | undefined;
    if (s) sites.add(s);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Ask the Abolition Archive
        </h1>
        <p className="text-fd-muted-foreground">
          {pages.length} articles from {[...sites].sort().join(' and ')}, indexed
          and queryable. Answers are generated from the corpus and link back to
          the source articles.
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-fd-primary/40 bg-fd-primary/5 p-6">
        <h2 className="mb-2 text-xl font-semibold">New here? Start the reader journey.</h2>
        <p className="mb-4 text-fd-muted-foreground">
          Seven guided paths that take you from your current view of abortion to
          the abolitionist position this archive defends. Pick the one that fits
          you.
        </p>
        <Link
          href="/pages/journey"
          className="inline-block rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
        >
          Start the journey →
        </Link>
      </section>

      <ChatBox />

      <footer className="mt-8 flex flex-wrap items-center gap-3 text-sm text-fd-muted-foreground">
        <Link href="/pages" className="underline hover:text-fd-primary">
          Browse all {pages.length} articles →
        </Link>
        <span>·</span>
        <span>
          {[...sites].sort().map((s) => (
            <code key={s} className="mx-1 rounded bg-fd-muted px-1.5 py-0.5 text-xs">
              {s}
            </code>
          ))}
        </span>
      </footer>
    </main>
  );
}
