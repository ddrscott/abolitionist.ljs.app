# Architecture

How this repo is wired together and **why**. Read this before adding new
sources, changing the search/chat backend, or rewiring the deployment.

## What this project is

A pipeline that turns two static WordPress site mirrors into a single
canonical Markdown corpus, plus a Fumadocs-powered preview site that
serves both keyword browsing and RAG-backed Q&A. The whole thing runs as
a single Cloudflare Worker at **abolitionist.ljs.app**. Every article and
every chat citation traces back to its original URL.

```
                       ┌──────────────────────────────────┐
                       │  ../abolitionistsrising.com/     │
                       │  ../freethestates.org/           │   raw HTTrack/wget
                       │  (HTML site mirrors, untracked)  │   mirrors of the
                       └────────────────┬─────────────────┘   live WP sites
                                        │
                       scripts/extract_articles.py            (uv inline deps:
                       (BeautifulSoup + markdownify)           BS4, markdownify,
                                        │                      lxml, PyYAML)
                                        ▼
                       ┌──────────────────────────────────┐
                       │  docs/                           │
                       │  ├─ <site>/<slug>.md   (×207)    │   ← canonical
                       │  ├─ README.md (human TOC)        │     knowledge base
                       │  └─ index.json (machine manifest)│
                       └────────────────┬─────────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  ▼                     ▼                     ▼
       ┌─────────────────┐   ┌────────────────────┐   ┌──────────────────┐
       │ next build →    │   │ scripts/           │   │ ad-hoc agents,   │
       │ web/out/        │   │ sync_to_r2.sh      │   │ scripts, etc.    │
       │ (static HTML +  │   │ (wrangler r2 put)  │   │ (read frontmatter│
       │  18 MB Orama    │   │                    │   │  + body directly)│
       │  search index)  │   │                    │   └──────────────────┘
       └────────┬────────┘   └─────────┬──────────┘
                │                      │
                │ wrangler deploy      ▼
                │             ┌──────────────────┐
                │             │ R2 bucket        │     auto-indexed by
                │             │ "abolition-kb"   ├───► Cloudflare AI Search
                │             └──────────────────┘     instance
                │                                      "abolitionist-r2"
                ▼                                              │
   ┌─────────────────────────────────────────────┐             │
   │ Cloudflare Worker  "abolitionist-kb"        │             │
   │   - serves the static Next.js export        │             │
   │     (catalog, articles, /api/search)        │             │
   │   - POST /api/chat → env.AI_SEARCH ─────────┼─────────────┘
   │     .chatCompletions(...) (Llama-3.3 70B)   │     service binding
   │   - custom domain abolitionist.ljs.app      │     (no public endpoint,
   └─────────────────────────────────────────────┘      no API token)
```

The `docs/` directory is the load-bearing artifact. The deploy pipeline
fans it into two destinations — Worker assets (for the website) and R2
(for the RAG indexer) — but both pull from the same source of truth.
Re-extraction is idempotent.

---

## Decisions

Each section is the *why* for a choice that's already in the codebase. If
you're considering changing one of these, read the rationale first.

### 1. Extract to Markdown + frontmatter, don't parse at runtime

**Choice.** `scripts/extract_articles.py` walks the HTML mirrors once and
writes one `.md` per article into `docs/<host>/<slug>.md` with rich YAML
frontmatter (title, source_url, source_post_id, dates, author, categories,
tags, excerpt, featured_image).

**Why.** The HTML mirrors are messy WordPress output (mixed Bricks Builder
and Cornerstone themes, lazy-loaded images, inline base64 fallbacks, two
different JSON-LD schemas). Parsing once into a clean canonical format means
every downstream consumer — Fumadocs, the future RAG indexer, any other
agent or product — works against the same predictable shape. Frontmatter
keys are stable; HTML quirks aren't. The extraction script is also
idempotent: rerun it after the mirrors update and you get the same output.

The trade is that `docs/` is committed to git (~27k lines) — but it's the
canonical artifact, the source mirrors aren't checked in, and Markdown
diffs cleanly enough that this isn't a real problem.

### 2. Fumadocs reads `../docs` directly with a widened Turbopack root

**Choice.** `web/source.config.ts` declares `defineDocs({ dir: '../docs' })`
and `web/next.config.mjs` sets `turbopack.root = <project root>` (one level
above `web/`) so Turbopack will bundle files from outside the Next.js app.

