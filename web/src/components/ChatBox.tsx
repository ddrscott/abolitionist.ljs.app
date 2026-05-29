import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import Fuse from 'fuse.js';
import {
  Plus,
  PanelLeft,
  PanelLeftClose,
  FileText,
  Compass,
  ExternalLink,
  Share2,
  Check,
  ArrowUp,
  Play,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  AlertTriangle,
  PenLine,
  MessageCircleQuestion,
  LayoutGrid,
} from 'lucide-react';
import {
  DetailPanel,
  ClipCard,
  type Source,
  type ArticleSource,
  type ClipSource,
  type DetailTarget,
} from './SourcePanel';

// Source shapes + the in-app DetailPanel now live in ./SourcePanel (shared
// with the /questions Talks tab). Source/ArticleSource/ClipSource/DetailTarget
// and mmss/realSpeaker are imported above.

type Step = {
  phase: 'writings' | 'talks' | 'synthesize';
  status: 'searching' | 'done' | 'error' | 'start';
  found?: number;
  message?: string;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  error?: string;
  fromIndex?: boolean;
  trace?: Step[];
  sources?: Source[];
};

type IndexedQA = { q: string; a: string; t: string; u: string; qt?: string };

type TopicCount = { t: string; n: number };

type SessionSummary = { id: string; title: string; updated_at: string };

const MAX_SUGGESTIONS = 6;

const SAMPLE_QUESTIONS = [
  'What do abolitionists believe about abortion?',
  "Someone says 'my body, my choice' — what's the response?",
  "Why don't abolitionists support the pro-life movement?",
  'What about rape, incest, or the mother’s life?',
];

// --- helpers --------------------------------------------------------------

function titleFromKey(key: string): string {
  const base = key.replace(/\.mdx?$/i, '').split('/').pop() ?? key;
  return base.replace(/-/g, ' ');
}

