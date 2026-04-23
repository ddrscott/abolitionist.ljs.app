import { useEffect, useRef, useState } from 'react';
import Fuse from 'fuse.js';

type Citation = {
  /** AI Search chunk shape: `item.key` is the R2 object key, e.g.
   *  "freethestates.org/treat-sb13-not-secession.md". Older binding
   *  responses may return a flat `filename` field, so accept both. */
  filename?: string;
  item?: { key?: string };
  text?: string;
  score?: number;
};

function citationKey(c: Citation): string | undefined {
  return c.filename ?? c.item?.key;
}

type Message = {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: string;
  /** When true, this answer came from our pre-curated Q&A index
   *  instead of the AI. Marked visually so readers can tell. */
  fromIndex?: boolean;
};

// Flat shape of each pre-curated Q&A emitted by
// scripts/build-questions-index.mjs.
type IndexedQA = {
  q: string;   // the question
  a: string;   // the pre-curated answer
  t: string;   // article title
  u: string;   // article URL (/pages/<site>/<slug>/)
  qt?: string; // supporting quote from the article
};

// Max suggestions shown in the combo-box dropdown as the user types.
const MAX_SUGGESTIONS = 6;

const SAMPLE_QUESTIONS = [
  'What do abolitionists believe about abortion?',
  "Someone tells me 'my body, my choice' — what's the response?",
  "Why don't abolitionists support the pro-life movement?",
  'What about rape, incest, or the mother’s life?',
];

/** R2 key → same-origin article URL. Prefix `/pages/` is a UI concern; the R2
 *  key itself is `<site>/<slug>.md` so the mapping stays a simple prepend. */
function citationToHref(filename: string): string {
  const slug = filename.replace(/\.mdx?$/i, '');
  return `/pages/${slug}/`;
}

function citationLabel(filename: string): string {
  const base = filename.replace(/\.mdx?$/i, '').split('/').pop() ?? filename;
  return base.replace(/-/g, ' ');
}