**Why.** The natural layout is the corpus at `docs/` and the Fumadocs app
at `web/` as siblings — the corpus serves more than just the website, and
nesting it inside `web/` would imply otherwise. By default Turbopack picks
a workspace root from the nearest lockfile (which on this machine landed at
`~/code/package-lock.json`, completely outside the repo) and refuses to
bundle files outside that root. Setting `turbopack.root` explicitly fixes
both: it pins the root to the project, *and* it widens it to include both
`web/` and `docs/`.

A symlink (`web/content/docs → ../docs`) was tried first and rejected —
Turbopack follows symlinks to their realpath, which expanded the workspace
the same way without making the dependency clear in `next.config.mjs`. The
explicit config is more honest.

### 3. Sidebar grouped by WordPress categories, not Diataxis

**Choice.** `web/lib/category-tree.ts` builds a custom `PageTree.Root` from
each article's `categories` frontmatter (with case-insensitive dedupe and
the WP "Uncategorized" placeholder filtered out). Articles with multiple
categories appear under each. Within a category, sort is newest-first.

**Why.** Diataxis is for technical documentation (tutorial / how-to /
reference / explanation) — forcing it onto an editorial advocacy corpus
would distort how the writers actually organized their work. The original
editors curated WordPress categories on every post; that's the truth of how
they think readers find things. We surface their taxonomy as-is rather than
imposing an outside framework.

The current sidebar has 43 categories with a long tail of 1-article tags
(mostly from abolitionistsrising.com's Yoast emitting `articleSection` as a
single comma-merged string mixing categories *and* tags — the extractor now
splits and dedupes, but you can't separate true categories from inflated
tags after the fact without retagging at the source).

### 4. Static Orama search alongside semantic chat — not either/or

