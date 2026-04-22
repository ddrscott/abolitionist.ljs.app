# Document architecture conversation

## Problem
We just made a series of architectural decisions across one conversation that
won't survive without being written down:

1. Why the docs are extracted to Markdown + frontmatter (vs. parsed at runtime
   from the WP mirrors).
2. Why Fumadocs reads from `../docs` with a widened Turbopack root and
   `external/dir` style config (and why a symlink was tried and rejected).
3. Why the sidebar is grouped by **WordPress categories** rather than Diataxis
   or any other taxonomy (the corpus is editorial advocacy, not technical
   docs; the original editors' categories are the truth).
4. Why search is **static Orama** (`staticGET` + `type: 'static'`) rather than
   per-request re-indexing, and the size tradeoff (~18 MB raw, ~5 MB gzipped).
5. The intended next step: **Cloudflare AutoRAG** for the Q&A chatbot, with
   citations linking back to `/docs/<site>/<slug>` via the `source_url` /
   `source_post_id` frontmatter fields.

Future-me (or another agent) needs this written down so we don't relitigate
each decision when extending the system.

## Acceptance Criteria
- A design doc lives at `docs/_meta/architecture.md` (or
  `ARCHITECTURE.md` at the repo root — pick one and explain why) covering:
  - Data flow: WP mirror → `extract_articles.py` → `docs/` → Fumadocs +
    (future) AutoRAG.
  - The "why" for each numbered decision above (one short paragraph each).
  - The two open decisions: AutoRAG vs DIY (Vectorize + Workers AI), and
    where the chatbox lives (embedded widget vs `/chat` route).
  - A short "what to read next" section pointing at `scripts/extract_articles.py`,
    `web/source.config.ts`, `web/lib/category-tree.ts`, and
    `web/app/api/search/route.ts`.
- The doc is concise — closer to 300 lines than 1000. No marketing fluff.
- Cross-link from `README.md` so it's discoverable.

## Relevant Files
- `scripts/extract_articles.py` — extraction pipeline + frontmatter schema
- `web/source.config.ts` — Fumadocs collection config (`dir: '../docs'`, schema)
- `web/next.config.mjs` — `turbopack.root` widening + `images.remotePatterns`
- `web/lib/category-tree.ts` — sidebar grouping by category
- `web/app/api/search/route.ts` — static Orama index endpoint
- `web/app/layout.tsx` — `RootProvider search.options.type = 'static'`
- `README.md` — top-level project docs

## Constraints
- **Do not** invent architecture that wasn't discussed (e.g. don't recommend
  Algolia or a different vector DB unless flagging it explicitly as an
  alternative the maintainer should consider).
- **Do** write the doc as if the reader has just cloned the repo with no
  conversation history. Concrete file paths, not vague references.
- The two open decisions stay open in the doc — don't pre-decide them.
- Keep it readable as Markdown — don't rely on Fumadocs MDX components.
