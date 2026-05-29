/**
 * Worker entry point. Most requests fall through to the static-asset
 * runtime (Next.js export in ./out). The only path this handler owns is
 * `/api/chat`, which proxies to the Cloudflare AI Search instance via
 * the bound `AI_SEARCH` instance — no public endpoint, no API token,
 * no instance ID exposed to the browser.
 */

import { runAsk, type AnswerEnv } from './answer';
import {
  handleSessionsCollection,
  handleSessionItem,
  handleSharedShell,
  type SessionEnv,
  type D1Database,
} from './sessions';

interface Env extends AnswerEnv, SessionEnv {
  // Bound to the AI Search instance "abolitionist-r2" via wrangler.jsonc.
  // Methods land on the binding directly (no `.get()` needed for instance
  // bindings). `.search()` (retrieval-only) is declared on AnswerEnv and
  // drives /api/ask; `.chatCompletions()` here still backs legacy /api/chat.
  AI_SEARCH: AnswerEnv['AI_SEARCH'] & {
    chatCompletions: (input: {
      messages: { role: string; content: string }[];
      stream?: boolean;
      model?: string;
      ai_search_options?: {
        retrieval?: { max_num_results?: number };
        query_rewrite?: { enabled?: boolean };
      };
    }) => Promise<ReadableStream<Uint8Array>>;
  };
  // `DB` (bound in wrangler.jsonc) holds BOTH the feedback table
  // (migrations/0001) and the chat `sessions` table (worker/sessions.ts).
  // ASSETS + DB are declared on SessionEnv.
}

// The model tends to mirror the register of the retrieved articles, which
// are written in third person ("the abolitionist movement teaches that
// ..."). Left alone, answers sound like a Wikipedia summary ABOUT the
// movement. We want the opposite: answers FROM inside the movement, in
// first person, leading with the claim. Hence the explicit voice rules
// and the embedded micro-example.
const SYSTEM_PROMPT = [
  'You ARE an abolitionist. You are not describing the movement from the',
  'outside — you are in it. Speak in first person ("we", "our", "I")',
  'or state claims as fact. Never say "abolitionists believe" or',
  '"according to the abolitionist movement"; say "we believe" or just',
  'state the claim.',
  '',
  'Lead every answer with the direct claim, stated plainly. Support it',
  'from the supplied writings afterward. Short paragraphs. Conversational',
  "— as if someone on a sidewalk just asked you a hard question.",
  '',
  'Example of the right voice — question: "At what point is a clump of',
  'cells considered human?" Answer: "From the moment of conception. A',
  "human zygote can't be any other species — human DNA, continuous",
  'development, distinct person. Scripture and standard embryology agree."',
  'NOT: "According to the abolitionist movement, a clump of cells is',
  'considered human at the moment of conception."',
  '',
  'Our moral ground: every human being, from conception onward, bears the',
  'image of God and must be protected by law. Abortion is the murder of',
  'a human being. We work for its immediate and total abolition, by the',
  'authority of Scripture.',
  '',
  'Draw only from the supplied writings of the movement. Be pastoral when',
  'the question is personal (grief, shame, fear). Quote sparingly. Never',
  "invent facts the writings don't support. If the writings don't answer",
  'the question, say so plainly.',
].join('\n');

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/feedback') {
      return handleFeedback(request, env);
    }

    if (url.pathname === '/api/ask') {
      return handleAsk(request, env);
    }

    // Chat session persistence + sharing.
    if (url.pathname === '/api/sessions') {
      return handleSessionsCollection(request, env);
    }
    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/?$/);
    if (sessionMatch) {
      return handleSessionItem(request, env, decodeURIComponent(sessionMatch[1]));
    }
    // Shared-link shell: /c/<id> renders the SPA with OG tags injected.
    const shareMatch = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (shareMatch) {
      return handleSharedShell(request, env, decodeURIComponent(shareMatch[1]));
    }

    if (url.pathname !== '/api/chat') {
      // Defensive: with `run_worker_first: false` (default) this branch
      // shouldn't be reached, since the asset runtime serves first. Keep
      // it as a safety net.
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'POST') {
      return new Response('method not allowed', {
        status: 405,
        headers: { allow: 'POST' },
      });
    }

    let body: { messages?: { role: string; content: string }[] };
    try {
      body = await request.json();
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return new Response('missing messages', { status: 400 });
    }

    // Prepend a system prompt if the client didn't supply one.
    const enrichedMessages = messages.some((m) => m.role === 'system')
      ? messages
      : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    try {
      const stream = await env.AI_SEARCH.chatCompletions({
        messages: enrichedMessages,
        stream: true,
        ai_search_options: {
          retrieval: { max_num_results: 5 },
          query_rewrite: { enabled: true },
        },
      });

      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'AI Search request failed';
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
  },
};