function relativeTime(sqlUtc: string): string {
  const t = Date.parse(sqlUtc.replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

function sessionIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
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
  // Clip-topic typeahead → jump straight to video snippets in the chat.
  const topicsFuseRef = useRef<Fuse<TopicCount> | null>(null);
  const [topicSuggestions, setTopicSuggestions] = useState<TopicCount[]>([]);
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down'>>({});

  // --- session + shell state ---
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  // Sidebar visibility. `null` = use the viewport default (shown on desktop,
  // hidden on mobile) — lets CSS decide without a hydration mismatch. `true`/
  // `false` are explicit user toggles.
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  function closeSidebarIfMobile() {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches) {
      setSidebarOpen(false);
    }
  }
  // Source detail panel (right on desktop, bottom sheet on mobile).
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const readOnlyRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  function setSession(id: string | null) {
    sessionIdRef.current = id;
    setSessionId(id);
  }
  function setReadonly(v: boolean) {
    readOnlyRef.current = v;
    setReadOnly(v);
  }

  function patchLastAssistant(fn: (m: Message) => Message) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), fn(last)];
    });
  }

  // --- session persistence ---

  async function refreshSessions() {
    try {
      const res = await fetch('/api/sessions', { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: SessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch {
      /* non-fatal */
    }
  }

  async function saveCurrent(msgs: Message[]) {
    if (readOnlyRef.current) return;
    const savable = msgs
      .filter((m) => !(m.role === 'assistant' && m.error))
      .map((m) => ({ role: m.role, content: m.content, sources: m.sources, fromIndex: m.fromIndex }));
    if (savable.length < 2) return;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: sessionIdRef.current, messages: savable }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      if (id && id !== sessionIdRef.current) {
        setSession(id);
        window.history.replaceState({ id }, '', `/c/${id}`);
      }
      refreshSessions();
    } catch {
      /* non-fatal */
    }
  }

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setMessages([{ role: 'assistant', content: '', error: 'That shared chat could not be found.' }]);
        setSession(null);
        setReadonly(false);
        return;
      }
      const data = (await res.json()) as { id: string; messages: Message[]; mine: boolean };
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setSession(data.id);
      setReadonly(!data.mine);
    } catch {
      /* leave screen as-is */
    }
  }

  function newChat() {
    setMessages([]);
    setSession(null);
    setReadonly(false);
    setFeedback({});
    setInput('');
    clearSuggest();
    closeSidebarIfMobile();
    window.history.pushState({}, '', '/');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function openSession(id: string) {
    closeSidebarIfMobile();
    if (id === sessionIdRef.current) return;
    window.history.pushState({ id }, '', `/c/${id}`);
    loadSession(id);
  }

  async function share() {
    if (!sessionIdRef.current) return;
    const url = `${window.location.origin}/c/${sessionIdRef.current}`;
    const onMobile = window.matchMedia?.('(pointer: coarse)').matches;
    if (onMobile && navigator.share) {
      try {
        await navigator.share({ title: 'Ask the Abolitionist', url });
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  // --- mount: load from path, wire history nav, fetch index + sidebar ---

  useEffect(() => {
    const id = sessionIdFromPath();
    if (id) loadSession(id);
    else {
      // Prefill from a ?q= link (e.g. "Ask the abolitionist this" on /questions/).
      const presetQ = new URLSearchParams(window.location.search).get('q');
      if (presetQ) {
        setInput(presetQ);
        window.history.replaceState({}, '', '/');
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
    refreshSessions();

    const onPop = () => {
      const pid = sessionIdFromPath();
      if (pid) loadSession(pid);
      else {
        setMessages([]);
        setSession(null);
        setReadonly(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('/questions-index.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        const items = raw as IndexedQA[] | null;
        if (!items || !Array.isArray(items) || items.length === 0) return;
        fuseRef.current = new Fuse(items, {
          keys: [{ name: 'q', weight: 1.0 }],
          includeScore: true,
          ignoreLocation: true,
          threshold: 0.6,
          minMatchCharLength: 2,
        });
      })
      .catch(() => {});
  }, []);

  // Clip topics index — powers the in-chat "topics → snippets" typeahead.
  useEffect(() => {
    fetch('/clip-topics.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        const topics = raw as TopicCount[] | null;
        if (!topics || !Array.isArray(topics) || topics.length === 0) return;
        topicsFuseRef.current = new Fuse(topics, {
          keys: ['t'],
          ignoreLocation: true,
          threshold: 0.4,
          minMatchCharLength: 2,
        });
      })
      .catch(() => {});
  }, []);

  const sendFeedback = async (messageIndex: number, rating: 1 | -1, m: Message, userQuestion: string) => {
    if (feedback[messageIndex] || !userQuestion) return;
    setFeedback((prev) => ({ ...prev, [messageIndex]: rating === 1 ? 'up' : 'down' }));
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rating,
          question: userQuestion,
          answer: m.content,
          source: m.fromIndex ? 'index' : 'ai',
        }),
      });
    } catch {
      /* don't block the user */
    }
  };

  function indexHitSource(hit: IndexedQA): ArticleSource {
    const key = hit.u.replace(/^\/pages\//, '').replace(/\/$/, '') + '.md';
    return { type: 'article', key, url: hit.u, title: titleFromKey(key), text: hit.qt ?? '', score: 1 };
  }

  function updateSuggestions(value: string) {
    const v = value.trim();
    setSelectedIdx(-1);
    if (v.length < 2) {
      setSuggestions([]);
      setTopicSuggestions([]);
      return;
    }
    setSuggestions(fuseRef.current ? fuseRef.current.search(v, { limit: MAX_SUGGESTIONS }).map((h) => h.item) : []);
    setTopicSuggestions(topicsFuseRef.current ? topicsFuseRef.current.search(v, { limit: 4 }).map((h) => h.item) : []);
  }

  function clearSuggest() {
    setSuggestions([]);
    setTopicSuggestions([]);
    setSelectedIdx(-1);
  }

  /** Pick a clip topic → pull its snippets into the conversation as a result.
   *  Reuses the assistant message's `sources` (clip cards open the shared
   *  DetailPanel), so it persists with the session like any other turn. */
  async function pickTopic(topic: string) {
    if (pending) return;
    ensureOwnThread();
    clearSuggest();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: `Clips on “${topic}”` },
      { role: 'assistant', content: 'Finding clips…' },
    ]);
    try {
      const res = await fetch(`/api/clips?topic=${encodeURIComponent(topic)}&limit=12`);
      const data = (await res.json()) as { clips?: ClipSource[]; error?: string };
      if (!res.ok) throw new Error(data.error || `clips ${res.status}`);
      const clips = data.clips ?? [];
      patchLastAssistant((m) => ({
        ...m,
        content: '',
        sources: clips,
        error: clips.length === 0 ? `No clips found for “${topic}”.` : undefined,
      }));
    } catch (err) {
      patchLastAssistant((m) => ({ ...m, content: '', error: err instanceof Error ? err.message : 'failed to load clips' }));
    } finally {
      setTimeout(() => {
        saveCurrent(messagesRef.current);
        inputRef.current?.focus();
      }, 0);
    }
  }

  function ensureOwnThread() {
    if (!readOnlyRef.current) return;
    setMessages([]);
    setSession(null);
    setReadonly(false);
    setFeedback({});
    window.history.pushState({}, '', '/');
  }

  function pickSuggestion(hit: IndexedQA) {
    if (pending) return;
    ensureOwnThread();
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: hit.q },
      { role: 'assistant', content: hit.a, sources: [indexHitSource(hit)], fromIndex: true },
    ]);
    setInput('');
    clearSuggest();
    setTimeout(() => {
      saveCurrent(messagesRef.current);
      inputRef.current?.focus();
    }, 0);
  }

  async function askAgent(question: string) {
    if (!question.trim() || pending) return;
    ensureOwnThread();
    setPending(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', trace: [], sources: [] },
    ]);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok || !res.body) throw new Error(`answer engine responded ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';

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
          if (!payload) continue;
          let data: unknown;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          if (currentEvent === 'step') {
            patchLastAssistant((m) => ({ ...m, trace: [...(m.trace ?? []), data as Step] }));
          } else if (currentEvent === 'sources') {
            patchLastAssistant((m) => ({ ...m, sources: data as Source[] }));
          } else if (currentEvent === 'token') {
            const text = (data as { text?: string }).text ?? '';
            if (text) patchLastAssistant((m) => ({ ...m, content: m.content + text }));
          } else if (currentEvent === 'error') {
            const message = (data as { message?: string }).message ?? 'request failed';
            patchLastAssistant((m) => ({ ...m, error: message }));
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'request failed';
      patchLastAssistant((m) => ({ ...m, error: message }));
    } finally {
      setPending(false);
      setTimeout(() => {
        saveCurrent(messagesRef.current);
        inputRef.current?.focus();
      }, 0);
    }
  }

  function submitTyped() {
    const q = input;
    setInput('');
    clearSuggest();
    askAgent(q);
  }

  const isEmpty = messages.length === 0;
  const composerPlaceholder = readOnly ? 'Ask your own question…' : 'Ask the abolitionist…';
  // Conversation header text — the original question.
  const convoTitle = messages.find((m) => m.role === 'user')?.content?.trim() ?? '';

  const composer = (
    <div className="composer">
      {(suggestions.length > 0 || topicSuggestions.length > 0) && (
        <ul className="suggestions" role="listbox" aria-label="Matching questions and clip topics">
          {topicSuggestions.length > 0 && (
            <li className="suggestion-topics" role="presentation">
              <div className="suggestion-topics-label">Jump to clips on</div>
              <div className="suggestion-topics-chips">
                {topicSuggestions.map((t) => (
                  <button
                    key={t.t}
                    type="button"
                    className="suggestion-topic"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickTopic(t.t);
                    }}
                  >
                    <Play size={10} fill="currentColor" aria-hidden="true" /> {t.t}
                    {t.n ? <span className="suggestion-topic-n">{t.n}</span> : null}
                  </button>
                ))}
              </div>
            </li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={`${s.u}-${i}`}
              role="option"
              aria-selected={i === selectedIdx}
              className={i === selectedIdx ? 'sel' : ''}
              onMouseDown={(e) => {
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
          submitTyped();
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            updateSuggestions(e.target.value);
          }}
          placeholder={composerPlaceholder}
          rows={1}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && suggestions.length > 0) {
              e.preventDefault();
              setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
              e.preventDefault();
              setSelectedIdx((i) => Math.max(i - 1, -1));
            } else if (e.key === 'Escape' && (suggestions.length > 0 || topicSuggestions.length > 0)) {
              e.preventDefault();
              clearSuggest();
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (selectedIdx >= 0 && suggestions[selectedIdx]) pickSuggestion(suggestions[selectedIdx]);
              else submitTyped();
            }
          }}
        />
        <button type="submit" disabled={pending || !input.trim()} aria-label="Ask">
          {pending ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </form>
    </div>
  );

  const shellClass =
    'app-shell' +
    (sidebarOpen === true ? ' sidebar-open' : '') +
    (sidebarOpen === false ? ' sidebar-collapsed' : '');

  return (
    <div className={shellClass}>
      <aside className="sidebar" aria-label="Navigation and chats">
        <div className="sidebar-head">
          <a className="sidebar-brand" href="/" onClick={() => closeSidebarIfMobile()}>
            <img src="/icon-full.png" alt="" width="26" height="26" />
            <span>Ask the Abolitionist</span>
            <span className="beta-badge" title="Beta — expect rough edges.">Beta</span>
          </a>
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => setSidebarOpen(false)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={18} aria-hidden="true" />
          </button>
        </div>

        <button type="button" className="new-chat" onClick={newChat}>
          <Plus size={18} aria-hidden="true" /> New chat
        </button>

        <nav className="sidebar-nav" aria-label="Resources">
          <a href="/questions/">
            <MessageCircleQuestion size={16} className="nav-ico" aria-hidden="true" /> Questions
          </a>
          <a href="/bingo/">
            <LayoutGrid size={16} className="nav-ico" aria-hidden="true" /> Bingo
          </a>
          <a href="/pages/">
            <FileText size={16} className="nav-ico" aria-hidden="true" /> Articles
          </a>
          <a href="/pages/journey/">
            <Compass size={16} className="nav-ico" aria-hidden="true" /> Journey
          </a>
          <a href="https://abolitionistsrising.com" rel="noopener">
            <ExternalLink size={16} className="nav-ico" aria-hidden="true" /> Abolitionists Rising
          </a>
          <a href="https://freethestates.org" rel="noopener">
            <ExternalLink size={16} className="nav-ico" aria-hidden="true" /> Free the States
          </a>
        </nav>

        <div className="recents">
          <div className="recents-label">Recent chats</div>
          {sessions.length === 0 ? (
            <p className="recents-empty">Your chats show up here so you can pick up where you left off.</p>
          ) : (
            <ul>
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={s.id === sessionId ? 'active' : ''}
                    onClick={() => openSession(s.id)}
                    title={s.title}
                  >
                    <span className="recent-title">{s.title || 'Untitled chat'}</span>
                    <span className="recent-time">{relativeTime(s.updated_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar-foot">
          <p className="sidebar-tagline">
            Saving babies with data by{' '}
            <a href="https://askscottpierce.com" rel="noopener">Scott Pierce</a>
          </p>
          <div className="sidebar-foot-links">
            <a href="/pages/legal/privacy/">Privacy</a>
            <span aria-hidden="true">·</span>
            <a href="/pages/legal/terms/">Terms</a>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <div className={`chatbox${isEmpty ? ' is-empty' : ''}`}>
        <header className={`chat-bar${convoTitle ? ' chat-bar--titled' : ''}`}>
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <PanelLeft size={20} aria-hidden="true" />
          </button>
          {convoTitle && (
            <span className="chat-title" title={convoTitle}>
              {convoTitle}
            </span>
          )}
        </header>

        {readOnly && (
          <div className="shared-banner">You’re viewing a shared answer. Ask your own question below ↓</div>
        )}

        {isEmpty ? (
          <div className="empty-hero">
            <div className="empty-hero-inner">
              <h2 className="greeting">Ask the abolitionist</h2>
              <p className="greeting-sub">
                Straight answers on abortion, drawn from the movement’s writings
                <em> and</em> its talks — with every source shown, so you can read it or watch it yourself.
              </p>
              {composer}
              <div className="sample-questions">
                {SAMPLE_QUESTIONS.map((q) => (
                  <button key={q} type="button" onClick={() => askAgent(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div ref={transcriptRef} className="transcript">
              <ul>
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  const streaming = pending && isLast && m.role === 'assistant';
                  return (
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
                          {m.role === 'assistant' && m.trace && m.trace.length > 0 && (
                            <Trace trace={m.trace} hasAnswer={m.content.length > 0} />
                          )}
                          {/* Order: thoughts → resources → streamed answer.
                              The `sources` SSE event arrives before tokens, so
                              citations are in place as the answer writes in. */}
                          {m.sources && m.sources.length > 0 && (
                            <Sources sources={m.sources} idx={i} onOpen={setDetail} onTopic={pickTopic} />
                          )}
                          {(m.content || streaming) && (
                            <p className="answer">
                              {m.content}
                              {streaming && <span className="caret" />}
                            </p>
                          )}
                        </>
                      )}

                      {m.role === 'assistant' && !m.error && m.content && !streaming && (
                        <div className="msg-actions">
                          <div className="feedback" role="group" aria-label="Was this answer helpful?">
                            {feedback[i] ? (
                              <span className="feedback-thanks">thanks — noted</span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="This answer was helpful"
                                  aria-label="Thumbs up"
                                  onClick={() => {
                                    const q = findQuestionFor(messages, i);
                                    if (q) sendFeedback(i, 1, m, q);
                                  }}
                                >
                                  <ThumbsUp size={15} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  title="This answer missed the mark"
                                  aria-label="Thumbs down"
                                  onClick={() => {
                                    const q = findQuestionFor(messages, i);
                                    if (q) sendFeedback(i, -1, m, q);
                                  }}
                                >
                                  <ThumbsDown size={15} aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>

                          {/* Share lives WITH the conversation — on the latest
                              answer, once the session is saved. */}
                          {isLast && sessionId && (
                            <button
                              type="button"
                              className="share-inline"
                              onClick={share}
                              title="Copy a shareable link to this conversation"
                            >
                              {copied ? (
                                <>
                                  <Check size={14} aria-hidden="true" /> Copied
                                </>
                              ) : (
                                <>
                                  <Share2 size={14} aria-hidden="true" /> Share
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            {composer}
          </>
        )}
      </div>

      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function Trace({ trace, hasAnswer }: { trace: Step[]; hasAnswer: boolean }) {
  const byPhase: Partial<Record<Step['phase'], Step>> = {};
  for (const s of trace) byPhase[s.phase] = s;

  const line = (phase: Step['phase'], label: string, unit: string) => {
    const s = byPhase[phase];
    if (!s) return null;
    let icon = <Loader2 size={14} className="spin" aria-hidden="true" />;
    let text = `Searching ${label}…`;
    if (s.status === 'done') {
      icon = <Check size={14} aria-hidden="true" />;
      text = `${label} — ${s.found ?? 0} ${unit}`;
    } else if (s.status === 'error') {
      icon = <AlertTriangle size={14} aria-hidden="true" />;
      text = `${label} unavailable`;
    }
    return (
      <li className={`trace-${s.status}`}>
        <span className="trace-icon">{icon}</span> {text}
      </li>
    );
  };

  const syn = byPhase['synthesize'];
  return (
    <ul className="trace" aria-label="How this answer was found">
      {line('writings', 'the writings', 'articles')}
      {line('talks', 'the talks', 'clips')}
      {syn && !hasAnswer && (
        <li className="trace-start">
          <span className="trace-icon">
            <PenLine size={14} aria-hidden="true" />
          </span>{' '}
          Writing the answer…
        </li>
      )}
    </ul>
  );
}

/** Modifier/middle clicks should keep their native "open in new tab"
 *  behavior; a plain click opens the in-app detail panel instead. */
function isPlainClick(e: ReactMouseEvent): boolean {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}

function Sources({
  sources,
  idx,
  onOpen,
  onTopic,
}: {
  sources: Source[];
  idx: number;
  onOpen: (d: DetailTarget) => void;
  onTopic?: (t: string) => void;
}) {
  const articles = sources.filter((s): s is ArticleSource => s.type === 'article');
  const clips = sources.filter((s): s is ClipSource => s.type === 'clip');

  const seen = new Set<string>();
  const uniqueArticles = articles.filter((a) => {
    if (seen.has(a.key)) return false;
    seen.add(a.key);
    return true;
  });

  return (
    <div className="sources">
      {uniqueArticles.length > 0 && (
        <div className="sources-group">
          <div className="sources-label">From the writings</div>
          <div className="citations">
            {uniqueArticles.map((a, j) => (
              <a
                key={`${idx}-a-${j}`}
                href={a.url}
                title={a.text}
                onClick={(e) => {
                  if (!isPlainClick(e)) return;
                  e.preventDefault();
                  onOpen({ kind: 'article', source: a });
                }}
              >
                {a.title}
              </a>
            ))}
          </div>
        </div>
      )}
      {clips.length > 0 && (
        <div className="sources-group">
          <div className="sources-label">Watch the movement say it</div>
          <div className="cliplist">
            {clips.map((c, j) => (
              <ClipCard
                key={`${idx}-c-${j}`}
                clip={c}
                onOpen={() => onOpen({ kind: 'clip', source: c })}
                onTopic={onTopic}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function findQuestionFor(messages: Message[], assistantIdx: number): string | null {
  for (let k = assistantIdx - 1; k >= 0; k -= 1) {
    if (messages[k].role === 'user') return messages[k].content;
  }
  return null;
}
