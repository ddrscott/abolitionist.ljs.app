/**
 * The answer engine — the transport-agnostic "brain" behind every way a
 * consumer reaches the abolitionist knowledge base.
 *
 * One question goes in; it is answered by consulting TWO independent
 * resources in parallel —
 *
 *   1. the WRITINGS  — the R2 article corpus, via the AI Search binding's
 *      retrieval-only `.search()` (NOT `.chatCompletions()`, which would
 *      both retrieve and write and could only ever see the articles);
 *   2. the TALKS     — abolitionist YouTube transcripts, via the AYC read
 *      API (`ayc.ljs.app/api/v1/search`), gated by AYC_TOKEN.
 *
 * — then merged and handed to a single synthesis model that writes ONE
 * blended answer in the movement's voice, citing both. Sources come back
 * as structured data so any transport can render them however it likes
 * (chips + YouTube-timestamp cards on the web, tool result on MCP).
 *
 * `runAsk()` is an async generator of typed events so the same core drives
 * an SSE stream (web), an MCP tool result (agents), or a buffered REST
 * response — see worker/index.ts for the SSE transport.
 */

// ---------------------------------------------------------------------------
// Environment surface this module needs. The Worker's full Env extends this.
// ---------------------------------------------------------------------------

export interface AnswerEnv {
  // AI Search binding. `.search()` is retrieval-only and returns the matched
  // article chunks without generating an answer. NOTE: the runtime shape
  // differs from the (stale) generated AutoRAG types — it returns `chunks`,
  // each with `text` and an `item.key` holding the R2 object key. Verified
  // against the live binding (wrangler 4.84).
  AI_SEARCH: {
    search: (input: {
      query: string;
      max_num_results?: number;
      rewrite_query?: boolean;
    }) => Promise<{
      search_query: string;
      chunks: {
        id: string;
        score: number;
        text: string;
        item?: { key?: string };
      }[];
    }>;
  };
  // Workers AI binding. `.run(model, { messages, stream: true })` returns a
  // ReadableStream of SSE bytes (`data: {"response":"…"}` per token).
  AI: {
    run: (
      model: string,
      input: Record<string, unknown>,
    ) => Promise<ReadableStream<Uint8Array>>;
  };
  // Read-scoped AYC service token ("ayc_…"). Channel-scoped to the
  // abolitionist channels, so requests omit `channels` to use the grant.
  AYC_TOKEN: string;
}

// Workers AI synthesis model. fp8-fast 70B is a good quality/latency
// balance and supports streaming `messages`. Swap here to change the
// synthesis backend (e.g. an external Claude call) without touching the
// transports — this function is the only place the model is named.
const SYNTHESIS_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const AYC_BASE = 'https://ayc.ljs.app';

// How many chunks to pull from each resource before synthesis.
const WRITINGS_MAX = 6;
const TALKS_MAX = 6;

// ---------------------------------------------------------------------------
// Source + event types
// ---------------------------------------------------------------------------

/** A retrieved article chunk from the writings corpus. */
export interface ArticleSource {
  type: 'article';
  /** R2 key, e.g. "freethestates.org/foo.md". */
  key: string;
  /** Same-origin article URL, e.g. "/pages/freethestates.org/foo/". */
  url: string;
  /** Human label derived from the slug. */
  title: string;
  /** Retrieved text (the matched passage). */
  text: string;
  score: number;
}

/** A retrieved video clip from the AYC talks corpus. */
export interface ClipSource {
  type: 'clip';
  /** AYC chunk id. */
  id: string;
  /** The transcript Q&A. */
  question: string;
  answer: string;
  speaker?: string;
  topics: string[];
  confidence?: number;
  /** YouTube video id + start offset → deep link. */
  videoId: string;
  startSeconds: number;
  videoTitle: string;
  channelName: string;
  /** youtube.com/watch?v=<id>&t=<start>s */
  youtubeUrl: string;
  score?: number;
}

export type Source = ArticleSource | ClipSource;

/** Events emitted by runAsk(), consumed by whichever transport drives it. */
export type AskEvent =
  | { type: 'step'; phase: 'writings' | 'talks'; status: 'searching' }
  | { type: 'step'; phase: 'writings' | 'talks'; status: 'done'; found: number }
  | { type: 'step'; phase: 'writings' | 'talks'; status: 'error'; message: string }
  | { type: 'step'; phase: 'synthesize'; status: 'start' }
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Resource 1: the writings (R2 article corpus via AI Search retrieval)
// ---------------------------------------------------------------------------