// POST /api/ask — the agentic, multi-resource answer endpoint. Streams an
// SSE event sequence so the client can "show the work":
//
//   event: step    data: {"phase":"writings","status":"searching"}
//   event: step    data: {"phase":"talks","status":"done","found":6}
//   event: sources data: [{type:"article",...},{type:"clip",...}]
//   event: token   data: {"text":"…"}            (synthesis deltas)
//   event: done    data: {}
//   event: error   data: {"message":"…"}
//
// Body: { question: string } OR { messages: [{role, content}] } (we take
// the last user message as the question — keeps the existing chat client
// contract usable).
async function handleAsk(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', {
      status: 405,
      headers: { allow: 'POST' },
    });
  }

  let body: {
    question?: string;
    messages?: { role: string; content: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const question =
    typeof body.question === 'string' && body.question.trim()
      ? body.question.trim()
      : [...(body.messages ?? [])]
          .reverse()
          .find((m) => m.role === 'user')
          ?.content?.trim();

  if (!question) {
    return new Response('missing question', { status: 400 });
  }

  const encoder = new TextEncoder();
  const sse = (event: string, data: unknown): Uint8Array =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of runAsk(env, question)) {
          if (ev.type === 'token') {
            controller.enqueue(sse('token', { text: ev.text }));
          } else if (ev.type === 'sources') {
            controller.enqueue(sse('sources', ev.sources));
          } else if (ev.type === 'done') {
            controller.enqueue(sse('done', {}));
          } else if (ev.type === 'error') {
            controller.enqueue(sse('error', { message: ev.message }));
          } else {
            // step events
            controller.enqueue(sse('step', ev));
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'answer engine failed';
        controller.enqueue(sse('error', { message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    },
  });
}

// Idempotent schema bootstrap. Runs once per Worker isolate the first
// time /api/feedback is hit — avoids needing `wrangler d1 execute` to
// apply migrations after the D1 is created. Matches the DDL in
// web/migrations/0001_feedback.sql.
let schemaApplied = false;
async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaApplied) return;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS feedback (
           id          INTEGER PRIMARY KEY AUTOINCREMENT,
           created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
           rating      INTEGER NOT NULL CHECK (rating IN (-1, 1)),
           source      TEXT    NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'index')),
           question    TEXT    NOT NULL,
           answer      TEXT    NOT NULL
         )`,
      )
      .run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_rating     ON feedback (rating)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_source     ON feedback (source)').run();
    schemaApplied = true;
  } catch {
    // Let the actual insert fail + surface the error to the client if
    // the DDL somehow failed; don't permanently cache the failure.
  }
}

// POST /api/feedback — record a thumbs-up (rating=1) or thumbs-down
// (rating=-1) against a (question, answer) pair so the team can review
// where the AI is helpful or off-base.
//
// Body: { rating: 1 | -1, question: string, answer: string, source?: 'ai' | 'index' }
async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', {
      status: 405,
      headers: { allow: 'POST' },
    });
  }
  let body: {
    rating?: number;
    question?: string;
    answer?: string;
    source?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  const { rating, question, answer } = body;
  const source = body.source === 'index' ? 'index' : 'ai';
  if (rating !== 1 && rating !== -1) {
    return new Response('bad rating (must be 1 or -1)', { status: 400 });
  }
  if (typeof question !== 'string' || !question.trim()) {
    return new Response('missing question', { status: 400 });
  }
  if (typeof answer !== 'string' || !answer.trim()) {
    return new Response('missing answer', { status: 400 });
  }
  try {
    await ensureSchema(env.DB);
    await env.DB.prepare(
      'INSERT INTO feedback (rating, question, answer, source) VALUES (?, ?, ?, ?)',
    )
      .bind(rating, question.slice(0, 2000), answer.slice(0, 10_000), source)
      .run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'db write failed';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
