import { useEffect, useState } from 'react';
import { X, Link2, Check, Play } from 'lucide-react';

// --- Source shapes — mirror worker/answer.ts ------------------------------

export type ArticleSource = {
  type: 'article';
  key: string;
  url: string;
  title: string;
  text: string;
  score: number;
};
export type ClipSource = {
  type: 'clip';
  id: string;
  question: string;
  answer: string;
  speaker?: string;
  topics: string[];
  confidence?: number;
  videoId: string;
  startSeconds: number;
  videoTitle: string;
  channelName: string;
  youtubeUrl: string;
  score?: number;
};
export type Source = ArticleSource | ClipSource;

/** What the source-detail panel is currently showing. */
export type DetailTarget =
  | { kind: 'article'; source: ArticleSource }
  | { kind: 'clip'; source: ClipSource };

// --- shared helpers --------------------------------------------------------

export function mmss(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Bare hostname for a source link label, e.g. "freethestates.org". */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const GENERIC_SPEAKERS = new Set(['host', 'abolitionist', 'speaker', 'narrator', 'unknown']);
export function realSpeaker(s?: string): string | null {
  if (!s) return null;
  return GENERIC_SPEAKERS.has(s.trim().toLowerCase()) ? null : s.trim();
}

// --- copy-link button (share a snippet) ------------------------------------

/** One-tap copy of a shareable URL (e.g. a YouTube timestamp link). */
export function CopyLink({
  url,
  label = 'Copy link',
  className = 'copy-link',
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy(e: { preventDefault: () => void; stopPropagation: () => void }) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }
  return (
    <button type="button" className={className} onClick={copy} title="Copy a shareable link to this clip">
      {copied ? (
        <>
          <Check size={14} aria-hidden="true" /> Copied
        </>
      ) : (
        <>
          <Link2 size={14} aria-hidden="true" /> {label}
        </>
      )}
    </button>
  );
}

// --- shared clip card ------------------------------------------------------

/** Canonical video-clip card — question-led, with answer preview, an explicit
 *  "Watch at m:ss" + Copy link, and topic tags. Used by the chat and the
 *  /questions Talks tab so clips look identical everywhere. Clicking the
 *  question or Watch opens the in-app panel (onOpen); tags browse (onTopic). */
export function ClipCard({
  clip,
  onOpen,
  onTopic,
}: {
  clip: ClipSource;
  onOpen: () => void;
  onTopic?: (t: string) => void;
}) {
  const speaker = realSpeaker(clip.speaker);
  return (
    <div className="clipcard">
      <button type="button" className="clipcard-q" onClick={onOpen}>{clip.question}</button>
      {clip.answer && <p className="clipcard-a">{clip.answer}</p>}
      <div className="clipcard-meta">
        <button type="button" className="clipcard-watch" onClick={onOpen}>
          <Play size={13} fill="currentColor" aria-hidden="true" /> Watch at {mmss(clip.startSeconds)}
        </button>
        <CopyLink url={clip.youtubeUrl} className="clipcard-copy" label="Copy link" />
        <span className="clipcard-src">
          {clip.videoTitle}{speaker ? ` · ${speaker}` : ''} · {clip.channelName}
        </span>
      </div>
      {clip.topics.length > 0 && (
        <div className="cliptags">
          {clip.topics.slice(0, 6).map((t) =>
            onTopic ? (
              <button key={t} type="button" className="cliptag" onClick={() => onTopic(t)}>{t}</button>
            ) : (
              <span key={t} className="cliptag">{t}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// --- the in-app source viewer ----------------------------------------------

/** Articles load the prerendered `…/fragment/` body; clips embed the YouTube
 *  player at the cited timestamp. Docks right on desktop, rises as a bottom
 *  sheet on mobile (CSS). Shared by the chat and the /questions Talks tab. */
export function DetailPanel({ detail, onClose }: { detail: DetailTarget | null; onClose: () => void }) {
  const [articleHtml, setArticleHtml] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (detail?.kind !== 'article') {
      setArticleHtml(null);
      setSourceUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setArticleHtml(null);
    setSourceUrl(null);
    fetch(`${detail.source.url}fragment/`)
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => {
        if (!cancelled) {
          const src = html?.match(/data-source-url="([^"]+)"/i);
          setSourceUrl(src ? src[1] : null);
          const trimmed = html ? html.replace(/^[\s\S]*?(?=<h1)/i, '') : html;
          setArticleHtml(trimmed);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, onClose]);

  if (!detail) return null;

  const isClip = detail.kind === 'clip';
  const heading = isClip ? detail.source.videoTitle : detail.source.title;
  const hasOriginal = isClip || !!sourceUrl;
  const externHref = isClip ? detail.source.youtubeUrl : sourceUrl ?? detail.source.url;
  const externLabel = isClip
    ? 'Watch on YouTube ↗'
    : sourceUrl
      ? `Read the original${sourceHost(sourceUrl) ? ` at ${sourceHost(sourceUrl)}` : ''} ↗`
      : 'Open the full article ↗';

  return (
    <div className="detail-scrim" onClick={onClose}>
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-grip" aria-hidden="true" />
        <header className="detail-head">
          <span className="detail-kind">{isClip ? 'Clip' : 'Article'}</span>
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="detail-body">
          {isClip ? (
            <ClipDetail clip={detail.source} />
          ) : loading ? (
            <p className="detail-loading">Loading the article…</p>
          ) : articleHtml ? (
            <div
              className="detail-article sl-markdown-content"
              dangerouslySetInnerHTML={{ __html: articleHtml }}
            />
          ) : (
            <p className="detail-loading">
              Couldn’t load a preview. <a href={externHref}>Open the full article ↗</a>
            </p>
          )}
        </div>

        <footer className="detail-foot">
          {isClip && <CopyLink url={detail.source.youtubeUrl} className="detail-copy" />}
          <a href={externHref} target={hasOriginal ? '_blank' : undefined} rel="noopener noreferrer">
            {externLabel}
          </a>
        </footer>
      </aside>
    </div>
  );
}

function ClipDetail({ clip }: { clip: ClipSource }) {
  const start = Math.max(0, Math.floor(clip.startSeconds));
  const embed = `https://www.youtube-nocookie.com/embed/${clip.videoId}?start=${start}&rel=0`;
  const speaker = realSpeaker(clip.speaker);
  return (
    <div className="clip-detail">
      <div className="clip-embed">
        <iframe
          src={embed}
          title={clip.videoTitle}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <h3>{clip.videoTitle}</h3>
      <p className="clip-detail-meta">
        {clip.channelName} · starts at {mmss(start)}
        {speaker ? ` · ${speaker}` : ''}
      </p>
      {clip.question && <p className="clip-detail-q">“{clip.question}”</p>}
      {clip.answer && <p className="clip-detail-a">{clip.answer}</p>}
      {clip.topics.length > 0 && (
        <div className="clip-topics">
          {clip.topics.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
