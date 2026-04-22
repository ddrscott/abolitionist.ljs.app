#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "beautifulsoup4>=4.12",
#     "lxml>=5.2",
#     "markdownify>=0.13",
#     "PyYAML>=6.0",
# ]
# ///
"""
Extract WordPress site mirrors into Markdown + frontmatter for Fumadocs.

Discovers articles in one or more WordPress static-site mirrors (e.g.
HTTrack/wget output) and emits one Markdown file per article into ./docs,
plus an index.json manifest for cross-referencing back to source material.

Usage:

    ./scripts/extract_articles.py                          # default sources
    ./scripts/extract_articles.py --site ../mysite.com     # custom source
    ./scripts/extract_articles.py --out docs --verbose

Each source must be a directory containing a `wp-content/` (i.e. a
WordPress mirror). For each article-bearing `index.html` we emit:

    docs/<host>/<slug>.md

with YAML frontmatter:

    ---
    title:           "..."
    slug:            "..."
    source_url:      "https://..."
    source_site:     "host.example"
    source_post_id:  1234
    source_path:     "relative/path/index.html"
    published:       "2020-01-30T08:00:55+00:00"
    modified:        "2020-11-24T16:33:48+00:00"
    author:          "..."
    categories:      [...]
    tags:            [...]
    reading_time_minutes: 24
    featured_image:  "https://..."
    excerpt:         "..."
    ---

The script is idempotent: re-running overwrites previous output. Articles
reachable via multiple paths (e.g. /slug/ AND /index.html?p=NNN) are
deduplicated by canonical og:url.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse

import yaml
from bs4 import BeautifulSoup, Tag
from markdownify import MarkdownConverter

log = logging.getLogger("extract_articles")

# Default sources, relative to this script's parent's parent.
DEFAULT_SITES = ["../abolitionistsrising.com", "../freethestates.org"]

# Strip rules ----------------------------------------------------------------
# Tags/classes/ids commonly added by WP themes that aren't part of the
# canonical article body. We strip these from the body before conversion.

STRIP_TAGS = ("script", "style", "noscript", "iframe", "form", "svg")
STRIP_CLASS_PATTERNS = (
    re.compile(r"\bsharedaddy\b"),
    re.compile(r"\bjp-relatedposts\b"),
    re.compile(r"\bsocial-share"),
    re.compile(r"\bgive-form-wrap\b"),  # GiveWP donation widgets
    re.compile(r"\bwp-block-buttons?\b"),  # CTA buttons (often donate)
    re.compile(r"\bcomment-respond\b"),
    re.compile(r"\bcomments-area\b"),
    re.compile(r"\bnav-links\b"),
    re.compile(r"\bpost-navigation\b"),
    re.compile(r"\brelated-posts?\b"),
)

# Identifies an article-shaped index.html. We require article:published_time
# because it eliminates archive listings (category, tag, blog index, feeds).
PUBLISHED_RE = re.compile(
    r'<meta[^>]*\bproperty=["\']article:published_time["\']', re.I
)


# ---------------------------------------------------------------------------
# Data model

@dataclass
class Article:
    title: str
    slug: str
    source_url: str
    source_site: str
    source_path: str           # relative to project root
    content_type: str = "post"  # "post" or "page" (WP post_type)
    published: str | None = None
    modified: str | None = None
    author: str | None = None
    author_url: str | None = None
    categories: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    reading_time_minutes: int | None = None
    featured_image: str | None = None
    excerpt: str | None = None
    source_post_id: int | None = None
    body_markdown: str = ""

    def output_relpath(self) -> Path:
        return Path(self.source_site) / f"{self.slug}.md"

    def frontmatter(self) -> dict[str, Any]:
        # Excludes body and any None fields.
        d = asdict(self)
        d.pop("body_markdown")
        return {k: v for k, v in d.items() if v not in (None, [], "")}


# ---------------------------------------------------------------------------
# HTML helpers

def soup_of(path: Path) -> BeautifulSoup:
    html = path.read_bytes()
    # lxml is faster and more forgiving for the messy WP markup.
    return BeautifulSoup(html, "lxml")


def meta_content(soup: BeautifulSoup, **attrs: str) -> str | None:
    tag = soup.find("meta", attrs=attrs)
    if isinstance(tag, Tag):
        v = tag.get("content")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def meta_by_label(soup: BeautifulSoup, label: str) -> str | None:
    """Return content for twitter:dataN whose paired twitter:labelN matches."""
    for label_tag in soup.find_all("meta", attrs={"name": re.compile(r"twitter:label\d+")}):
        if not isinstance(label_tag, Tag):
            continue
        content = label_tag.get("content")
        if not isinstance(content, str) or content.strip().lower() != label.lower():
            continue
        name = label_tag.get("name")
        if not isinstance(name, str):
            continue
        n = name.replace("twitter:label", "")
        data_tag = soup.find("meta", attrs={"name": f"twitter:data{n}"})
        if isinstance(data_tag, Tag):
            v = data_tag.get("content")
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def jsonld_blocks(soup: BeautifulSoup) -> list[Any]:
    out: list[Any] = []
    for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = s.string or s.get_text() or ""
        text = text.strip()
        if not text:
            continue
        try:
            out.append(json.loads(text))
        except json.JSONDecodeError:
            # Some WP themes emit invalid JSON-LD; skip silently.
            continue
    return out


def jsonld_walk(blocks: Iterable[Any]):
    """Yield every dict node in a list/dict tree of JSON-LD payloads."""
    stack: list[Any] = list(blocks)
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            yield node
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)


def jsonld_canonical_url(blocks: Iterable[Any]) -> str | None:
    """Find the canonical page URL inside JSON-LD blocks.

    Prefers @type=WebPage.url, then BlogPosting.mainEntityOfPage,
    then any @id that looks like a normal http(s) page URL.
    """
    webpage_url: str | None = None
    article_url: str | None = None
    for node in jsonld_walk(blocks):
        if not isinstance(node, dict):
            continue
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        if "WebPage" in types and isinstance(node.get("url"), str):
            webpage_url = node["url"]
        if any(x in types for x in ("Article", "BlogPosting", "NewsArticle")):
            mep = node.get("mainEntityOfPage")
            if isinstance(mep, dict) and isinstance(mep.get("@id"), str):
                article_url = mep["@id"]
            elif isinstance(mep, str):
                article_url = mep
    return webpage_url or article_url


def derive_url_from_path(html_path: Path, site_root: Path, host: str) -> str:
    """Synthesize https://<host>/<rel-path>/ from filesystem location."""
    try:
        rel = html_path.relative_to(site_root)
    except ValueError:
        rel = Path(html_path.name)
    parts = [p for p in rel.parts if p != "index.html"]
    # Preserve `?p=NNN` query-string permalinks as-is.
    last = parts[-1] if parts else ""
    if last.startswith("index.html?"):
        parts = parts[:-1] + [last]
        return f"https://{host}/" + "/".join(parts)
    path = "/".join(parts)
    if path:
        path = path + "/"
    return f"https://{host}/{path}"


