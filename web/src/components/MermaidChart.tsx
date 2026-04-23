import { useEffect, useId, useState } from 'react';

type Props = {
  chart: string;
  caption?: string;
};

export function MermaidChart({ chart, caption }: Props) {
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        mermaid.initialize({
          startOnLoad: false,
          theme: prefersDark ? 'dark' : 'default',
          securityLevel: 'loose',
          flowchart: { htmlLabels: true, curve: 'basis' },
        });
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(svg);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <figure className="mermaid-figure">
      {error ? (
        <pre className="mermaid-error">
          <code>Mermaid failed to render: {error}</code>
        </pre>
      ) : svg ? (
        <div
          className="mermaid-svg"
          // Mermaid output is trusted (we author it in MDX) and produced
          // by mermaid's own renderer. Rendering as HTML lets the <a>
          // elements emitted from our `click` directives work as links.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre className="mermaid-loading" aria-hidden="true">
          <code>{chart}</code>
        </pre>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
