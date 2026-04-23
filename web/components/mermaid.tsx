'use client';

import { useEffect, useId, useRef, useState } from 'react';

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
      });
      try {
        const { svg } = await mermaid.render(`m-${id}`, chart);
        if (!cancelled) setSvg(svg);
      } catch (err) {
        if (!cancelled) setSvg(`<pre>${String(err)}</pre>`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <div
      ref={ref}
      className="not-prose my-6 overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-4"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? null : <pre className="text-xs text-fd-muted-foreground">{chart}</pre>}
    </div>
  );
}