export function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const fuseRef = useRef<Fuse<IndexedQA> | null>(null);
  const [suggestions, setSuggestions] = useState<IndexedQA[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  // Load the pre-curated Q&A index once on mount. If the fetch fails
  // (missing file, offline), we silently fall back to the AI path for
  // every query.
  useEffect(() => {
    fetch('/questions-index.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        const items = raw as IndexedQA[] | null;
        if (!items || !Array.isArray(items) || items.length === 0) return;
        fuseRef.current = new Fuse(items, {
          keys: [{ name: 'q', weight: 1.0 }],
          includeScore: true,
          ignoreLocation: true, // match anywhere in the string
          threshold: 0.6, // forgiving — the combo-box lets the user pick,
          // so false positives in the suggestion list are fine
          minMatchCharLength: 2,
        });
      })
      .catch(() => {
        /* noop — index is optional */
      });
  }, []);

  /** Slice of the Q&A index → Citation shape so it renders identically
   *  to AI-sourced citations (chip links at the bottom of the message). */
  function indexHitCitation(hit: IndexedQA): Citation {
    // hit.u is "/pages/<site>/<slug>/"; strip the /pages/ prefix and
    // trailing slash, append .md to match the existing filename convention.
    const filename = hit.u.replace(/^\/pages\//, '').replace(/\/$/, '') + '.md';
    return { filename, text: hit.qt };
  }

  /** Recompute suggestion candidates as the user types. */
  function updateSuggestions(value: string) {
    if (!fuseRef.current || value.trim().length < 2) {
      setSuggestions([]);
      setSelectedIdx(-1);
      return;
    }
    const hits = fuseRef.current.search(value, { limit: MAX_SUGGESTIONS });
    setSuggestions(hits.map((h) => h.item));
    setSelectedIdx(-1);
  }

  /** Render a pre-curated Q&A answer. Used when the user picks a
   *  suggestion from the dropdown — no AI call, no streaming. */
  function pickSuggestion(hit: IndexedQA) {
    if (pending) return;
    const userMsg: Message = { role: 'user', content: hit.q };
    const answer: Message = {
      role: 'assistant',
      content: hit.a,
      citations: [indexHitCitation(hit)],
      fromIndex: true,
    };
    setMessages((prev) => [...prev, userMsg, answer]);
    setInput('');
    setSuggestions([]);
    setSelectedIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function askAI(question: string) {
    if (!question.trim() || pending) return;
    setPending(true);

    const userMsg: Message = { role: 'user', content: question };
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const history = [...messages, userMsg].map(({ role, content }) => ({
      role,
      content,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`chat backend responded ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';
      let citations: Citation[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (line === '') {
            currentEvent = 'message';
            continue;
          }
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let data: unknown;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          if (currentEvent === 'chunks' || Array.isArray(data)) {
            const arr = Array.isArray(data)
              ? (data as Citation[])
              : (data as { chunks?: Citation[] }).chunks;
            if (Array.isArray(arr) && arr.length > 0) {
              citations = arr;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.role !== 'assistant') return prev;
                return [...prev.slice(0, -1), { ...last, citations }];
              });
            }
            continue;
          }

          const delta = (data as { choices?: { delta?: { content?: string } }[] })
            ?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== 'assistant') return prev;
              const updated: Message = { ...last, content: last.content + delta };
              return [...prev.slice(0, -1), updated];
            });
          }
        }
      }

      if (citations.length > 0) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          if (last.citations && last.citations.length === citations.length)
            return prev;
          return [...prev.slice(0, -1), { ...last, citations }];
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'request failed';
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        return [...prev.slice(0, -1), { ...last, error: message }];
      });
    } finally {
      setPending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="chatbox">
      <div ref={transcriptRef} className="transcript">
        {messages.length === 0 ? (
          <Welcome onPick={askAI} />
        ) : (
          <ul>
            {messages.map((m, i) => (
              <li key={i} className={m.role === 'user' ? 'user' : 'assistant'}>
                {m.error ? (
                  <p className="error">Error: {m.error}</p>
                ) : (
                  <>
                    {m.fromIndex && (
                      <div className="source-badge" title="Answered from our pre-curated Q&A index — no AI call.">
                        from our Q&amp;A
                      </div>
                    )}
                    <p>
                      {m.content}
                      {pending && i === messages.length - 1 && m.role === 'assistant' && (
                        <span className="caret" />
                      )}
                    </p>
                  </>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="citations">
                    {m.citations.map((c, j) => {
                      const key = citationKey(c);
                      if (!key) return null;
                      return (
                        <a
                          key={`${i}-${j}`}
                          href={citationToHref(key)}
                          title={c.text}
                        >
                          {citationLabel(key)}
                        </a>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="suggestions" role="listbox" aria-label="Matching questions">
          {suggestions.map((s, i) => (
            <li
              key={`${s.u}-${i}`}
              role="option"
              aria-selected={i === selectedIdx}
              className={i === selectedIdx ? 'sel' : ''}
              onMouseEnter={() => setSelectedIdx(i)}
              onMouseDown={(e) => {
                // mousedown (not click) so the textarea doesn't blur and
                // close the list before the handler fires
                e.preventDefault();
                pickSuggestion(s);
              }}
            >
              <div className="suggestion-q">{s.q}</div>
              <div className="suggestion-t">{s.t}</div>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = input;
          setInput('');
          setSuggestions([]);
          askAI(q);
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            updateSuggestions(e.target.value);
          }}
          placeholder="Ask a question — pick a match below, or type your own for the AI"
          rows={1}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && suggestions.length > 0) {
              e.preventDefault();
              setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
              e.preventDefault();
              setSelectedIdx((i) => Math.max(i - 1, -1));
            } else if (e.key === 'Escape' && suggestions.length > 0) {
              e.preventDefault();
              setSuggestions([]);
              setSelectedIdx(-1);
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (selectedIdx >= 0 && suggestions[selectedIdx]) {
                pickSuggestion(suggestions[selectedIdx]);
              } else {
                const q = input;
                setInput('');
                setSuggestions([]);
                askAI(q);
              }
            }
          }}
        />
        <button type="submit" disabled={pending || !input.trim()}>
          {pending ? '…' : 'Ask AI'}
        </button>
      </form>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  // the Welcome panel still uses the AI path — the sample questions
  // aren't in the index (they're aspirational framings). Users can
  // always then refine by typing and picking from the dropdown.
  return (
    <div className="welcome">
      <p>
        Ask a question. Answers come from the writings of the abolitionist
        movement — every claim links back to the source so you can see where
        it came from.
      </p>
      <div className="sample-questions">
        {SAMPLE_QUESTIONS.map((q) => (
          <button key={q} type="button" onClick={() => onPick(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
