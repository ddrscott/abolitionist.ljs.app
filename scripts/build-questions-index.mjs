#!/usr/bin/env node
/**
 * Walk pages/<site>/*-questions.json files and emit a flat searchable
 * index at web/public/questions-index.json. The chat box loads this on
 * mount and tries a fuzzy match first — if the user's question hits a
 * pre-curated Q&A, we answer without calling the AI Worker.
 *
 * Usage:
 *   node scripts/build-questions-index.mjs
 *
 * Run automatically before `pnpm build` via the prebuild hook.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PAGES = resolve(here, '..', 'pages');
const OUT = resolve(here, '..', 'web', 'public', 'questions-index.json');

const index = [];
const seenQ = new Set();

for (const site of readdirSync(PAGES, { withFileTypes: true })) {
  if (!site.isDirectory()) continue;
  if (site.name === 'journey') continue; // authored MDX, no -questions.json
  const siteDir = resolve(PAGES, site.name);
  for (const f of readdirSync(siteDir)) {
    if (!f.endsWith('-questions.json')) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync(resolve(siteDir, f), 'utf8'));
    } catch {
      continue;
    }
    const slug = (raw.source_article ?? f.replace('-questions.json', '.md'))
      .replace(/\.md$/, '');
    const u = `/pages/${site.name}/${slug}/`;
    const t = raw.title ?? slug;
    for (const q of raw.questions ?? []) {
      if (!q.question || !q.answer) continue;
      // De-dupe near-identical questions that sometimes appear across
      // multiple articles. Use a normalized prefix as the dedupe key.
      const key = q.question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);
      if (seenQ.has(key)) continue;
      seenQ.add(key);
      index.push({
        q: q.question,
        a: q.answer,
        t,
        u,
        qt: q.quote || undefined,
      });
    }
  }
}

writeFileSync(OUT, JSON.stringify(index));
const sizeKb = (JSON.stringify(index).length / 1024).toFixed(1);
console.error(`wrote ${index.length} questions to ${OUT} (${sizeKb} KB raw)`);
