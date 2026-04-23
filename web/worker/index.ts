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
