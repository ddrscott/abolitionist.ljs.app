import { useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

// The editor starts from localStorage if a draft exists, or falls back
// to /journey-map.excalidraw (the version-controlled starter). Every
// change is auto-saved to localStorage (debounced) so you can close the
// tab without losing work. Use File → Save to Disk to export the
// authoritative version into the repo.

const STORAGE_KEY = 'journey-map-draft-v1';
const SAVE_DEBOUNCE_MS = 600;

type InitialData = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  scrollToContent: boolean;
};

type SavedShape = {
  elements: unknown[];
  files?: Record<string, unknown>;
  savedAt?: string;
};

export function ExcalidrawEditor() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'draft' | 'starter' | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStarter = async () => {
      try {
        const r = await fetch('/journey-map.excalidraw', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> };
        if (cancelled) return;
        setInitialData({
          elements: data.elements ?? [],
          appState: {
            theme: 'light',
            viewBackgroundColor: '#FFFFFF',
            gridSize: 20,
            ...(data.appState ?? {}),
          },
          files: data.files ?? {},
          scrollToContent: true,
        });
        setSource('starter');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };

    // Prefer the local draft if one exists.
    let draftRaw: string | null = null;
    try {
      draftRaw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage blocked (private mode, quota, etc.) — just fall through.
    }
    if (draftRaw) {
      try {
        const parsed = JSON.parse(draftRaw) as SavedShape;
        setInitialData({
          elements: parsed.elements ?? [],
          appState: {
            theme: 'light',
            viewBackgroundColor: '#FFFFFF',
            gridSize: 20,
          },
          files: parsed.files ?? {},
          scrollToContent: true,
        });
        setSource('draft');
        setSavedAt(parsed.savedAt ?? null);
        return () => {
          cancelled = true;
        };
      } catch {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      }
    }

    void loadStarter();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = useCallback(
    (elements: readonly unknown[], _appState: unknown, files: Record<string, unknown>) => {
      // Skip empty initial renders and avoid writing when the scene
      // hasn't actually been touched yet.
      if (!elements || elements.length === 0) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const ts = new Date().toISOString();
        const payload: SavedShape = {
          elements: [...elements],
          files,
          savedAt: ts,
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          setSavedAt(ts);
          if (source !== 'draft') setSource('draft');
        } catch {
          // storage full / blocked — ignore, user can still export
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [source],
  );

  const discardDraft = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    window.location.reload();
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
        initialData={initialData as never}
        theme="light"
        onChange={onChange as never}
        UIOptions={{
          canvasActions: {
            loadScene: true,
            saveToActiveFile: true,
            export: { saveFileToDisk: true },
            saveAsImage: true,
          },
        }}
      />
      <AutosaveBadge
        source={source}
        savedAt={savedAt}
        onDiscard={discardDraft}
      />
    </div>
  );
}

function AutosaveBadge({
  source,
  savedAt,
  onDiscard,
}: {
  source: 'draft' | 'starter' | null;
  savedAt: string | null;
  onDiscard: () => void;
}) {
  const [relative, setRelative] = useState<string>('');

  useEffect(() => {
    if (!savedAt) {
      setRelative('');
      return;
    }
    const update = () => {
      const elapsed = Date.now() - Date.parse(savedAt);
      if (elapsed < 10_000) setRelative('just now');
      else if (elapsed < 60_000) setRelative(`${Math.floor(elapsed / 1000)}s ago`);
      else if (elapsed < 3_600_000) setRelative(`${Math.floor(elapsed / 60_000)}m ago`);
      else setRelative(new Date(savedAt).toLocaleTimeString());
    };
    update();
    const t = setInterval(update, 5_000);
    return () => clearInterval(t);
  }, [savedAt]);

  const label =
    source === 'draft'
      ? `Draft auto-saved${relative ? ` · ${relative}` : ''}`
      : 'Starter loaded · edits will autosave to this browser';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.4rem 0.75rem',
        background: '#F8F2ED',
        border: '1px solid #C49A6E',
        borderRadius: 5,
        font: '13px "EB Garamond", Georgia, serif',
        color: '#230102',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        pointerEvents: 'auto',
      }}
    >
      <span>{label}</span>
      {source === 'draft' && (
        <button
          type="button"
          onClick={onDiscard}
          style={{
            font: 'inherit',
            padding: '0.2rem 0.6rem',
            border: '1px solid #C49A6E',
            background: '#FFFFFF',
            color: '#430607',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          title="Throw away the local draft and reload the starter from the repo"
        >
          Discard draft
        </button>
      )}
    </div>
  );
}
