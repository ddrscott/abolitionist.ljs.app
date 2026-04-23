import Link from 'next/link';
import { ChatBox } from '@/components/chat-box';

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Ask the Abolitionist
        </h1>
        <p className="text-fd-muted-foreground">
          Straight answers on abortion, grounded in the writings of the
          abolitionist movement to abolish it. For street dialog, for
          conversations with skeptics, or if you&rsquo;re hearing about us
          for the first time.
        </p>
      </header>

      <ChatBox />

      <section className="mt-8 rounded-lg border border-fd-primary/40 bg-fd-primary/5 p-6">
        <h2 className="mb-2 text-xl font-semibold">
          New to all this? Start where you are.
        </h2>
        <p className="mb-4 text-fd-muted-foreground">
          The Journey is a short reading path tailored to the position you
          hold today. Seven starting points &mdash; from &ldquo;abortion
          should be legal&rdquo; to &ldquo;I believe it&rsquo;s wrong but
          I&rsquo;m not doing anything.&rdquo; Pick yours.
        </p>
        <Link
          href="/pages/journey"
          className="inline-block rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
        >
          Find your starting point →
        </Link>
      </section>

      <footer className="mt-8 flex flex-wrap items-center gap-3 text-sm text-fd-muted-foreground">
        <Link href="/pages" className="underline hover:text-fd-primary">
          Browse every article →
        </Link>
        <span>·</span>
        <span>
          <code className="mx-1 rounded bg-fd-muted px-1.5 py-0.5 text-xs">
            abolitionistsrising.com
          </code>
          <code className="mx-1 rounded bg-fd-muted px-1.5 py-0.5 text-xs">
            freethestates.org
          </code>
        </span>
      </footer>
    </main>
  );
}
