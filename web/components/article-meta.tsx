type Props = {
  data: Record<string, unknown>;
};

function fmt(date: string | undefined) {
  if (!date) return undefined;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function ArticleMeta({ data }: Props) {
  const author = data.author as string | undefined;
  const authorUrl = data.author_url as string | undefined;
  const published = fmt(data.published as string | undefined);
  const sourceUrl = data.source_url as string | undefined;
  const sourceSite = data.source_site as string | undefined;
  const readingTime = data.reading_time_minutes as number | undefined;
  const categories = (data.categories as string[] | undefined) ?? [];
  const tags = (data.tags as string[] | undefined) ?? [];

  return (
    <div className="border-fd-border text-fd-muted-foreground my-6 rounded-md border bg-fd-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {author && (
          <span>
            <strong className="text-fd-foreground">By </strong>
            {authorUrl ? (
              <a
                href={authorUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {author}
              </a>
            ) : (
              author
            )}
          </span>
        )}
        {published && <span>· {published}</span>}
        {readingTime != null && <span>· {readingTime} min read</span>}
        {sourceSite && (
          <span>
            ·{' '}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              source ({sourceSite})
            </a>
          </span>
        )}
      </div>
      {(categories.length > 0 || tags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {categories.map((c) => (
            <span
              key={`cat-${c}`}
              className="rounded-full bg-fd-primary/10 px-2 py-0.5 text-fd-primary"
            >
              {c}
            </span>
          ))}
          {tags.map((t) => (
            <span
              key={`tag-${t}`}
              className="border-fd-border rounded-full border px-2 py-0.5"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
