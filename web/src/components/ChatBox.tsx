import { useEffect, useRef, useState } from 'react';

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
};

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

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  async function ask(question: string) {
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
          <Welcome onPick={ask} />
        ) : (
          <ul>
            {messages.map((m, i) => (
              <li key={i} className={m.role === 'user' ? 'user' : 'assistant'}>
                {m.error ? (
                  <p className="error">Error: {m.error}</p>
                ) : (
                  <p>
                    {m.content}
                    {pending && i === messages.length - 1 && m.role === 'assistant' && (
                      <span className="caret" />
                    )}
                  </p>
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = input;
          setInput('');
          ask(q);
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question — objections, Scripture, strategy…"
          rows={1}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const q = input;
              setInput('');
              ask(q);
            }
          }}
        />
        <button type="submit" disabled={pending || !input.trim()}>
          {pending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
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
