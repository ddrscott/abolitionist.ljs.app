#!/usr/bin/env node
/**
 * Post-build step: for every article linked from the Journey map
 * (web/public/journey-map.excalidraw), write a stripped-down
 * fragment.html next to the article's built index.html containing
 * just the article body (Starlight's <main> minus its trailing
 * prev/next <footer>). The journey page fetches these fragments on
 * click and renders them inside the right-sidebar panel — no iframe,
 * no chrome, anchors scroll inside the panel.
 *
 * Must run AFTER `astro build` because it reads `dist/.../index.html`.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXCALI = path.join(ROOT, 'web/public/journey-map.excalidraw');
const DIST = path.join(ROOT, 'web/dist');
const MANIFEST = path.join(DIST, 'journey-fragments.json');

const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
};
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => HTML_ENTITIES[name.toLowerCase()] ?? m);
}

function extractArticle(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Article title from <h1 id="_top">…</h1> (Starlight's page hero).
  let title = null;
  const titleMatch = html.match(/<h1 id="_top"[^>]*>([\s\S]*?)<\/h1>/);
  if (titleMatch) title = decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim());

  // <main> inner HTML. Starlight's build output has exactly one <main>.
  const mainStart = html.indexOf('<main');
  if (mainStart < 0) return null;
  const mainOpen = html.indexOf('>', mainStart) + 1;
  const mainClose = html.indexOf('</main>', mainOpen);
  if (mainClose < 0) return null;
  let inner = html.slice(mainOpen, mainClose);

  // Strip Starlight's trailing prev/next <footer> block (if present).
  const footerIdx = inner.lastIndexOf('<footer');
  if (footerIdx > 0) inner = inner.slice(0, footerIdx).trim();

  return { title, html: inner };
}

function main() {
  const doc = JSON.parse(fs.readFileSync(EXCALI, 'utf8'));
  const urls = new Set();
  for (const el of doc.elements) {
    if (!el.link) continue;
    // Strip hash; we only need one fragment per article path.
    const raw = el.link.split('#')[0];
    if (raw.startsWith('/pages/')) urls.add(raw);
  }

  const manifest = {};
  let written = 0,
    skipped = 0;
  for (const u of urls) {
    // URL `/pages/host/slug/` → dist path `dist/pages/host/slug/index.html`.
    const parts = u.replace(/^\/+|\/+$/g, '').split('/');
    const indexPath = path.join(DIST, ...parts, 'index.html');
    if (!fs.existsSync(indexPath)) {
      skipped++;
      console.warn(`journey-fragments: missing source ${indexPath}`);
      continue;
    }
    const extracted = extractArticle(indexPath);
    if (!extracted) {
      skipped++;
      continue;
    }
    const fragPath = path.join(path.dirname(indexPath), 'fragment.html');
    fs.writeFileSync(fragPath, extracted.html);
    // Request the extension-less URL at runtime: Cloudflare Workers
    // Assets 307-redirects `fragment.html` → `fragment` (pretty-URL
    // rewrite), so asking for the target directly skips one hop.
    manifest[u] = { title: extracted.title, fragment: u + 'fragment' };
    written++;
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`journey-fragments: ${written} written, ${skipped} skipped, manifest at ${MANIFEST}`);
}

main();
