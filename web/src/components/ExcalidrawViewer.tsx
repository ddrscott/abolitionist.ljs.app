import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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

// The map is authored as a tall vertical flowchart, so fitting the
// whole thing to the viewport collapses it past readable. Instead we
// compute the zoom that makes the diagram's WIDTH match the container
// width (with a little padding) and scroll to the top of the scene.
// The reader can then scroll / swipe vertically to traverse.
type ExcalidrawAPI = {
  getSceneElements: () => ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    isDeleted?: boolean;
  }>;
  updateScene: (input: {
    appState: {
      zoom: { value: number };
      scrollX: number;
      scrollY: number;
    };
  }) => void;
};

export function ExcalidrawViewer() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const fitToWidth = useCallback(() => {
    const api = apiRef.current;
    const container = containerRef.current;
    if (!api || !container) return;
    const elements = api
      .getSceneElements()
      .filter((el) => !el.isDeleted && Number.isFinite(el.x));
    if (elements.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y < minY) minY = el.y;
    }
    const contentWidth = maxX - minX;
    const viewportWidth = container.clientWidth;
    const padding = 24;
    if (contentWidth <= 0 || viewportWidth <= padding * 2) return;

    const zoom = (viewportWidth - padding * 2) / contentWidth;
    // Excalidraw transforms scene coords to screen via
    //   screen = (scene + scroll) * zoom
    // so to place the diagram's top-left at (padding, padding):
    //   scroll = padding/zoom - min
    const scrollX = padding / zoom - minX;
    const scrollY = padding / zoom - minY;

    api.updateScene({
      appState: { zoom: { value: zoom }, scrollX, scrollY },
    });
  }, []);

  // Refit once the API is ready + on viewport resize.
  useEffect(() => {
    if (!initialData) return;
    // One retry after a tick in case the canvas is still sizing up on
    // first mount.
    const timers = [setTimeout(fitToWidth, 50), setTimeout(fitToWidth, 250)];
    const onResize = () => fitToWidth();
    window.addEventListener('resize', onResize);
    return () => {
      for (const t of timers) clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [initialData, fitToWidth]);

  if (error) {
    return <Placeholder>Couldn&rsquo;t load the journey map: {error}</Placeholder>;
  }
  if (!initialData) {
    return <Placeholder>Loading journey map&hellip;</Placeholder>;
  }

  return (
    <div
      ref={containerRef}
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
          excalidrawAPI={(api: ExcalidrawAPI) => {
            apiRef.current = api;
            // Run the initial fit after the API hands us control. The
            // useEffect above also runs a pair of delayed fits to cover
            // slower mounts.
            setTimeout(fitToWidth, 0);
          }}
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
