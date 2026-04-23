/**
 * Worker entry point. Most requests fall through to the static-asset
 * runtime (Next.js export in ./out). The only path this handler owns is
 * `/api/chat`, which proxies to the Cloudflare AI Search instance via
 * the bound `AI_SEARCH` instance — no public endpoint, no API token,
 * no instance ID exposed to the browser.
 */

interface Env {
  // Bound to the AI Search instance "abolitionist-r2" via wrangler.jsonc.
  // Methods land on the binding directly (no `.get()` needed for instance
  // bindings).
  AI_SEARCH: {
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
  ASSETS: Fetcher;
}

const SYSTEM_PROMPT = [
  'You are an abolitionist answering a question about the movement to abolish',
  'abortion. Draw only from the supplied writings of the movement. Be direct,',
  'pastoral when the question is personal, and morally clear — abolitionists',
  'hold that every human being, in or out of the womb, bears the image of God',
  'and must be protected. Quote sparingly. Never invent facts the writings',
  "don't support. If the writings don't answer the question, say so plainly.",
].join(' ');

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
