/**
 * Chat-session persistence + sharing.
 *
 * Model (deliberately simple for v1): the CLIENT is the source of truth for a
 * session's transcript and re-saves the full message list after every turn
 * (AI or instant-index) via `POST /api/sessions`. The server owns identity:
 * it mints a short, cryptographically-random id and scopes ownership to an
 * `anon_id` cookie it sets on first contact. Signing in later (auth.ljs.app)
 * will "claim" anon sessions — not built yet.
 *
 * Sharing is a capability URL: `/c/<id>` is readable by anyone who has the
 * (unguessable) id; we never list other people's sessions. The Worker serves
 * the SPA shell for `/c/<id>` with the question injected into <title>/OG tags
 * so pasted links unfurl.
 *
 * Tradeoff noted: because the client supplies the saved content, a determined
 * user could store arbitrary text under an (unguessable) URL on this domain.
 * Acceptable for v1; revisit with server-authoritative persistence + rate
 * limits if it's ever abused.
 */

// --- minimal D1 surface (richer than index.ts's: needs first/all) ---------

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; meta?: unknown }>;
  first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface SessionEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

// --- anonymous identity (cookie) ------------------------------------------

const ANON_COOKIE = 'anon_id';
const ANON_MAX_AGE = 60 * 60 * 24 * 400; // ~400 days (Chrome's cap)

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Current anon id, minting a fresh one if absent. `setCookie` is non-null
 *  only when a new id was created and must be attached to the response. */
export function anonIdentity(request: Request): { anonId: string; setCookie?: string } {
  const existing = readCookie(request, ANON_COOKIE);
  if (existing) return { anonId: existing };
  const anonId = crypto.randomUUID();
  const setCookie =
    `${ANON_COOKIE}=${anonId}; Path=/; Max-Age=${ANON_MAX_AGE}; ` +
    `HttpOnly; Secure; SameSite=Lax`;
  return { anonId, setCookie };
}

// --- short, cryptographically-random ids ----------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** 12 chars of base62 ≈ 71 bits — unguessable, URL-safe, still short. */
export function shortId(len = 12): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// --- schema ----------------------------------------------------------------

