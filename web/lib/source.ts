// fumadocs-mdx 14+ writes `.source/server.ts` (no index file), so import
// the server entry directly. The `docs` collection is generated from the
// `defineDocs({ name: 'docs', dir: ... })` call in source.config.ts.
import { docs } from '@/.source/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
