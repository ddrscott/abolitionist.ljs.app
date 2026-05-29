import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { ChevronRight, Search, MessageSquare, FileText } from 'lucide-react';

// One curated Q&A — matches scripts/build-questions-index.mjs output.
type QA = { q: string; a: string; t: string; u: string; qt?: string };

type ArticleGroup = { url: string; title: string; items: QA[] };

const MAX_SEARCH_RESULTS = 60;

export function QuestionsBrowser() {
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
          keys: [
            { name: 'q', weight: 0.8 },
            { name: 'a', weight: 0.2 },
          ],
          ignoreLocation: true,
          threshold: 0.4,
          minMatchCharLength: 2,
        });
      })
      .catch(() => setItems([]));
  }, []);

  // Group by source article, preserving first-seen order.
  const groups = useMemo<ArticleGroup[]>(() => {
    if (!items) return [];
    const byUrl = new Map<string, ArticleGroup>();
    for (const it of items) {
      let g = byUrl.get(it.u);
      if (!g) {
        g = { url: it.u, title: it.t, items: [] };
        byUrl.set(it.u, g);
      }
      g.items.push(it);
    }
    return [...byUrl.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);

  const trimmed = query.trim();
  const results = useMemo<QA[]>(() => {
    if (trimmed.length < 2 || !fuseRef.current) return [];
    return fuseRef.current.search(trimmed, { limit: MAX_SEARCH_RESULTS }).map((r) => r.item);
  }, [trimmed]);

  function toggleArticle(url: string) {
    setOpenArticles((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }
  function toggleQ(key: string) {
    setOpenQ((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const searching = trimmed.length >= 2;

  return (
    <div className="qbrowse">
      <div className="qbrowse-head">
        <h1>Questions</h1>
        <p className="qbrowse-sub">
          Browse every question the abolitionist can answer — straight from the
          movement&rsquo;s writings. Prefer to just ask? <a href="/">Open the chat →</a>
        </p>
        {items && (
          <p className="qbrowse-count">
            {items.length.toLocaleString()} questions across {groups.length} articles
          </p>
        )}
        <div className="qbrowse-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the questions…"
            aria-label="Search questions"
            autoFocus
          />
        </div>
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
              <QuestionRow
                key={`r-${i}`}
                qa={it}
                open={openQ.has(`r-${i}`)}
                onToggle={() => toggleQ(`r-${i}`)}
                showArticle
              />
            ))}
          </ul>
        </div>
      ) : (
        <ul className="qarticles">
          {groups.map((g) => {
            const isOpen = openArticles.has(g.url);
            return (
              <li key={g.url} className={isOpen ? 'open' : ''}>
                <button type="button" className="qarticle-head" onClick={() => toggleArticle(g.url)} aria-expanded={isOpen}>
                  <ChevronRight size={16} className="chev" aria-hidden="true" />
                  <span className="qarticle-title">{g.title}</span>
                  <span className="qarticle-count">{g.items.length}</span>
                </button>
                {isOpen && (
                  <ul className="qlist">
                    {g.items.map((it, i) => (
                      <QuestionRow
                        key={`${g.url}-${i}`}
                        qa={it}
                        open={openQ.has(`${g.url}-${i}`)}
                        onToggle={() => toggleQ(`${g.url}-${i}`)}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function QuestionRow({
  qa,
  open,
  onToggle,
  showArticle,
}: {
  qa: QA;
  open: boolean;
  onToggle: () => void;
  showArticle?: boolean;
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
            <a className="qrow-link" href={qa.u}>
              <FileText size={14} aria-hidden="true" /> Read the article
            </a>
            <a className="qrow-link" href={`/?q=${encodeURIComponent(qa.q)}`}>
              <MessageSquare size={14} aria-hidden="true" /> Ask the abolitionist this
            </a>
          </div>
        </div>
      )}
    </li>
  );
}
