# Architecture

How this repo is wired together and **why**. Read this before adding new
sources, swapping the search backend, or wiring the planned chatbot.

## What this project is

A pipeline that turns two static WordPress site mirrors into a single
canonical Markdown corpus, plus a Fumadocs-powered preview site for human
browsing. The corpus is meant to be the substrate for downstream products —
search, RAG-backed Q&A, agent context — with every article traceable back to
its original URL.

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
                       │  ├─ <site>/<slug>.md   (×207)    │   ← the canonical
                       │  ├─ README.md (human TOC)        │     knowledge base
                       │  └─ index.json (machine manifest)│
                       └────────────────┬─────────────────┘
                                        │
              ┌─────────────────────────┴────────────────────────┐
              ▼                                                  ▼
    ┌──────────────────────┐                      ┌──────────────────────────┐
    │  web/  (Fumadocs)    │                      │  Cloudflare AutoRAG      │
    │  Next.js 16 preview  │                      │  (planned, not built)    │
    │  + static Orama      │                      │  R2 → Vectorize →        │
    │  search at           │                      │  Workers AI Q&A with     │
    │  /api/search         │                      │  citations back to       │
    │                      │                      │  /docs/<site>/<slug>     │
    └──────────────────────┘                      └──────────────────────────┘
```

The `docs/` directory is the load-bearing artifact: both the preview site
and the future RAG pipeline read from it. Re-extraction is idempotent.

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

### 4. Static Orama search, not per-request indexing

**Choice.** `web/app/api/search/route.ts` exports `staticGET` (not `GET`)
from `createFromSource(source)`, marked `dynamic = 'force-static'`. The
client (`web/app/layout.tsx`) configures `RootProvider search.options.type
= 'static'` so it downloads the index from `/api/search` once and runs
queries in-browser via Orama.

**Why.** The default `GET` handler builds an in-memory Orama index lazily
inside whichever Node process serves `/api/search`. Cheap on a long-lived
server; expensive in a serverless-cold-start world. `staticGET` emits the
pre-built index as a single JSON response that's cacheable at the CDN, eats
zero runtime CPU, and works under `next build` static export.

The trade is index size: 207 articles in Orama's "advanced" (per-section)
format produces ~18 MB raw / ~5 MB gzipped. Acceptable for this corpus
(comparable to a video clip), bad if the corpus grows 10×. If that
happens, drop to "simple" mode (whole-page records, ~1/4 the size) or
switch to the planned semantic search via Cloudflare Vectorize anyway.

### 5. Cloudflare AutoRAG is the intended next step for Q&A

**Choice.** Not built yet. The plan is to push `docs/*/*.md` to a
Cloudflare R2 bucket and let AutoRAG handle ingestion → chunking →
embedding (Workers AI) → storage (Vectorize) → Q&A endpoint with citations.
The frontmatter `source_url` and `source_post_id` are the citation anchors.

**Why.** A Q&A chatbox needs *semantic* retrieval — keyword match (Orama)
finds articles containing the question's exact words, not articles whose
*meaning* answers it. AutoRAG bundles the whole RAG stack (chunk + embed +
retrieve + generate + cite) behind one managed endpoint, so we get an
end-to-end MVP without writing a chunker, an embedder, or a prompt
template. If we outgrow it (custom chunking strategy, custom prompt format,
multi-tenant isolation), the corpus is portable to a DIY Vectorize +
Workers AI stack — the Markdown files don't change.

The static Orama index stays useful as a keyword fallback ("find the exact
phrase") even after the chatbot ships.

---

## Open decisions

These two haven't been made and shouldn't be pre-decided here:

### AutoRAG vs DIY (Vectorize + Workers AI)

- **AutoRAG** — managed, one R2 bucket + one binding; less control over
  chunking, prompt, and ranking. Beta as of writing.
- **DIY** — explicit pipeline (R2 → ingestion worker → embed via Workers AI
  → upsert into Vectorize → query worker → LLM call → cite). ~5× the code
  but full control. AI Gateway can layer in caching + observability.

The recommendation in the conversation that produced this doc was to start
with AutoRAG to validate the experience and migrate later if needed. The
Markdown corpus + frontmatter is the same input either way.

### Where the chatbox lives

- **Embedded widget** in the Fumadocs site (a floating "Ask the archive"
  button), so the chat happens alongside the article you're reading.
- **Dedicated `/chat` route**, full-page, more screen real estate for the
  conversation + citations.
- **Both.**

No strong reason yet to pick one; depends on how readers actually want to
use it.

---

## What to read next

If you're going to touch the system, these are the files that matter:

- **`scripts/extract_articles.py`** — the whole extraction pipeline. The
  frontmatter schema is defined by the `Article` dataclass (~line 75); add
  fields here when you need them. The taxonomy splitting/dedupe lives in
  `_normalize_taxonomy` and `classify_from_jsonld`.
- **`web/source.config.ts`** — Fumadocs collection config. The `files:
  ['*/*.md']` glob is what excludes the auto-generated `docs/README.md`
  and `docs/index.json`. The `articleSchema` here mirrors the extractor's
  frontmatter via `zod`.
- **`web/next.config.mjs`** — `turbopack.root` (decision #2),
  `images.remotePatterns` (so article-body images served from the
  original WP hosts work).
- **`web/lib/category-tree.ts`** — the custom sidebar. Sort order, grouping
  rules, and the "All Articles" link live here.
- **`web/app/api/search/route.ts`** + **`web/app/layout.tsx`** — the
  static-Orama wiring (decision #4). Server-side `staticGET` and
  client-side `RootProvider search.options.type = 'static'` are the two
  ends of the same configuration; change them together or not at all.
- **`docs/index.json`** — the machine-readable manifest of every article
  with its full frontmatter. Useful for any non-Fumadocs consumer (the
  future RAG ingestion script will read this to know what to push to R2).
- **`README.md`** — surface-level project orientation; defers to this doc
  for the "why."
