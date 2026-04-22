import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import { ArticleMeta } from '@/components/article-meta';

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug ?? [];

  // No slug means the /docs index — render a flat catalog of every article
  // grouped by source site, newest first. Real article routes fall through.
  if (slug.length === 0) {
    return <DocsIndex />;
  }

  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const data = page.data;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{data.title}</DocsTitle>
      {data.description ? (
        <DocsDescription>{data.description}</DocsDescription>
      ) : data.excerpt ? (
        <DocsDescription>{data.excerpt as string}</DocsDescription>
      ) : null}
      <ArticleMeta data={data as unknown as Record<string, unknown>} />
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

function DocsIndex() {
  const pages = source.getPages();
  const bySite = new Map<string, typeof pages>();
  for (const page of pages) {
    const site = (page.data.source_site as string | undefined) ?? 'unknown';
    const list = bySite.get(site) ?? [];
    list.push(page);
    bySite.set(site, list);
  }

  return (
    <DocsPage>
      <DocsTitle>All Articles</DocsTitle>
      <DocsDescription>
        {pages.length} articles extracted from{' '}
        {[...bySite.keys()].sort().join(' and ')}.
      </DocsDescription>
      <DocsBody>
        {[...bySite.entries()]
          .sort()
          .map(([site, items]) => (
            <section key={site}>
              <h2>{site}</h2>
              <ul>
                {items
                  .slice()
                  .sort((a, b) =>
                    String(b.data.published ?? '').localeCompare(
                      String(a.data.published ?? ''),
                    ),
                  )
                  .map((p) => {
                    const date = String(p.data.published ?? '').slice(0, 10);
                    return (
                      <li key={p.url}>
                        <Link href={p.url}>{p.data.title}</Link>
                        {date && (
                          <span className="text-fd-muted-foreground">
                            {' '}
                            · {date}
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug ?? [];
  if (slug.length === 0) {
    return {
      title: 'All Articles',
      description: 'Searchable archive of every extracted article.',
    };
  }
  const page = source.getPage(slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description:
      page.data.description ?? (page.data.excerpt as string | undefined),
  };
}
