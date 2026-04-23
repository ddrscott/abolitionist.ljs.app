'use client';

import Link from 'next/link';
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

/** Extract the R2 key from a citation in either shape. */
function citationKey(c: Citation): string | undefined {
  return c.filename ?? c.item?.key;
}

type Message = {
  role: 'user' | 'assistant';
  /** Streamed text content. */
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

/** Strip the ".md" or ".mdx" extension and turn the R2 key into a relative /pages URL. */
function citationToHref(filename: string): string {
  const slug = filename.replace(/\.mdx?$/i, '');
  return `/pages/${slug}`;
}

/** Pretty label for a citation chip — last path segment, no extension. */
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

  // Keep the transcript scrolled to the bottom as new tokens arrive.
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
      // Same-origin call to our Worker; the Worker proxies to AI Search
      // via service binding (no API token, no public endpoint).
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`chat backend responded ${res.status}`);
      }

      // SSE stream from Cloudflare AI Search:
      //   event: chunks
      //   data: [ {id, text, item:{key,...}, ...}, ... ]    ← citations, sent first
      //
      //   data: {choices:[{delta:{content:"..."}}], ...}    ← OpenAI-shape token deltas
      //   data: {choices:[{delta:{content:"..."}}], ...}
      //   data: [DONE]
      //
      // We track the most recent `event:` field per message block and
      // dispatch `data:` payloads accordingly. Blank lines separate
      // message blocks (per the SSE spec).
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

          // Citation event arrives once, before streaming starts.
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

          // Token delta in OpenAI chat-completion-chunk shape.
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

      // Final write in case citations only arrived in a late chunk.
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
      // Refocus the input for the next turn.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-fd-border bg-fd-card text-fd-foreground shadow-sm">
      {/* transcript */}
      <div
        ref={transcriptRef}
        className="max-h-[60vh] min-h-[200px] overflow-y-auto px-5 py-4"
      >
        {messages.length === 0 ? (
          <Welcome onPick={ask} disabled={false} />
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <li
                key={i}
                className={
                  m.role === 'user'
                    ? 'self-end max-w-[85%] rounded-lg bg-fd-primary/10 px-3 py-2 text-fd-primary'
                    : 'self-start max-w-full text-sm leading-relaxed'
                }
              >
                {m.error ? (
                  <p className="text-red-500">Error: {m.error}</p>
                ) : (
                  <p className="whitespace-pre-wrap">
                    {m.content}
                    {pending && i === messages.length - 1 && m.role === 'assistant' && (
                      <span className="ml-1 inline-block h-4 w-2 translate-y-[2px] animate-pulse bg-fd-foreground/40" />
                    )}
                  </p>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.citations.map((c, j) => {
                      const key = citationKey(c);
                      if (!key) return null;
                      return (
                        <Link
                          key={`${i}-${j}`}
                          href={citationToHref(key)}
                          title={c.text}
                          className="rounded-full border border-fd-border bg-fd-background px-2 py-0.5 text-xs text-fd-muted-foreground hover:border-fd-primary hover:text-fd-primary"
                        >
                          {citationLabel(key)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = input;
          setInput('');
          ask(q);
        }}
        className="flex items-end gap-2 border-t border-fd-border p-3"
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
          className="min-h-[44px] flex-1 resize-none rounded-md border border-fd-border bg-fd-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fd-primary/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="h-[44px] shrink-0 rounded-md bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

function Welcome({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 text-fd-muted-foreground">
      <p className="text-sm">
        Ask a question. Answers come from the writings of the abolitionist
        movement — every claim links back to the source so you can see
        where it came from.
      </p>
      {!disabled && (
        <div className="flex flex-wrap gap-2 pt-2">
          {SAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onPick(q)}
              className="rounded-full border border-fd-border bg-fd-background px-3 py-1 text-xs hover:border-fd-primary hover:text-fd-primary"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
