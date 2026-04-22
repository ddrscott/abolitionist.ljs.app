import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const withMDX = createMDX();
const here = dirname(fileURLToPath(import.meta.url));

// The article corpus lives at <project root>/docs (one level up from web/),
// and fumadocs-mdx generates `.source/server.ts` with relative imports like
// `../../docs/<slug>.md`. We widen Turbopack's workspace root to include
// both web/ and docs/ rather than copying or symlinking the corpus.
const projectRoot = resolve(here, '..');

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    root: projectRoot,
  },
  // Static-export the entire site so it deploys as flat HTML/CSS/JS to a
  // CDN (Cloudflare Pages). The chat box, sidebar, and search index all
  // run client-side or are pre-built; no server runtime needed.
  output: 'export',
  images: {
    // The Next image optimizer needs a server. Static export uses raw URLs.
    unoptimized: true,
  },
  // Pages serves "/foo/" for the page emitted at "/foo" — cleaner URLs
  // and avoids 404s on link-stripped paths.
  trailingSlash: true,
};

export default withMDX(config);