def site_name(soup: BeautifulSoup) -> str | None:
    return meta_content(soup, property="og:site_name")


def strip_site_suffix(title: str, site: str | None) -> str:
    """Remove " - Site Name" / " | Site Name" boilerplate from page titles.

    Some sites set og:site_name to a long tagline (e.g.
    "Abolitionists Rising - Abolish Abortion for the Glory of God") but
    suffix titles with only the leading segment, so we test both.
    """
    if not site:
        return title
    candidates = {site}
    for sep in (" - ", " | ", " – "):
        if sep in site:
            candidates.add(site.split(sep, 1)[0].strip())
    for sep in (" - ", " | ", " – "):
        for candidate in candidates:
            suffix = f"{sep}{candidate}"
            if title.endswith(suffix):
                return title[: -len(suffix)].strip()
    return title


# ---------------------------------------------------------------------------
# Body extraction & cleanup

def find_article_body(soup: BeautifulSoup) -> Tag | None:
    """Locate the canonical article body element across both site templates."""
    # 1. Bricks Builder posts (abolitionistsrising posts)
    body = soup.select_one("div.brxe-post-content")
    if body:
        return body

    # 2. Classic theme entry-content (freethestates posts/pages)
    body = soup.select_one("div.entry-content")
    if body:
        return body

    # 3. Bricks pages: collect everything inside <main id="brx-content">,
    #    minus header/footer/nav. Wrap in a synthetic <div> so the caller
    #    can treat it uniformly.
    main = soup.select_one("main#brx-content")
    if main:
        return main

    return None


