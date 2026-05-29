import { useRef, useState } from 'react';
import { DetailPanel, ClipCard, type ClipSource, type DetailTarget } from './SourcePanel';

// The 25 squares of the "Abolitionist Rising" bingo card, row-major (B,I,N,G,O
// columns × 5 rows). `label` matches the printed card; `query` is the semantic
// search sent to the clips API to find clips answering that argument.
type Square = { label: string; query: string; free?: boolean };

const SQUARES: Square[] = [
  // Row 1
  { label: "It's just a clump of cells.", query: "abortion it's just a clump of cells" },
  { label: 'What about rape?', query: 'what about rape exception abortion' },
  { label: 'Abortion is healthcare.', query: 'abortion is healthcare' },
  { label: "You can't legislate morality.", query: "you can't legislate morality" },
  { label: 'The baby would have a bad life.', query: 'the baby would have a bad life quality of life abortion' },
  // Row 2
  { label: "It's not a person yet.", query: "the unborn is not a person yet personhood" },
  { label: "You're forcing birth.", query: "forced birth forcing birth objection" },
  { label: 'Banning abortion kills women.', query: 'banning abortion kills women back-alley' },
  { label: "Adoption isn't an alternative.", query: "adoption is not an alternative to abortion" },
  { label: "They're not viable.", query: 'the fetus is not viable viability abortion' },
  // Row 3
  { label: "It's between a woman and her doctor.", query: "abortion is between a woman and her doctor" },
  { label: "You're just pro-birth.", query: "you're just pro-birth not pro-life" },
  { label: 'Trust women.', query: 'trust women my body my choice', free: true },
  { label: "People can't afford kids.", query: "people can't afford kids poverty abortion" },
  { label: 'The fetus is a parasite.', query: 'the fetus is a parasite' },
  // Row 4
  { label: "The unborn aren't conscious.", query: "the unborn are not conscious sentience abortion" },
  { label: "What about the mother's life or health?", query: "life of the mother health exception ectopic" },
  { label: 'Separation of church and state.', query: 'separation of church and state abortion legislate' },
  { label: 'You only care until birth.', query: "you only care about babies until they're born" },
  { label: "They'll just do it illegally anyway.", query: "women will just get abortions illegally anyway" },
  // Row 5
  { label: "It's a matter of privacy.", query: 'abortion is a matter of privacy bodily privacy' },
  { label: "Don't impose your religion.", query: "don't impose your religion on others abortion" },
  { label: 'Everyone has a right to sex without consequences.', query: 'right to sex without consequences' },
  { label: "Consent to sex isn't consent to pregnancy.", query: "consent to sex is not consent to pregnancy" },
  { label: "You're punishing women.", query: "banning abortion punishes women" },
];

export function BingoBoard() {
  const [active, setActive] = useState<number | null>(null);
  const [clips, setClips] = useState<ClipSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const reqId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function pickSquare(i: number) {
    setActive(i);
    setClips([]);
    setError(null);
    setLoading(true);
    const id = ++reqId.current;
    try {
      const res = await fetch('/api/clips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: SQUARES[i].query }),
      });
      const data = (await res.json()) as { clips?: ClipSource[]; error?: string };
      if (id !== reqId.current) return;
      if (!res.ok) throw new Error(data.error || `clips ${res.status}`);
      setClips(data.clips ?? []);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'failed to load clips');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  return (
    <div className="bingo-page">
      <header className="bingo-head">
        <h1>Abolitionist Bingo</h1>
        <p>
          Heard one of these on the sidewalk? Tap the square and the abolitionist
          pulls up clips from the movement that answer it — ready to watch or share.
        </p>
      </header>

      <div className="bingo">
        <img
          src="/bingo.png"
          alt="Abolitionist Rising bingo card of the typical arguments abortion abolitionists hear"
          className="bingo-img"
        />
        <div className="bingo-grid" role="group" aria-label="Bingo arguments — tap one to find clips">
          {SQUARES.map((sq, i) => (
            <button
              key={i}
              type="button"
              className={`bingo-cell${active === i ? ' active' : ''}${sq.free ? ' free' : ''}`}
              onClick={() => pickSquare(i)}
              aria-label={`Find clips answering: ${sq.label}`}
              title={`Find clips: ${sq.label}`}
            />
          ))}
        </div>
      </div>

      <div ref={resultsRef} className="bingo-results">
        {active === null ? (
          <p className="bingo-hint">Tap any square above to pull up clips that answer it.</p>
        ) : (
          <>
            <h2 className="bingo-results-title">
              Clips that answer <span>“{SQUARES[active].label}”</span>
            </h2>
            {loading && <p className="qbrowse-loading">Finding clips…</p>}
            {error && <p className="qbrowse-loading">Couldn’t load clips: {error}</p>}
            {!loading && !error && clips.length === 0 && (
              <p className="qbrowse-loading">
                No clips found for this one — <a href={`/?q=${encodeURIComponent(SQUARES[active].label)}`}>ask the abolitionist instead →</a>
              </p>
            )}
            <div className="cliplist">
              {clips.map((c) => (
                <ClipCard key={c.id} clip={c} onOpen={() => setDetail({ kind: 'clip', source: c })} />
              ))}
            </div>
          </>
        )}
      </div>

      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
