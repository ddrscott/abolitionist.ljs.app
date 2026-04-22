import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// `staticGET` serves the entire pre-built Orama index as a single JSON
// response. The client downloads it once (cached by the browser/CDN) and
// runs queries in-browser via `fumadocs-ui`'s `type: 'static'` search mode.
// No per-request indexing, no warm/cold-start variance, CDN-cacheable.
export const { staticGET: GET } = createFromSource(source);

// Pre-render the index at build time (so it ships as a static file when
// the site is exported, not as a serverless function).
export const dynamic = 'force-static';
export const revalidate = false;