def strip_noise(body: Tag) -> None:
    """Remove decorative, navigational, and CTA chrome from the body."""
    for tag in body.find_all(STRIP_TAGS):
        tag.decompose()
    for el in list(body.find_all(True)):
        cls = " ".join(el.get("class") or [])
        if any(p.search(cls) for p in STRIP_CLASS_PATTERNS):
            el.decompose()
            continue
        # Replace lazy-load placeholders with the real source, and strip
        # inline data: URIs entirely — markdownify would emit them verbatim
        # and an MDX bundler would try to resolve them as relative imports.
        if el.name == "img":
            real = el.get("data-src") or el.get("data-lazy-src")
            if real:
                el["src"] = real
            src = el.get("src")
            if isinstance(src, str) and src.startswith("data:"):
                el.decompose()


def absolutize_urls(body: Tag, base_url: str) -> None:
    """Rewrite relative href/src to absolute URLs against *base_url*.

    Static-site mirrors rewrite asset and link URLs to filesystem-relative
    paths (e.g. `../../../wp-content/uploads/...`). For a knowledge base
    that's served online, we want the original absolute URLs so images
    load and links keep working.
    """
    for el in body.find_all(["a", "img"]):
        for attr in ("href", "src"):
            v = el.get(attr)
            if not isinstance(v, str) or not v:
                continue
            if v.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:")):
                continue
            el[attr] = urljoin(base_url, v)


def absolutize(url: str | None, base_url: str) -> str | None:
    if not url:
        return url
    if url.startswith(("http://", "https://", "data:")):
        return url
    return urljoin(base_url, url)


class CleanConverter(MarkdownConverter):
    """Markdownify with sensible defaults for WordPress article bodies."""

    def convert_a(self, el, text, parent_tags):
        # Drop empty anchors (often used for image links to the same image).
        if not text.strip():
            return ""
        return super().convert_a(el, text, parent_tags)


def to_markdown(body: Tag) -> str:
    md = CleanConverter(
        heading_style="ATX",
        bullets="-",
        code_language="",
        strip=["script", "style"],
    ).convert_soup(body)
    # Collapse runs of >2 blank lines.
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"
    return md


# ---------------------------------------------------------------------------
# Categorization helpers

def classify_from_article_class(soup: BeautifulSoup) -> tuple[list[str], list[str]]:
    """Pull category-* and tag-* slugs from <article class="...">."""
    article = soup.find("article")
    if not isinstance(article, Tag):
        return [], []
    classes = article.get("class") or []
    categories = [c[len("category-") :] for c in classes if c.startswith("category-")]
    tags = [c[len("tag-") :] for c in classes if c.startswith("tag-")]
    return _normalize_taxonomy(categories), _normalize_taxonomy(tags)


def classify_from_jsonld(blocks: Iterable[Any]) -> tuple[list[str], list[str]]:
    cats: list[str] = []
    tags: list[str] = []
    for node in jsonld_walk(blocks):
        if not isinstance(node, dict):
            continue
        # Yoast on some sites (e.g. abolitionistsrising.com) emits
        # articleSection as a single comma-joined string mixing categories
        # and tags. Split on commas so each surfaces individually.
        for k in ("articleSection",):
            v = node.get(k)
            if isinstance(v, str):
                cats.extend(t.strip() for t in v.split(",") if t.strip())
            elif isinstance(v, list):
                cats.extend(x.strip() for x in v if isinstance(x, str) and x.strip())
        for k in ("keywords",):
            v = node.get(k)
            if isinstance(v, str):
                tags.extend(t.strip() for t in v.split(",") if t.strip())
            elif isinstance(v, list):
                tags.extend(x.strip() for x in v if isinstance(x, str) and x.strip())
    return _normalize_taxonomy(cats), _normalize_taxonomy(tags)


