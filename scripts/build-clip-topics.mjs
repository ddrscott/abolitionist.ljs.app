#!/usr/bin/env node
/**
 * Build web/public/clip-topics.json — the distinct AYC clip topics with
 * counts, used by the /questions Talks tab for fast fuzzy topic filtering.
 *
 * Best-effort: needs AYC_TOKEN (env or web/.dev.vars). If it's missing or the
 * fetch fails, we keep whatever file is already committed and exit cleanly so
 * builds never break on this.
 *
 *   node scripts/build-clip-topics.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'web', 'public', 'clip-topics.json');
const AYC_BASE = 'https://ayc.ljs.app';

function getToken() {
  if (process.env.AYC_TOKEN) return process.env.AYC_TOKEN.trim();
  const devVars = resolve(here, '..', 'web', '.dev.vars');
  if (existsSync(devVars)) {
    const m = readFileSync(devVars, 'utf8').match(/^AYC_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  }
  return null;
}

const token = getToken();
if (!token) {
  console.warn('[clip-topics] no AYC_TOKEN — skipping (keeping any existing clip-topics.json).');
  process.exit(0);
}

const counts = new Map();
let cursor = null;
let pages = 0;
let total = 0;
try {
  do {
    const params = new URLSearchParams({ limit: '500' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${AYC_BASE}/api/v1/chunks?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`chunks ${res.status}`);
    const data = await res.json();
    for (const c of data.chunks ?? []) {
      total += 1;
      let topics = [];
      try {
        topics = JSON.parse(c.topics ?? '[]');
      } catch {
        topics = [];
      }
      for (const t of Array.isArray(topics) ? topics : []) {
        const k = String(t).trim();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    cursor = data.next_cursor ?? null;
    pages += 1;
  } while (cursor && pages < 80);
} catch (e) {
  console.warn('[clip-topics] fetch failed — keeping existing file:', e.message);
  process.exit(0);
}

// Drop one-off tags to keep the index tight + the chips meaningful.
const arr = [...counts.entries()]
  .filter(([, n]) => n >= 2)
  .map(([t, n]) => ({ t, n }))
  .sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));

writeFileSync(OUT, JSON.stringify(arr));
const kb = (JSON.stringify(arr).length / 1024).toFixed(1);
console.log(`[clip-topics] ${arr.length} topics (>=2) from ${total} chunks → ${OUT} (${kb} KB)`);