**Choice.** `web/app/api/search/route.ts` exports `staticGET` (not `GET`)
from `createFromSource(source)`, marked `dynamic = 'force-static'`. The
client (`web/app/layout.tsx`) configures `RootProvider search.options.type
= 'static'` so it downloads the index from `/api/search` once and runs
queries in-browser via Orama. Triggered with ⌘K. The semantic chat
(decision #5) sits on top of this, not in place of it.

**Why.** Two complementary modes. Keyword search via Orama is the right
tool for "find me the exact phrase X" or "list every article tagged Y";
semantic chat is the right tool for "explain Z to me." The default
runtime `GET` handler would build an in-memory Orama index per
serverless-cold-start; `staticGET` emits the pre-built index as a single
JSON response cached at the CDN — zero runtime CPU.

The trade is index size: 207 articles in Orama's "advanced" (per-section)
format produces ~18 MB raw / ~5 MB gzipped. Acceptable here; bad if the
corpus grows 10×. If that happens, drop to "simple" mode (whole-page
records, ~1/4 the size) or rely on AI Search alone.

### 5. Cloudflare AI Search (managed RAG) for Q&A — chosen over DIY

**Choice.** `scripts/sync_to_r2.sh` uploads every `docs/<site>/<slug>.md`
into the R2 bucket `abolition-kb`. The Cloudflare AI Search instance
`abolitionist-r2` indexes that bucket automatically (chunk → embed via
Workers AI → store in Vectorize). The Worker calls
`env.AI_SEARCH.chatCompletions({ messages, stream: true, … })` to get a
streamed Llama-3.3-70B answer plus citation chunks identifying which
source files were retrieved. Citations carry `item.key` like
`freethestates.org/treat-sb13-not-secession.md`, which the client maps
1:1 to `/docs/freethestates.org/treat-sb13-not-secession`.

**Why managed over DIY.** A from-scratch Vectorize + Workers AI pipeline
is maybe 5× the code (custom chunker, embedder, retriever, prompt
template, citation formatter). AI Search ships all of that behind one
binding, and the Markdown corpus + frontmatter remains portable: if we
outgrow the managed product, swapping in a custom pipeline doesn't touch
`docs/`, the extractor, or the website.

### 6. Worker binding for AI Search — not the public endpoint

**Choice.** The Worker (`web/worker/index.ts`) talks to AI Search through
the `ai_search` service binding declared in `web/wrangler.jsonc`. The
browser only sees same-origin POSTs to `/api/chat`; the AI Search
instance ID, the model, and any retrieval tuning never leak to the client.

**Why.** AI Search has an optional **Public Endpoint** mode that lets the
browser call it directly (no Worker needed) at
`https://<uuid>.search.ai.cloudflare.com/chat/completions`. We
deliberately don't use it: every visitor query would hit the AI Search
instance directly, exposing the instance ID, making rate-limiting depend
on the dashboard, and pinning the response shape to whatever AI Search
emits. With the binding, the Worker is a thin facade — it adds the
system prompt, sets retrieval options, and can later add caching, auth,
or response shaping without any client change.

### 7. Static-export Next.js → Worker (with assets) — not Pages

**Choice.** `web/next.config.mjs` sets `output: 'export'` so `pnpm build`
produces a flat `web/out/` of HTML/CSS/JS. `wrangler deploy` ships that
directory plus the Worker code as a single Worker, with the custom
domain `abolitionist.ljs.app` declared via `routes` in `wrangler.jsonc`.

**Why over Pages.** Pages was tried first and worked, but attaching a
custom domain on Pages requires creating a CNAME DNS record separately
from the project deploy — and the OAuth scopes wrangler grants by
default don't include zone DNS write. Worker custom-domain claims, by
contrast, auto-create the proxied DNS record at deploy time when the
zone is on the same Cloudflare account. One `wrangler deploy` does
everything: bundle, upload assets, attach the domain, provision DNS,
provision the cert. It also keeps the chat route (`/api/chat`) and the
static site under one Worker — simpler than splitting between Pages and
a separate Worker for the API.

---

## What to read next

If you're going to touch the system, these are the files that matter:

- **`scripts/extract_articles.py`** — the extraction pipeline. The
  frontmatter schema is the `Article` dataclass (~line 75); add fields
  here when you need them. Taxonomy splitting/dedupe lives in
  `_normalize_taxonomy` and `classify_from_jsonld`.
- **`scripts/sync_to_r2.sh`** — pushes `docs/<site>/<slug>.md` files into
  the R2 bucket via `wrangler r2 object put` with `xargs -P 8`. Re-run
  this after `extract_articles.py` to refresh what AI Search indexes.
- **`web/source.config.ts`** — Fumadocs collection config. The
  `files: ['*/*.md']` glob excludes the auto-generated `docs/README.md`
  and `docs/index.json`. The `articleSchema` mirrors the extractor's
  frontmatter via `zod`.
- **`web/wrangler.jsonc`** — single source of truth for the deploy:
  Worker name, AI Search binding, asset directory, custom domain route.
  Decisions #5/#6/#7 all live here in some form.
- **`web/worker/index.ts`** — the chat handler. Owns POST `/api/chat`,
  builds the messages list (with system prompt), calls
  `env.AI_SEARCH.chatCompletions(...)` and pipes the SSE response
  straight to the browser. Everything else falls through to assets.
- **`web/components/chat-box.tsx`** — the homepage chat UI. Parses the
  AI Search SSE stream (`event: chunks` for citations + OpenAI-shape
  token deltas) and renders citation chips that resolve to
  `/docs/<site>/<slug>`.
- **`web/next.config.mjs`** — `turbopack.root` (decision #2),
  `output: 'export'` (decision #7), `images.unoptimized` (required by
  the static export), `images.remotePatterns` (article-body images from
  the original WP hosts).
- **`web/lib/category-tree.ts`** — the custom sidebar. Sort order,
  grouping rules, and the "All Articles" link live here.
- **`web/app/api/search/route.ts`** + **`web/app/layout.tsx`** — the
  static-Orama wiring (decision #4). Server-side `staticGET` and
  client-side `RootProvider search.options.type = 'static'` are the two
  ends of the same configuration; change them together or not at all.
- **`docs/index.json`** — machine-readable manifest of every article
  with its full frontmatter. Useful for any non-Fumadocs consumer.
- **`README.md`** — surface-level project orientation; defers to this
  doc for the "why."

## Day-2 ops

- **Refreshing the corpus**: re-run the source-mirror download outside
  this repo, then `uv run scripts/extract_articles.py -v` (writes to
  `docs/`), then `bash scripts/sync_to_r2.sh` (uploads to R2; AI Search
  picks up the changes on its next sync), then `pnpm build && wrangler
  deploy` from `web/` to update the static site.
- **Tuning chat behavior**: edit `SYSTEM_PROMPT` in
  `web/worker/index.ts`, or pass different `ai_search_options` (e.g.
  `retrieval.max_num_results`, `query_rewrite.enabled`) to
  `chatCompletions(...)`. Re-deploy the Worker only — no rebuild needed.
- **Required wrangler scopes** (one-time `wrangler login --scopes ...`):
  `ai-search:write ai-search:run workers_scripts:write
  workers_routes:write zone:read account:read user:read`. Without
  `workers_routes:write` + `zone:read`, deploys still upload code but
  the route-update step prints a red error.