def _normalize_taxonomy(items: Iterable[str]) -> list[str]:
    """Dedupe case-insensitively (preserving first-seen casing) and drop
    the WordPress default "Uncategorized" placeholder, which is noise."""
    seen: dict[str, str] = {}
    for raw in items:
        cleaned = raw.strip()
        if not cleaned or cleaned.lower() == "uncategorized":
            continue
        key = cleaned.lower()
        if key not in seen:
            seen[key] = cleaned
    return list(seen.values())


# ---------------------------------------------------------------------------
# Per-article extraction

POST_ID_RE = re.compile(r"\bpost-(\d+)\b")

# Slugs that match WP utility/listing pages, not editorial content.
# Detected via the canonical URL path; safe-by-default exclusions.
NOISE_SLUGS = {
    "blog",
    "feed",
    "donate",
    "donor-dashboard",
    "calendar",
    "petition",
    "contact",
    "register",
    "comments",
    "wp-login.php",
    "good-news",  # event aggregator, not a single article
}


def extract_content_type(soup: BeautifulSoup) -> str:
    """Detect WP `type-page` vs `type-post` from the article tag's classes."""
    article = soup.find("article")
    if isinstance(article, Tag):
        classes = article.get("class") or []
        if "type-page" in classes:
            return "page"
        if "type-post" in classes:
            return "post"
    # Bricks Builder theme: pages don't have <article>, infer from structure.
    if soup.select_one("div.brxe-post-content"):
        return "post"
    if soup.select_one("main#brx-content"):
        return "page"
    return "post"


def extract_post_id(soup: BeautifulSoup) -> int | None:
    for el in soup.find_all(id=re.compile(r"^post-\d+$")):
        m = POST_ID_RE.match(el.get("id", ""))
        if m:
            return int(m.group(1))
    article = soup.find("article")
    if isinstance(article, Tag):
        for c in article.get("class") or []:
            m = POST_ID_RE.match(c)
            if m:
                return int(m.group(1))
    return None


def extract_author(soup: BeautifulSoup, blocks: list[Any]) -> tuple[str | None, str | None]:
    # JSON-LD Person is the most reliable.
    for node in jsonld_walk(blocks):
        if isinstance(node, dict) and node.get("@type") == "Person":
            name = node.get("name")
            url = node.get("url")
            if isinstance(name, str):
                return name, url if isinstance(url, str) else None
    # Twitter card fallback.
    name = meta_by_label(soup, "Written by")
    if name:
        return name, None
    # Vcard fallback.
    a = soup.select_one(".author.vcard a, a.url.fn.n, .byline a")
    if isinstance(a, Tag) and a.get_text(strip=True):
        href = a.get("href")
        return a.get_text(strip=True), href if isinstance(href, str) else None
    return None, None


def extract_reading_time(soup: BeautifulSoup) -> int | None:
    raw = meta_by_label(soup, "Est. reading time")
    if not raw:
        return None
    m = re.search(r"(\d+)", raw)
    return int(m.group(1)) if m else None


def extract_featured_image(soup: BeautifulSoup) -> str | None:
    return meta_content(soup, property="og:image")


def extract_excerpt(soup: BeautifulSoup) -> str | None:
    desc = meta_content(soup, property="og:description") or meta_content(
        soup, name="description"
    )
    if not desc:
        return None
    # Yoast emits "... Read More" stubs; trim them.
    desc = re.sub(r"\s*\.{3,}\s*Read More\s*$", "", desc).strip()
    return desc or None


def relative_to(root: Path, p: Path) -> str:
    """Path of *p* relative to *root*, allowing `..` traversal.

    Path.relative_to() refuses to walk upwards, but our source mirrors
    are usually siblings of the project root, so a "../site/..." form
    is the natural answer.
    """
    return os.path.relpath(p, root)


