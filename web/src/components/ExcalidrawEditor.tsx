import { useEffect, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

// The editor loads our starter file from /journey-map.excalidraw so
// the user lands on the map-in-progress, not an empty canvas. From
// there, Excalidraw's built-in File menu handles Save to Disk (which
// downloads a fresh .excalidraw file). Drop that file back in
// web/public/journey-map.excalidraw to make your changes the new
// starter on the next deploy.

type InitialData = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  scrollToContent: boolean;
};

export function ExcalidrawEditor() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/journey-map.excalidraw', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setInitialData({
          elements: data.elements ?? [],
          appState: {
            ...(data.appState ?? {}),
            // Avoid persisting stray collab/user-specific state from
            // the generator output.
            collaborators: undefined,
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
    return (
      <div style={{ padding: '2rem', fontFamily: 'EB Garamond, serif' }}>
        <h1>Couldn&rsquo;t load the starter diagram</h1>
        <p>
          <code>/journey-map.excalidraw</code>: {error}
        </p>
        <p>
          Try regenerating it with
          <code> node scripts/generate-journey-excalidraw.mjs </code>
          then refreshing.
        </p>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'EB Garamond, serif' }}>
        Loading starter diagram…
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Excalidraw
        initialData={initialData}
        theme="light"
        UIOptions={{
          canvasActions: {
            loadScene: true,
            saveToActiveFile: true,
            export: { saveFileToDisk: true },
            saveAsImage: true,
          },
        }}
      />
    </div>
  );
}