/** R2 key → same-origin article URL. `/pages/` is a UI-side prefix; the
 *  key itself is `<site>/<slug>.md`, so the mapping is a simple prepend. */
function keyToUrl(key: string): string {
  return `/pages/${key.replace(/\.mdx?$/i, '')}/`;
}

function keyToTitle(key: string): string {
  const base = key.replace(/\.mdx?$/i, '').split('/').pop() ?? key;
  return base.replace(/-/g, ' ');
}

/** Retrieved article chunks arrive with the article's YAML frontmatter
 *  prepended to the body. Strip it so the synthesis context is prose, not
 *  metadata noise. */
function stripFrontmatter(text: string): string {
  const m = text.match(/^---\n[\s\S]*?\n---\n?/);
  return (m ? text.slice(m[0].length) : text).trim();
}

export async function searchWritings(
  env: AnswerEnv,
  query: string,
): Promise<ArticleSource[]> {
  const res = await env.AI_SEARCH.search({
    query,
    max_num_results: WRITINGS_MAX,
    rewrite_query: true,
  });
  // One result per matched chunk; the same article can appear multiple
  // times. Collapse to one entry per R2 key, keeping the highest-scored.
  const seen = new Set<string>();
  const out: ArticleSource[] = [];
  for (const c of res.chunks ?? []) {
    const key = c.item?.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: 'article',
      key,
      url: keyToUrl(key),
      title: keyToTitle(key),
      text: stripFrontmatter(c.text ?? ''),
      score: c.score,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resource 2: the talks (AYC video transcripts via the read API)
// ---------------------------------------------------------------------------

interface AycMatch {
  id: string;
  kind: string;
  start_seconds: number;
  end_seconds: number;
  question: string;
  answer: string;
  speaker?: string;
  topics?: string; // JSON-encoded string array
  confidence?: number;
  video_id: string;
  channel_id: string;
  video_title: string;
  channel_handle: string;
  channel_name: string;
  score?: number;
}

function parseTopics(raw?: string): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function clipFromMatch(m: AycMatch): ClipSource {
  const t = Math.max(0, Math.floor(m.start_seconds));
  return {
    type: 'clip',
    id: m.id,
    question: m.question,
    answer: m.answer,
    speaker: m.speaker,
    topics: parseTopics(m.topics),
    confidence: m.confidence,
    videoId: m.video_id,
    startSeconds: t,
    videoTitle: m.video_title,
    channelName: m.channel_name,
    youtubeUrl: `https://www.youtube.com/watch?v=${m.video_id}&t=${t}s`,
    score: m.score,
  };
}

export async function searchTalks(
  env: AnswerEnv,
  query: string,
): Promise<ClipSource[]> {
  // Token is channel-scoped, so we omit `channels` and use the full grant.
  const res = await fetch(`${AYC_BASE}/api/v1/search`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.AYC_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, top_k: TALKS_MAX }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AYC search ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { matches?: AycMatch[] };
  return (data.matches ?? []).map(clipFromMatch);
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

// The abolitionist voice. Kept here because synthesis is the only place
// it's load-bearing now; transports import it if they need it elsewhere.
export const ABOLITIONIST_VOICE = [
  'You ARE an abolitionist. You are not describing the movement from the',
  'outside — you are in it. Speak in first person ("we", "our", "I") or',
  'state claims as fact. Never say "abolitionists believe"; say "we',
  'believe" or just state the claim.',
  '',
  'Lead every answer with the direct claim, stated plainly. Support it from',
  'the supplied sources afterward. Short paragraphs. Conversational — as if',
  'someone on a sidewalk just asked you a hard question.',
  '',
  'Our moral ground: every human being, from conception onward, bears the',
  'image of God and must be protected by law. Abortion is the murder of a',
  'human being. We work for its immediate and total abolition, by the',
  'authority of Scripture. Be pastoral when the question is personal (grief,',
  'shame, fear).',
].join('\n');

/** Build the synthesis prompt from the merged, retrieved sources. The model
 *  writes the prose; citations are rendered separately from the structured
 *  Source objects, so we don't ask it to format links. */
function synthesisMessages(
  question: string,
  writings: ArticleSource[],
  talks: ClipSource[],
): { role: string; content: string }[] {
  const parts: string[] = [];

  if (writings.length > 0) {
    parts.push('WRITINGS (from the movement\'s articles):');
    writings.forEach((w, i) => {
      parts.push(`[W${i + 1}] ${w.title}\n${w.text}`);
    });
    parts.push('');
  }
  if (talks.length > 0) {
    parts.push('TALKS (from the movement\'s videos — spoken answers):');
    talks.forEach((c, i) => {
      const who = c.speaker ? ` (${c.speaker})` : '';
      parts.push(`[T${i + 1}] Q: ${c.question}\nA: ${c.answer}${who}`);
    });
    parts.push('');
  }
  if (writings.length === 0 && talks.length === 0) {
    parts.push('(No sources were found for this question.)');
  }

  const instruction = [
    `QUESTION: ${question}`,
    '',
    parts.join('\n'),
    '',
    'Answer the question in the abolitionist voice using ONLY the sources',
    'above. Weave the writings and talks together into one coherent answer —',
    'do not separate them or label which is which. Lead with the claim. Do',
    'NOT invent facts the sources do not support. If the sources do not',
    'answer the question, say so plainly. Do not print citation markers or',
    'URLs — the sources are shown to the reader separately.',
  ].join('\n');

  return [
    { role: 'system', content: ABOLITIONIST_VOICE },
    { role: 'user', content: instruction },
  ];
}

/** Stream synthesis tokens from Workers AI, yielding plain text deltas.
 *  Parses the Workers AI SSE shape (`data: {"response":"…"}`). */
async function* streamSynthesis(
  env: AnswerEnv,
  question: string,
  writings: ArticleSource[],
  talks: ClipSource[],
): AsyncGenerator<string> {
  const stream = await env.AI.run(SYNTHESIS_MODEL, {
    messages: synthesisMessages(question, writings, talks),
    stream: true,
    // Workers AI defaults to a small output budget (~256 tokens), which
    // truncated answers mid-sentence. Give the synthesis room to finish.
    max_tokens: 900,
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload) as { response?: string };
        if (typeof obj.response === 'string' && obj.response.length > 0) {
          yield obj.response;
        }
      } catch {
        // ignore keep-alive / non-JSON lines
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The orchestration core
// ---------------------------------------------------------------------------

/**
 * Answer a question by consulting both resources in parallel, then
 * synthesizing. Yields typed events; the caller's transport decides how to
 * surface them (SSE, MCP tool result, buffered JSON). The "show your work"
 * step events are emitted as each resource resolves.
 */
export async function* runAsk(
  env: AnswerEnv,
  question: string,
): AsyncGenerator<AskEvent> {
  yield { type: 'step', phase: 'writings', status: 'searching' };
  yield { type: 'step', phase: 'talks', status: 'searching' };

  // Fan out to both resources concurrently; surface a per-resource error
  // as a step event rather than failing the whole answer (a partial answer
  // from one corpus still beats nothing).
  const writingsP = searchWritings(env, question).then(
    (r) => ({ ok: true as const, value: r }),
    (e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  const talksP = searchTalks(env, question).then(
    (r) => ({ ok: true as const, value: r }),
    (e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );

  const [writingsR, talksR] = await Promise.all([writingsP, talksP]);

  const writings = writingsR.ok ? writingsR.value : [];
  const talks = talksR.ok ? talksR.value : [];

  if (writingsR.ok) {
    yield { type: 'step', phase: 'writings', status: 'done', found: writings.length };
  } else {
    yield { type: 'step', phase: 'writings', status: 'error', message: writingsR.error };
  }
  if (talksR.ok) {
    yield { type: 'step', phase: 'talks', status: 'done', found: talks.length };
  } else {
    yield { type: 'step', phase: 'talks', status: 'error', message: talksR.error };
  }

  // Hand the merged sources to the transport up front so citations can
  // render before / during the streamed prose.
  yield { type: 'sources', sources: [...writings, ...talks] };

  yield { type: 'step', phase: 'synthesize', status: 'start' };
  try {
    for await (const text of streamSynthesis(env, question, writings, talks)) {
      yield { type: 'token', text };
    }
    yield { type: 'done' };
  } catch (e) {
    yield {
      type: 'error',
      message: e instanceof Error ? e.message : 'synthesis failed',
    };
  }
}

/** Buffered convenience wrapper — runs the generator to completion and
 *  returns the final answer + sources. Used by non-streaming transports
 *  (e.g. the MCP `ask_abolitionist` tool, which returns a single result). */
export async function ask(
  env: AnswerEnv,
  question: string,
): Promise<{ answer: string; sources: Source[] }> {
  let answer = '';
  let sources: Source[] = [];
  for await (const ev of runAsk(env, question)) {
    if (ev.type === 'token') answer += ev.text;
    else if (ev.type === 'sources') sources = ev.sources;
    else if (ev.type === 'error') throw new Error(ev.message);
  }
  return { answer: answer.trim(), sources };
}