def extract_one(
    html_path: Path, site_root: Path, project_root: Path
) -> Article | None:
    soup = soup_of(html_path)
    blocks = jsonld_blocks(soup)

    # Static-site downloaders (HTTrack / wget --convert-links) often rewrite
    # og:url and rel=canonical to relative paths. JSON-LD is more reliable;
    # fall back to inferring the URL from the file's filesystem location.
    host = site_root.name
    canonical = jsonld_canonical_url(blocks)
    if not canonical or not canonical.startswith(("http://", "https://")):
        og = meta_content(soup, property="og:url")
        if og and og.startswith(("http://", "https://")):
            canonical = og
        else:
            canonical = derive_url_from_path(html_path, site_root, host)

    parsed = urlparse(canonical)
    if parsed.netloc:
        host = parsed.netloc
    # Slug = last non-empty path segment of canonical URL.
    segments = [s for s in parsed.path.split("/") if s]
    if not segments:
        log.debug("skip (homepage / no path): %s", html_path)
        return None
    slug = segments[-1]
    # Strip query-string permalink artefacts ("index.html?p=1234").
    if slug.startswith("index.html?"):
        log.debug("skip (query-string permalink): %s", html_path)
        return None
    if slug in NOISE_SLUGS:
        log.debug("skip (noise slug %r): %s", slug, html_path)
        return None

    site = site_name(soup)
    raw_title = meta_content(soup, property="og:title") or (soup.title.get_text(strip=True) if soup.title else "")
    title = strip_site_suffix(raw_title, site).strip()
    if not title:
        log.debug("skip (no title): %s", html_path)
        return None

    cats, tags = classify_from_jsonld(blocks)
    if not cats and not tags:
        cats, tags = classify_from_article_class(soup)

    author, author_url = extract_author(soup, blocks)

    body_el = find_article_body(soup)
    if body_el is None:
        log.warning("no body element found: %s", html_path)
        body_md = ""
    else:
        strip_noise(body_el)
        absolutize_urls(body_el, canonical)
        body_md = to_markdown(body_el)

    return Article(
        title=title,
        slug=slug,
        source_url=canonical,
        source_site=host,
        source_path=relative_to(project_root, html_path),
        content_type=extract_content_type(soup),
        published=meta_content(soup, property="article:published_time"),
        modified=meta_content(soup, property="article:modified_time"),
        author=author,
        author_url=author_url,
        categories=cats,
        tags=tags,
        reading_time_minutes=extract_reading_time(soup),
        featured_image=absolutize(extract_featured_image(soup), canonical),
        excerpt=extract_excerpt(soup),
        source_post_id=extract_post_id(soup),
        body_markdown=body_md,
    )


# ---------------------------------------------------------------------------
# Discovery

# Directories whose contents are never article bodies.
SKIP_DIR_NAMES = {
    "wp-admin",
    "wp-content",
    "wp-includes",
    "wp-json",
    "cdn-cgi",
    "feed",
    "comments",
    "category",
    "tag",
    "author",
    "page",
    "amp",
}


def is_article_html(path: Path) -> bool:
    """Cheap pre-check before parsing: must contain article:published_time."""
    try:
        with path.open("rb") as fh:
            # Read enough to cover <head>.
            head = fh.read(64 * 1024)
        return bool(PUBLISHED_RE.search(head.decode("utf-8", errors="ignore")))
    except OSError:
        return False


def discover(site_root: Path) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(site_root):
        # Prune obvious non-article directories.
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
        if "index.html" in filenames:
            yield Path(dirpath) / "index.html"
        # Also include `index.html?p=NNN` style files at site root: they are
        # query-string permalinks for posts. We dedupe later via canonical URL.
        for fn in filenames:
            if fn.startswith("index.html?p="):
                yield Path(dirpath) / fn


# ---------------------------------------------------------------------------
# Output

def write_article(article: Article, out_root: Path) -> Path:
    target = out_root / article.output_relpath()
    target.parent.mkdir(parents=True, exist_ok=True)

    fm = yaml.safe_dump(
        article.frontmatter(),
        sort_keys=False,
        allow_unicode=True,
        width=10_000,  # avoid YAML line-wrapping inside titles/excerpts
        default_flow_style=False,
    )
    target.write_text(f"---\n{fm}---\n\n{article.body_markdown}", encoding="utf-8")
    return target


