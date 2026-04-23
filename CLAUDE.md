# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

`docs/ARCHITECTURE.md` is the canonical design doc — read it before
changing the extraction pipeline, the Fumadocs wiring, or the deploy. It
explains the *why* for every load-bearing decision (Markdown-first corpus,
Turbopack root widening, static Orama + AI Search split,
Worker-with-assets over Pages, etc.). `README.md` is surface-level
orientation and defers to it.

## Two directories, different jobs

- **`pages/`** — public content corpus. One `.md` per article
  (`pages/<host>/<slug>.md`), plus authored MDX under `pages/journey/`.
  This is what Fumadocs renders and what AI Search indexes.
- **`docs/`** — project / developer documentation only (`ARCHITECTURE.md`
  today). Not rendered on the site, not uploaded to R2.

Don't conflate them. A change that reads "add to docs" means developer
documentation; "add to pages" means site content.

## Common commands

Extraction / sync (run from repo root):

```sh
# Re-extract pages/ from ../abolitionistsrising.com and ../freethestates.org
# (HTTrack/wget mirrors, not checked in). Idempotent.
uv run scripts/extract_articles.py -v

# Upload pages/<site>/<slug>.md to R2 bucket "abolition-kb" so Cloudflare
# AI Search re-indexes. Uses local wrangler OAuth.
bash scripts/sync_to_r2.sh
```

Web app (run from `web/`, package manager is `pnpm@10`):

```sh
pnpm install         # runs `fumadocs-mdx` postinstall to generate .source/
pnpm dev             # Next.js dev server (Turbopack)
pnpm build           # static export to web/out/
wrangler deploy      # bundles out/ + worker/index.ts, attaches custom domain
```

There is no test suite and no linter wired up. "Build" is the only
gate — `pnpm build` must succeed before `wrangler deploy`.

### Dev server / build quirks

- **First route hit after `pnpm dev` takes ~40s.** `web/.source/server.ts`
  has one import per MDX file (currently 216), so any route that calls
  `source.getPages()` pulls the whole corpus into its compile graph on
  cold start. Turbopack caches in `.next/cache/` across restarts —
  don't `rm -rf .next` casually; you'll pay the full compile again.
- **Known build flake**: `pnpm build` intermittently fails with
  `TypeError: Cannot read properties of null (reading 'useMemo')` at
  `Image` during prerender of a `freethestates.org` article (the
  specific article varies run-to-run). Pre-existing; not caused by
  the pages/ rename. If you see it, retry before assuming your change
  broke something.

## Architecture essentials

- **`pages/`** is the load-bearing artifact. Schema lives in the
  `Article` dataclass in `scripts/extract_articles.py` and is mirrored by
  `zod` in `web/source.config.ts`. Change both together.
- **Two consumers of `pages/`**, same source:
  1. Next.js static export (`web/`) → Fumadocs reads `../pages` directly
     via a widened `turbopack.root`. Deployed as Worker assets.
  2. `scripts/sync_to_r2.sh` → R2 bucket `abolition-kb` → Cloudflare AI
     Search instance `abolitionist-r2` (managed RAG: chunk/embed/store).
- **Worker** (`web/worker/index.ts`) owns only `POST /api/chat`, which
  calls `env.AI_SEARCH.chatCompletions(...)` via the service binding in
  `web/wrangler.jsonc` and streams SSE back. Everything else falls
  through to static assets. The AI Search public endpoint is
  deliberately unused — keep traffic behind the binding.
- **Search is two modes, not one**: keyword search is pre-built Orama
  (`web/app/api/search/route.ts` exports `staticGET`, `RootProvider`
  configures `search.options.type = 'static'`, ⌘K in the UI). Semantic
  Q&A is the chat box. Don't replace one with the other.
- **Sidebar** is custom (`web/lib/category-tree.ts`) — grouped by
  WordPress `categories` frontmatter, not Diataxis. Articles with
  multiple categories appear under each; sort is newest-first.
- **Citations mapping**: R2 key `freethestates.org/foo.md` → Fumadocs
  URL `/pages/freethestates.org/foo`. The `pages/` prefix is a UI
  concern added by the client; it's deliberately NOT baked into R2
  keys so the bucket layout stays stable if the URL moves again.

## Conventions for changes

- The `pages/` tree is committed but mostly machine-generated. Don't
  hand-edit `.md` files under `pages/<host>/` — change
  `scripts/extract_articles.py` and re-run. The `pages/journey/` subtree
  is the exception (authored MDX, not extracted).
- Extraction is idempotent and destructive — re-running
  `extract_articles.py` rewrites every file under `pages/<host>/`. Expect
  big but clean diffs; review them.
- `web/source.config.ts` restricts the Fumadocs collection to
  `*/*.{md,mdx}` so `pages/README.md` and `pages/index.json` are ignored.
  Keep that glob if you add new top-level files to `pages/`.
- Static export constraints: `images.unoptimized: true` is required;
  every runtime route must be `dynamic = 'force-static'` (see the search
  route). No server-side rendering paths — only the Worker handler.
- Deploys need these wrangler scopes (one-time
  `wrangler login --scopes ...`): `ai-search:write ai-search:run
  workers_scripts:write workers_routes:write zone:read account:read
  user:read`. Without routes+zone, code uploads but the custom-domain
  step fails.

## Day-2 refresh flow

1. Refresh site mirrors outside this repo (wget/HTTrack on the two WP sites).
2. `uv run scripts/extract_articles.py -v`
3. `bash scripts/sync_to_r2.sh` (AI Search re-indexes on its next scan;
   set `AI_SEARCH_INSTANCE=abolitionist-r2` plus
   `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` env vars to kick an
   immediate re-index job)
4. `cd web && pnpm build && wrangler deploy`
