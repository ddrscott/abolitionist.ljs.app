import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { ChevronRight, Search, MessageSquare, FileText } from 'lucide-react';
import { DetailPanel, ClipCard, type ClipSource, type DetailTarget } from './SourcePanel';

// One curated article Q&A — matches scripts/build-questions-index.mjs output.
type QA = { q: string; a: string; t: string; u: string; qt?: string };
type ArticleGroup = { url: string; title: string; items: QA[] };

// Distinct topic + count — from scripts/build-clip-topics.mjs.
type TopicCount = { t: string; n: number };

const MAX_SEARCH_RESULTS = 60;
const TOPIC_CHIPS = 18;

// Fallback chips if the topic index hasn't loaded.
const FALLBACK_TOPICS = [
  'my body my choice', 'incrementalism', 'personhood', 'rape exception',
  'equal protection', 'bodily autonomy', 'child sacrifice', 'abortion pills',
];

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
          ignoreLocation: true, threshold: 0.4, minMatchCharLength: 2,
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
  const [clips, setClips] = useState<ClipSource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'feed' | 'search'>('feed');
  const [topics, setTopics] = useState<TopicCount[]>([]);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const topicFuse = useRef<Fuse<TopicCount> | null>(null);
  const reqId = useRef(0);

  // Topic index (for the searchable chips). Falls back to a hardcoded set.
  useEffect(() => {
    fetch('/clip-topics.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        const data = (raw as TopicCount[] | null) ?? FALLBACK_TOPICS.map((t) => ({ t, n: 0 }));
        setTopics(data);
        topicFuse.current = new Fuse(data, { keys: ['t'], ignoreLocation: true, threshold: 0.4, minMatchCharLength: 2 });
      })
      .catch(() => setTopics(FALLBACK_TOPICS.map((t) => ({ t, n: 0 }))));
  }, []);

  async function loadFeed(topic: string | null, append: boolean) {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (topic) params.set('topic', topic);
      if (append && cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/clips?${params.toString()}`);
      const data = (await res.json()) as { clips?: ClipSource[]; nextCursor?: string | null; error?: string };
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
    setLoading(true); setError(null); setActiveTopic(null);
    try {
      const res = await fetch('/api/clips', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }),
      });
      const data = (await res.json()) as { clips?: ClipSource[]; error?: string };
      if (id !== reqId.current) return;
      if (!res.ok) throw new Error(data.error || `clips ${res.status}`);
      setClips(data.clips ?? []); setCursor(null); setMode('search');
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'search failed');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  useEffect(() => { loadFeed(null, false); /* eslint-disable-next-line */ }, []);

  function pickTopic(topic: string) {
    setActiveTopic(topic);
    setClips([]); setCursor(null);
    loadFeed(topic, false);
  }

  // Topic chips: live fuzzy filter as you type; top-by-count when empty.
  const q = query.trim();
  const chips = useMemo<TopicCount[]>(() => {
    if (q.length >= 2 && topicFuse.current) {
      return topicFuse.current.search(q, { limit: TOPIC_CHIPS }).map((r) => r.item);
    }
    return [...topics].sort((a, b) => b.n - a.n).slice(0, TOPIC_CHIPS);
  }, [q, topics]);

  return (
    <>
      <p className="qbrowse-count">
        ~12,000 clips from the movement&rsquo;s YouTube channels
        {topics.length > 0 && ` · ${topics.length.toLocaleString()} topics`}
      </p>

      <form className="qbrowse-search" onSubmit={(e) => { e.preventDefault(); if (q.length >= 2) runSearch(q); }}>
        <Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clips, or type to filter topics →" aria-label="Search clips or filter topics" />
      </form>

      <div className="qtopics">
        {chips.map((t) => (
          <button key={t.t} type="button" className={`qtopic${activeTopic === t.t ? ' active' : ''}`}
            onClick={() => { setQuery(''); pickTopic(t.t); }}>
            {t.t}{t.n ? <span className="qtopic-n">{t.n}</span> : null}
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
          ? `Top matches for “${q}”`
          : activeTopic ? `Clips tagged “${activeTopic}”` : 'Recent clips'}
      </div>

      {error && <p className="qbrowse-loading">Couldn’t load clips: {error}</p>}

      <div className="cliplist">
        {clips.map((c) => (
          <ClipCard key={c.id} clip={c}
            onOpen={() => setDetail({ kind: 'clip', source: c })}
            onTopic={(t) => { setQuery(''); pickTopic(t); }} />
        ))}
      </div>

      {loading && <p className="qbrowse-loading">Loading clips…</p>}
      {!loading && mode === 'feed' && cursor && (
        <button type="button" className="qmore" onClick={() => loadFeed(activeTopic, true)}>Load more</button>
      )}
      {!loading && !error && clips.length === 0 && <p className="qbrowse-loading">No clips found.</p>}

      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
    </>
  );
}