def write_index(articles: list[Article], out_root: Path) -> Path:
    out_root.mkdir(parents=True, exist_ok=True)
    sorted_articles = sorted(
        articles, key=lambda x: (x.source_site, x.published or "")
    )
    manifest = {
        "count": len(articles),
        "articles": [
            {
                **{k: v for k, v in a.frontmatter().items()},
                "local_path": str(a.output_relpath()),
            }
            for a in sorted_articles
        ],
    }
    target = out_root / "index.json"
    target.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    write_readme(sorted_articles, out_root)
    return target


def write_readme(articles: list[Article], out_root: Path) -> Path:
    """Emit a human-browsable Markdown index of every extracted article."""
    by_site: dict[str, list[Article]] = {}
    for a in articles:
        by_site.setdefault(a.source_site, []).append(a)

    lines: list[str] = ["# Knowledge Base", ""]
    lines.append(f"Total articles: **{len(articles)}**\n")
    lines.append(
        "Generated by `scripts/extract_articles.py`. "
        "Each article links back to its original source URL via the `source_url` "
        "frontmatter field; rerun the script to regenerate this directory.\n"
    )
    for site, items in sorted(by_site.items()):
        lines.append(f"## {site}")
        lines.append(f"_{len(items)} articles_\n")
        # Newest first within each site.
        for a in sorted(items, key=lambda x: x.published or "", reverse=True):
            date = (a.published or "")[:10]
            author = f" — _{a.author}_" if a.author else ""
            lines.append(
                f"- `{date}` [{a.title}]({a.output_relpath()}){author}  \n"
                f"  [source]({a.source_url})"
            )
        lines.append("")

    target = out_root / "README.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    return target


# ---------------------------------------------------------------------------
# Driver

def run(site_roots: list[Path], out_root: Path, project_root: Path) -> int:
    out_root.mkdir(parents=True, exist_ok=True)

    # Pair each candidate with its site root so we can derive canonical URLs
    # from the filesystem path when og:url has been rewritten.
    found: list[tuple[Path, Path]] = []
    for root in site_roots:
        if not root.is_dir():
            log.error("site root not found: %s", root)
            continue
        for p in discover(root):
            if is_article_html(p):
                found.append((p, root))

    log.info("candidate files: %d", len(found))

    # Deduplicate by canonical URL: prefer slug-folder paths over `?p=NNN`.
    by_url: dict[str, Article] = {}
    parsed_count = 0
    for path, root in found:
        try:
            article = extract_one(path, root, project_root)
        except Exception as exc:
            log.exception("failed to parse %s: %s", path, exc)
            continue
        if article is None:
            continue
        parsed_count += 1
        existing = by_url.get(article.source_url)
        if existing is None:
            by_url[article.source_url] = article
            continue
        # Prefer the path that doesn't contain '?p=' (i.e. canonical slug folder).
        if "?p=" in existing.source_path and "?p=" not in article.source_path:
            by_url[article.source_url] = article

    articles = list(by_url.values())
    log.info("unique articles: %d (parsed %d)", len(articles), parsed_count)

    for a in articles:
        path = write_article(a, out_root)
        log.debug("wrote %s", path)

    index_path = write_index(articles, out_root)
    log.info("wrote manifest: %s", index_path)
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--site",
        action="append",
        default=None,
        help="path to a WordPress site mirror (repeatable). "
        f"Defaults to: {DEFAULT_SITES}",
    )
    parser.add_argument(
        "--out",
        default="docs",
        help="output directory (default: docs)",
    )
    parser.add_argument(
        "--project-root",
        default=None,
        help="root used to compute source_path values (default: cwd)",
    )
    parser.add_argument(
        "-v", "--verbose", action="count", default=0,
        help="increase logging verbosity (-v=info, -vv=debug)"
    )
    args = parser.parse_args(argv)

    level = logging.WARNING
    if args.verbose == 1:
        level = logging.INFO
    elif args.verbose >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="%(levelname)s %(message)s")

    cwd = Path.cwd()
    project_root = Path(args.project_root).resolve() if args.project_root else cwd
    sites = [Path(s).resolve() for s in (args.site or DEFAULT_SITES)]
    out_root = (cwd / args.out).resolve()

    return run(sites, out_root, project_root)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
