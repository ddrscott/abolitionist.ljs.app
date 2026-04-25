# abolitionist.ljs.app — "Ask the Abolitionist"

Site-facing brand: **Ask the Abolitionist**. The site is a research
tool for abolitionists doing street dialog and for lay-people hearing
about the movement for the first time. Under the hood it's a content
pipeline derived from two abolitionist WordPress sites:

- [`abolitionistsrising.com`](https://abolitionistsrising.com)
- [`freethestates.org`](https://freethestates.org)

The pipeline extracts both sites into Markdown under `pages/`,
Fumadocs renders them, and a Cloudflare AI Search binding answers
chat questions with citations back to the source. Every article
carries a `source_url` and `source_post_id` so any derived artifact
(search index, chat citation, AI embedding) can be traced to origin.

> **Why is the system built this way?** See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
> for the design decisions, the data flow diagram, and the open questions
> (Cloudflare AutoRAG vs DIY, where the chatbot lives, etc.).

## Layout

```
pages/                 # public content corpus (rendered as the site)
  README.md            # human-browsable TOC, newest first per site
  index.json           # machine-readable manifest (every article + metadata)
  abolitionistsrising.com/<slug>.md
  freethestates.org/<slug>.md
  journey/             # authored reader-journey MDX
docs/                  # project / developer docs (this is where ARCHITECTURE.md lives)
scripts/
  extract_articles.py  # extracts ./pages from the raw site mirrors
```

The site mirrors themselves are siblings of this repo (e.g.
`../abolitionistsrising.com/` and `../freethestates.org/`) and are not
checked in.

## Extracting / refreshing `pages/`

`extract_articles.py` is a self-contained `uv` script (deps declared inline):

```sh
# default: extract from ../abolitionistsrising.com and ../freethestates.org
uv run scripts/extract_articles.py -v

# or point it at any WordPress static-site mirror
uv run scripts/extract_articles.py --site ../some-other-site -v
```

The script is idempotent: rerunning blows away and rewrites every file under
`pages/<host>/`. Articles reachable via multiple paths (slug folder + `?p=NNN`
permalink) are deduplicated by canonical URL.

### What counts as an "article"

Files are extracted when:

1. their `index.html` contains an `article:published_time` meta tag
   (excludes archive listings, feeds, and admin pages), and
2. their canonical URL slug is not on the small `NOISE_SLUGS` list
   (`blog`, `feed`, `donate`, `donor-dashboard`, `calendar`, `petition`,
   `contact`, `register`, `comments`, `wp-login.php`, `good-news`).

Both WordPress posts (`type-post`) and content pages (`type-page`) are
extracted; `content_type` in the frontmatter records which.

### Frontmatter schema

```yaml
title: ...                  # cleaned of " - Site Name" suffix
slug: ...                   # last path segment of canonical URL
source_url: https://...     # canonical URL on the original site
source_site: host.example
source_path: ../host/...    # path of the source HTML, relative to project root
content_type: post | page
published: 2020-01-30T08:00:55+00:00
modified: 2020-11-24T16:33:48+00:00
author: ...                 # optional
author_url: ...             # optional
categories: [...]           # optional
tags: [...]                 # optional
reading_time_minutes: 24    # optional, from Yoast meta
featured_image: https://... # optional, absolutized to host
excerpt: ...                # optional, from og:description
source_post_id: 2413        # optional, WordPress post ID
```

## Sources

The mirrors are static-site exports (HTTrack/wget). The script handles two
distinct WordPress themes:

- **Free The States** uses a classic theme with `<article id="post-NNNN">`
  and `<div class="entry-content">`.
- **Abolitionists Rising** uses [Bricks Builder](https://bricksbuilder.io/);
  posts have `<div class="brxe-post-content">`, pages use `<main id="brx-content">`.

Both expose Yoast SEO JSON-LD, which is the primary metadata source.

## License and attribution

The source code in this repository is released under the [MIT License](./LICENSE)
— extraction scripts, the Astro web app, the Cloudflare Worker, build tooling,
and the authored MDX under `pages/journey/` and `pages/legal/`.

The MIT license **does not** apply to article content drawn from
`abolitionistsrising.com` or `freethestates.org`. Those writings remain the
copyright of their respective authors and publishers. This repository
intentionally excludes the extracted article corpus from version control
(see `.gitignore`); regenerate it locally by running the extraction pipeline
against your own mirrors of the two sites.

Ask the Abolitionist is an independent project produced by
[askscottpierce.com](https://askscottpierce.com) and
[Left Join Studio](https://leftjoinstudio.com). It is not a product of,
nor endorsed by, the two source publications.