let sessionsSchemaApplied = false;
export async function ensureSessionsSchema(db: D1Database): Promise<void> {
  if (sessionsSchemaApplied) return;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sessions (
           id          TEXT PRIMARY KEY,
           owner       TEXT NOT NULL,
           owner_kind  TEXT NOT NULL DEFAULT 'anon',
           title       TEXT NOT NULL DEFAULT '',
           messages    TEXT NOT NULL DEFAULT '[]',
           created_at  TEXT NOT NULL DEFAULT (datetime('now')),
           updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
         )`,
      )
      .run();
    await db
      .prepare('CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions (owner, updated_at)')
      .run();
    sessionsSchemaApplied = true;
  } catch {
    /* surface the real error on the actual query instead of caching failure */
  }
}

// --- helpers ---------------------------------------------------------------

const MAX_MESSAGES = 200;
const MAX_CONTENT = 20_000;

type StoredMessage = {
  role: string;
  content: string;
  sources?: unknown[];
  fromIndex?: boolean;
};

/** Clamp message sizes so a session row stays sane. */
function sanitizeMessages(raw: unknown): StoredMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: StoredMessage[] = [];
  for (const m of raw.slice(0, MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const msg: StoredMessage = { role, content: content.slice(0, MAX_CONTENT) };
    const sources = (m as { sources?: unknown }).sources;
    if (Array.isArray(sources)) msg.sources = sources.slice(0, 24);
    if ((m as { fromIndex?: unknown }).fromIndex === true) msg.fromIndex = true;
    out.push(msg);
  }
  return out.length > 0 ? out : null;
}

function deriveTitle(messages: StoredMessage[], fallback?: string): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const base = (fallback || firstUser?.content || 'Untitled chat').trim();
  return base.replace(/\s+/g, ' ').slice(0, 100);
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(init?.headers ?? {}),
    },
  });
}

// --- handlers --------------------------------------------------------------

/** POST /api/sessions — create or update a session (client sends full
 *  transcript). GET /api/sessions — list the caller's own sessions. */
export async function handleSessionsCollection(
  request: Request,
  env: SessionEnv,
): Promise<Response> {
  const { anonId, setCookie } = anonIdentity(request);
  const cookieHeaders = setCookie ? { 'set-cookie': setCookie } : undefined;
  await ensureSessionsSchema(env.DB);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, title, updated_at FROM sessions WHERE owner = ? ORDER BY updated_at DESC LIMIT 50',
    )
      .bind(anonId)
      .all<{ id: string; title: string; updated_at: string }>();
    return json({ sessions: results }, { headers: cookieHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  }

  let body: { id?: string; messages?: unknown; title?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, { status: 400, headers: cookieHeaders });
  }

  const messages = sanitizeMessages(body.messages);
  if (!messages) {
    return json({ error: 'missing messages' }, { status: 400, headers: cookieHeaders });
  }
  const title = deriveTitle(messages, body.title);
  const messagesJson = JSON.stringify(messages);

  // If an id is supplied, it must be unowned-or-ours; never clobber another
  // owner's session.
  let id = typeof body.id === 'string' && body.id.length >= 6 ? body.id : null;
  if (id) {
    const existing = await env.DB.prepare('SELECT owner FROM sessions WHERE id = ?')
      .bind(id)
      .first<{ owner: string }>();
    if (existing && existing.owner !== anonId) {
      return json({ error: 'forbidden' }, { status: 403, headers: cookieHeaders });
    }
  }
  if (!id) id = shortId();

  await env.DB.prepare(
    `INSERT INTO sessions (id, owner, owner_kind, title, messages)
       VALUES (?, ?, 'anon', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       messages = excluded.messages,
       updated_at = datetime('now')`,
  )
    .bind(id, anonId, title, messagesJson)
    .run();

  return json({ id, title }, { headers: cookieHeaders });
}

/** GET /api/sessions/:id (public-by-id) · DELETE /api/sessions/:id (owner). */
export async function handleSessionItem(
  request: Request,
  env: SessionEnv,
  id: string,
): Promise<Response> {
  const { anonId, setCookie } = anonIdentity(request);
  const cookieHeaders = setCookie ? { 'set-cookie': setCookie } : undefined;
  await ensureSessionsSchema(env.DB);

  if (request.method === 'DELETE') {
    const existing = await env.DB.prepare('SELECT owner FROM sessions WHERE id = ?')
      .bind(id)
      .first<{ owner: string }>();
    if (!existing) return json({ error: 'not_found' }, { status: 404, headers: cookieHeaders });
    if (existing.owner !== anonId) {
      return json({ error: 'forbidden' }, { status: 403, headers: cookieHeaders });
    }
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return json({ ok: true }, { headers: cookieHeaders });
  }

  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: { allow: 'GET, DELETE' } });
  }

  const row = await env.DB.prepare(
    'SELECT id, owner, title, messages, created_at, updated_at FROM sessions WHERE id = ?',
  )
    .bind(id)
    .first<{
      id: string;
      owner: string;
      title: string;
      messages: string;
      created_at: string;
      updated_at: string;
    }>();
  if (!row) return json({ error: 'not_found' }, { status: 404, headers: cookieHeaders });

  let messages: unknown = [];
  try {
    messages = JSON.parse(row.messages);
  } catch {
    messages = [];
  }
  return json(
    {
      id: row.id,
      title: row.title,
      messages,
      created_at: row.created_at,
      updated_at: row.updated_at,
      mine: row.owner === anonId,
    },
    { headers: cookieHeaders },
  );
}

// --- shared-link shell (GET /c/:id) ---------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setMetaContent(html: string, key: string, value: string): string {
  // property="og:x" or name="twitter:x" — replace the content attr in place.
  const re = new RegExp(
    `(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`,
    'i',
  );
  return html.replace(re, `$1${escapeHtml(value)}$2`);
}

/** Serve the SPA shell for a shared session, with the question woven into the
 *  title/OG tags so the link unfurls. The client reads the path and loads the
 *  session JSON to render. */
export async function handleSharedShell(
  request: Request,
  env: SessionEnv,
  id: string,
): Promise<Response> {
  await ensureSessionsSchema(env.DB);
  const row = await env.DB.prepare('SELECT title FROM sessions WHERE id = ?')
    .bind(id)
    .first<{ title: string }>()
    .catch(() => null);

  const origin = new URL(request.url).origin;
  const shellRes = await env.ASSETS.fetch(new Request(`${origin}/`));
  let html = await shellRes.text();

  if (row?.title) {
    const q = row.title;
    const shareUrl = `${origin}/c/${id}`;
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(q)} · Ask the Abolitionist</title>`);
    html = setMetaContent(html, 'og:title', q);
    html = setMetaContent(html, 'og:description', `An answer from the abolitionist movement — “${q}”`);
    html = setMetaContent(html, 'og:url', shareUrl);
    html = setMetaContent(html, 'twitter:title', q);
    html = setMetaContent(html, 'twitter:description', `An answer from the abolitionist movement — “${q}”`);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // shared links can be cached briefly by the browser but should revalidate
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
