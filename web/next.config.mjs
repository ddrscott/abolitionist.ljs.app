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
  // Article bodies link to images served from the original WordPress sites.
  // next/image requires hostnames to be allow-listed.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'freethestates.org' },
      { protocol: 'https', hostname: 'abolitionistsrising.com' },
    ],
  },
};

export default withMDX(config);
