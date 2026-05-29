import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { ChevronRight, Search, MessageSquare, FileText, Play } from 'lucide-react';

// One curated article Q&A — matches scripts/build-questions-index.mjs output.
type QA = { q: string; a: string; t: string; u: string; qt?: string };
type ArticleGroup = { url: string; title: string; items: QA[] };

// One video clip — matches the ClipSource shape from worker/answer.ts.
type Clip = {
  id: string;
  question: string;
  answer: string;
  speaker?: string;
  topics: string[];
  videoId: string;
  startSeconds: number;
  videoTitle: string;
  channelName: string;
  youtubeUrl: string;
};

const MAX_SEARCH_RESULTS = 60;

// Curated entry points into the talks (raw topics are too granular — thousands
// of free-form tags — so we surface a hand-picked set as browse chips).
const POPULAR_TOPICS = [
  'my body my choice',
  'incrementalism',
  'personhood',
  'rape exception',
  'equal protection',
  'bodily autonomy',
  'child sacrifice',
  'abortion pills',
  'heartbeat bill',
  'adoption',
  'repentance',
  'pragmatism',
];

function mmss(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
const GENERIC_SPEAKERS = new Set(['host', 'abolitionist', 'speaker', 'narrator', 'unknown']);
function realSpeaker(s?: string): string | null {
  if (!s) return null;
  return GENERIC_SPEAKERS.has(s.trim().toLowerCase()) ? null : s.trim();
}

export function QuestionsBrowser() {
  const [tab, setTab] = useState<'writings' | 'talks'>('writings');
  return (
    <div className="qbrowse">
      <div className="qbrowse-head">
        <h1>Questions</h1>
        <p className="qbrowse-sub">
          Browse what the abolitionist can answer — from the movement&rsquo;s
          writings <em>and</em> its talks. Prefer to just ask? <a href="/">Open the chat →</a>
        </p>
        <div className="qtabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'writings'}
            className={tab === 'writings' ? 'active' : ''} onClick={() => setTab('writings')}>
            From the writings
          </button>
          <button type="button" role="tab" aria-selected={tab === 'talks'}
            className={tab === 'talks' ? 'active' : ''} onClick={() => setTab('talks')}>
            From the talks
          </button>
        </div>
      </div>

      {tab === 'writings' ? <WritingsTab /> : <TalksTab />}
    </div>
  );
}

// --- Writings (curated article Q&A, static + client search) ----------------

function WritingsTab() {
  const [items, setItems] = useState<QA[] | null>(null);
  const [query, setQuery] = useState('');
  const [openArticles, setOpenArticles] = useState<Set<string>>(new Set());
  const [openQ, setOpenQ] = useState<Set<string>>(new Set());
  const fuseRef = useRef<Fuse<QA> | null>(null);

  useEffect(() => {
    fetch('/questions-index.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        const data = raw as QA[] | null;
        if (!data || !Array.isArray(data)) return;
        setItems(data);
        fuseRef.current = new Fuse(data, {
          keys: [{ name: 'q', weight: 0.8 }, { name: 'a', weight: 0.2 }],
          ignoreLocation: true,
          threshold: 0.4,
          minMatchCharLength: 2,
        });
      })
      .catch(() => setItems([]));
  }, []);

  const groups = useMemo<ArticleGroup[]>(() => {
    if (!items) return [];
    const byUrl = new Map<string, ArticleGroup>();
    for (const it of items) {
      let g = byUrl.get(it.u);
      if (!g) { g = { url: it.u, title: it.t, items: [] }; byUrl.set(it.u, g); }
      g.items.push(it);
    }
    return [...byUrl.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);

  const trimmed = query.trim();
  const results = useMemo<QA[]>(() => {
    if (trimmed.length < 2 || !fuseRef.current) return [];
    return fuseRef.current.search(trimmed, { limit: MAX_SEARCH_RESULTS }).map((r) => r.item);
  }, [trimmed]);

  const toggle = (set: Set<string>, k: string) => {
    const next = new Set(set);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  };
  const searching = trimmed.length >= 2;

  return (
    <>
      {items && (
        <p className="qbrowse-count">
          {items.length.toLocaleString()} questions across {groups.length} articles
        </p>
      )}
      <div className="qbrowse-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the writings…" aria-label="Search article questions" autoFocus />
      </div>

      {!items ? (
        <p className="qbrowse-loading">Loading the question bank…</p>
      ) : searching ? (
        <div className="qbrowse-results">
          <div className="qbrowse-results-label">
            {results.length > 0
              ? `${results.length}${results.length === MAX_SEARCH_RESULTS ? '+' : ''} matching question${results.length === 1 ? '' : 's'}`
              : 'No questions match — try the chat for an AI answer.'}
          </div>
          <ul className="qlist">
            {results.map((it, i) => (
              <QuestionRow key={`r-${i}`} qa={it} open={openQ.has(`r-${i}`)}
                onToggle={() => setOpenQ((s) => toggle(s, `r-${i}`))} showArticle />
            ))}
          </ul>
        </div>
      ) : (
        <ul className="qarticles">
          {groups.map((g) => {
            const isOpen = openArticles.has(g.url);
            return (
              <li key={g.url} className={isOpen ? 'open' : ''}>
                <button type="button" className="qarticle-head" aria-expanded={isOpen}
                  onClick={() => setOpenArticles((s) => toggle(s, g.url))}>
                  <ChevronRight size={16} className="chev" aria-hidden="true" />
                  <span className="qarticle-title">{g.title}</span>
                  <span className="qarticle-count">{g.items.length}</span>
                </button>
                {isOpen && (
                  <ul className="qlist">
                    {g.items.map((it, i) => (
                      <QuestionRow key={`${g.url}-${i}`} qa={it} open={openQ.has(`${g.url}-${i}`)}
                        onToggle={() => setOpenQ((s) => toggle(s, `${g.url}-${i}`))} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function QuestionRow({ qa, open, onToggle, showArticle }: {
  qa: QA; open: boolean; onToggle: () => void; showArticle?: boolean;
}) {
  return (
    <li className={`qrow${open ? ' open' : ''}`}>
      <button type="button" className="qrow-q" onClick={onToggle} aria-expanded={open}>
        <ChevronRight size={15} className="chev" aria-hidden="true" />
        <span>{qa.q}</span>
      </button>
      {open && (
        <div className="qrow-a">
          <p>{qa.a}</p>
          {qa.qt && <blockquote>{qa.qt}</blockquote>}
          <div className="qrow-actions">
            {showArticle && <span className="qrow-from">{qa.t}</span>}
            <a className="qrow-link" href={qa.u}><FileText size={14} aria-hidden="true" /> Read the article</a>
            <a className="qrow-link" href={`/?q=${encodeURIComponent(qa.q)}`}>
              <MessageSquare size={14} aria-hidden="true" /> Ask the abolitionist this
            </a>
          </div>
        </div>
      )}
    </li>
  );
}

// --- Talks (video clips, via the AYC-backed /api/clips proxy) ---------------

function TalksTab() {
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'feed' | 'search'>('feed');
  const reqId = useRef(0);

  async function loadFeed(topic: string | null, append: boolean) {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (topic) params.set('topic', topic);
      if (append && cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/clips?${params.toString()}`);
      const data = (await res.json()) as { clips?: Clip[]; nextCursor?: string | null; error?: string };
      if (id !== reqId.current) return;
      if (!res.ok) throw new Error(data.error || `clips ${res.status}`);
      setClips((prev) => (append ? [...prev, ...(data.clips ?? [])] : data.clips ?? []));
      setCursor(data.nextCursor ?? null);
      setMode('feed');
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'failed to load clips');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  async function runSearch(q: string) {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    setActiveTopic(null);
    try {
      const res = await fetch('/api/clips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json()) as { clips?: Clip[]; error?: string };
      if (id !== reqId.current) return;
      if (!res.ok) throw new Error(data.error || `clips ${res.status}`);
      setClips(data.clips ?? []);
      setCursor(null);
      setMode('search');
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'search failed');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  // Initial recent feed.
  useEffect(() => {
    loadFeed(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickTopic(topic: string) {
    setQuery('');
    setActiveTopic(topic);
    setClips([]);
    setCursor(null);
    loadFeed(topic, false);
  }

  return (
    <>
      <p className="qbrowse-count">~12,000 clips from the movement&rsquo;s YouTube channels</p>

      <form className="qbrowse-search" onSubmit={(e) => { e.preventDefault(); if (query.trim().length >= 2) runSearch(query.trim()); }}>
        <Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the talks…" aria-label="Search video clips" />
      </form>

      <div className="qtopics">
        {POPULAR_TOPICS.map((t) => (
          <button key={t} type="button" className={`qtopic${activeTopic === t ? ' active' : ''}`}
            onClick={() => pickTopic(t)}>
            {t}
          </button>
        ))}
        {(activeTopic || mode === 'search') && (
          <button type="button" className="qtopic clear" onClick={() => { setQuery(''); setActiveTopic(null); loadFeed(null, false); }}>
            ✕ clear
          </button>
        )}
      </div>

      <div className="qbrowse-results-label">
        {mode === 'search'
          ? `Top matches for “${query.trim()}”`
          : activeTopic
            ? `Clips tagged “${activeTopic}”`
            : 'Recent clips'}
      </div>

      {error && <p className="qbrowse-loading">Couldn’t load clips: {error}</p>}

      <ul className="cliplist">
        {clips.map((c) => <ClipRow key={c.id} clip={c} onTopic={pickTopic} />)}
      </ul>

      {loading && <p className="qbrowse-loading">Loading clips…</p>}
      {!loading && mode === 'feed' && cursor && (
        <button type="button" className="qmore" onClick={() => loadFeed(activeTopic, true)}>
          Load more
        </button>
      )}
      {!loading && !error && clips.length === 0 && (
        <p className="qbrowse-loading">No clips found.</p>
      )}
    </>
  );
}

function ClipRow({ clip, onTopic }: { clip: Clip; onTopic: (t: string) => void }) {
  const speaker = realSpeaker(clip.speaker);
  return (
    <li className="clipcard">
      <div className="clipcard-q">{clip.question}</div>
      <p className="clipcard-a">{clip.answer}</p>
      <div className="clipcard-meta">
        <a className="clipcard-watch" href={clip.youtubeUrl} target="_blank" rel="noopener noreferrer">
          <Play size={13} fill="currentColor" aria-hidden="true" /> Watch at {mmss(clip.startSeconds)}
        </a>
        <span className="clipcard-src">
          {clip.videoTitle}
          {speaker ? ` · ${speaker}` : ''} · {clip.channelName}
        </span>
      </div>
      {clip.topics.length > 0 && (
        <div className="cliptags">
          {clip.topics.slice(0, 6).map((t) => (
            <button key={t} type="button" className="cliptag" onClick={() => onTopic(t)}>{t}</button>
          ))}
        </div>
      )}
    </li>
  );
}
