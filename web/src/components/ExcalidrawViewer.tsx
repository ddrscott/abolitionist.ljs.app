import { Suspense, lazy, useEffect, useState } from 'react';
import '@excalidraw/excalidraw/index.css';

// Excalidraw's module touches `window` at the top level, which crashes
// Astro/Starlight's MDX prerender even when the component is mounted
// with `client:only="react"` — the MDX pipeline still walks the
// import chain. React.lazy defers the JS import until the component
// renders in the browser, sidestepping the SSR evaluation entirely.
// The CSS import is safe to keep static; Vite transforms it into a
// style injection rather than JS execution.
const LazyExcalidraw = lazy(async () => {
  const mod = await import('@excalidraw/excalidraw');
  return { default: mod.Excalidraw };
});

type InitialData = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  scrollToContent: boolean;
};

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '1rem', fontFamily: 'EB Garamond, serif', color: '#6b7280' }}>
      {children}
    </div>
  );
}

export function ExcalidrawViewer() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/journey-map.excalidraw', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw: unknown) => {
        const data = raw as { elements?: unknown[]; files?: Record<string, unknown> };
        setInitialData({
          elements: data.elements ?? [],
          appState: {
            theme: 'light',
            viewBackgroundColor: '#FFFFFF',
            gridSize: null,
          },
          files: data.files ?? {},
          scrollToContent: true,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (error) {
    return <Placeholder>Couldn&rsquo;t load the journey map: {error}</Placeholder>;
  }
  if (!initialData) {
    return <Placeholder>Loading journey map&hellip;</Placeholder>;
  }

  return (
    <div
      style={{
        height: '80vh',
        width: '100%',
        minHeight: 520,
        border: '1px solid #C49A6E',
        marginBlock: '1rem',
      }}
    >
      <Suspense fallback={<Placeholder>Loading journey map&hellip;</Placeholder>}>
        <LazyExcalidraw
          initialData={initialData as never}
          theme="light"
          viewModeEnabled
          zenModeEnabled
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: false,
              clearCanvas: false,
              toggleTheme: false,
              changeViewBackgroundColor: false,
            },
          }}
        />
      </Suspense>
    </div>
  );
}
