#!/usr/bin/env node
/**
 * Generate a randomized "Abolitionist Rising" bingo card as a self-contained
 * SVG — a hand-traced vector recreation of the printed card, with the 24
 * argument squares shuffled (FREE SPACE stays in the center).
 *
 *   node scripts/generate-bingo.mjs                  # random → stdout
 *   node scripts/generate-bingo.mjs --seed 7         # reproducible
 *   node scripts/generate-bingo.mjs --out card.svg   # write to a file
 *
 * Import it instead to drive your own decks:
 *   import { renderBingoSVG, buildSquares, ARGUMENTS } from './generate-bingo.mjs'
 */

// --- the argument pool (the 24 non-center squares of the printed card) ------
export const ARGUMENTS = [
  "It's just a clump of cells.",
  'What about rape?',
  'Abortion is healthcare.',
  "You can't legislate morality.",
  'The baby would have a bad life.',
  "It's not a person yet.",
  "You're forcing birth.",
  'Banning abortion kills women.',
  "Adoption isn't an alternative.",
  "They're not viable.",
  "It's between a woman and her doctor.",
  "You're just pro-birth.",
  "People can't afford kids.",
  'The fetus is a parasite.',
  "The unborn aren't conscious.",
  "What about the mother's life or health?",
  'Separation of church and state.',
  'You only care until birth.',
  "They'll just do it illegally anyway.",
  "It's a matter of privacy.",
  "Don't impose your religion.",
  'Everyone has a right to sex without consequences.',
  "Consent to sex isn't consent to pregnancy.",
  "You're punishing women.",
];

// --- seeded RNG (mulberry32) so cards are reproducible from a seed ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick 24 arguments (shuffled; a random subset if the pool is larger) and
 *  splice FREE SPACE into the center (index 12) → 25 cells. */
export function buildSquares(rnd, pool = ARGUMENTS) {
  const picks = shuffle(pool, rnd).slice(0, 24);
  const cells = [];
  for (let i = 0, p = 0; i < 25; i += 1) {
    cells.push(i === 12 ? { free: true } : { text: picks[p++] });
  }
  return cells;
}

// --- helpers ----------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word-wrap to ~maxChars per line (keeps long words intact). */
function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// --- geometry (viewBox 720 × 1018) ------------------------------------------
const W = 720;
const H = 1018;
const TABLE = { x: 42, r: 678, top: 246 }; // table left, right, top (BINGO row)
const COLS = 5;
const ROWS = 5;
const COLW = (TABLE.r - TABLE.x) / COLS; // 127.2
const BINGO_BOTTOM = 346; // bottom of the big BINGO letters row
const GRID_BOTTOM = 959;
const ROWH = (GRID_BOTTOM - BINGO_BOTTOM) / ROWS; // 122.6
const colCenter = (c) => TABLE.x + COLW * (c + 0.5);
const rowTop = (r) => BINGO_BOTTOM + ROWH * r;

// three dots, horizontal or vertical
function dots(cx, cy, { vertical = false, gap = 11, r = 2.6 } = {}) {
  return [-1, 0, 1]
    .map((k) => {
      const x = vertical ? cx : cx + k * gap;
      const y = vertical ? cy + k * gap : cy;
      return `<circle cx="${x}" cy="${y}" r="${r}"/>`;
    })
    .join('');
}

// rising-sun motif (small arc + fan of rays), centered at (cx, cy) baseline
function sunburst(cx, cy) {
  const rays = [];
  for (let k = -4; k <= 4; k += 1) {
    const ang = (90 + k * 11) * (Math.PI / 180); // up = 90°, fanning out
    const r1 = 17;
    const r2 = 33;
    const x1 = cx + Math.cos(ang) * r1;
    const y1 = cy - Math.sin(ang) * r1;
    const x2 = cx + Math.cos(ang) * r2;
    const y2 = cy - Math.sin(ang) * r2;
    rays.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  return `<g class="ink-stroke">
    <path d="M ${cx - 24} ${cy} A 24 24 0 0 1 ${cx + 24} ${cy}" fill="none"/>
    <line x1="${cx - 34}" y1="${cy}" x2="${cx + 34}" y2="${cy}"/>
    ${rays.join('')}
  </g>`;
}

// a pair of baby footprints around (x, y): heel ellipse + ball ellipse + toes
function footprint(x, y) {
  const one = (ox, rot) => `<g transform="translate(${ox} 0) rotate(${rot} ${x} ${y})">
    <ellipse cx="${x}" cy="${y + 9}" rx="6.5" ry="9.5"/>
    <ellipse cx="${x}" cy="${y - 4}" rx="7.5" ry="6"/>
    <circle cx="${x - 6}" cy="${y - 11}" r="1.7"/>
    <circle cx="${x - 2}" cy="${y - 13}" r="1.9"/>
    <circle cx="${x + 2}" cy="${y - 13}" r="1.9"/>
    <circle cx="${x + 6}" cy="${y - 11}" r="1.7"/>
  </g>`;
  return `<g class="ink-fill">${one(-9, -14)}${one(9, 12)}</g>`;
}

// EKG / heartbeat polyline starting at (x, y), drawn left→right, width w
function heartbeat(x, y, w, dir = 1) {
  const u = (w / 28) * dir;
  const p = [
    [0, 0], [6, 0], [8, -3], [10, 6], [13, -14], [16, 10], [18, -4], [20, 0], [28, 0],
  ]
    .map(([dx, dy]) => `${(x + dx * u).toFixed(1)},${(y + dy).toFixed(1)}`)
    .join(' ');
  return `<polyline points="${p}" fill="none"/>`;
}

// little corner sprig (curved stem + leaves); placed via translate/scale
function sprig(tx, ty, sx, sy) {
  return `<g class="ink-fill" transform="translate(${tx} ${ty}) scale(${sx} ${sy})">
    <path class="ink-stroke" fill="none" d="M 4 4 C 26 8, 40 22, 46 46"/>
    <ellipse cx="16" cy="11" rx="6" ry="3" transform="rotate(28 16 11)"/>
    <ellipse cx="28" cy="20" rx="6.5" ry="3.2" transform="rotate(40 28 20)"/>
    <ellipse cx="38" cy="32" rx="6" ry="3" transform="rotate(54 38 32)"/>
    <ellipse cx="11" cy="20" rx="5" ry="2.6" transform="rotate(64 11 20)"/>
    <ellipse cx="22" cy="31" rx="5.4" ry="2.8" transform="rotate(70 22 31)"/>
  </g>`;
}

// free-space center cell content — even radial burst behind FREE / SPACE
function freeSpace(cx, cy) {
  const ry = cy - 6; // ray center (around the FREE/SPACE text)
  const rays = [];
  for (let k = 0; k < 16; k += 1) {
    const ang = (k * (360 / 16)) * (Math.PI / 180);
    const r1 = 44;
    const r2 = 52;
    rays.push(
      `<line x1="${(cx + Math.cos(ang) * r1).toFixed(1)}" y1="${(ry + Math.sin(ang) * r1).toFixed(1)}" x2="${(cx + Math.cos(ang) * r2).toFixed(1)}" y2="${(ry + Math.sin(ang) * r2).toFixed(1)}"/>`,
    );
  }
  return `<g class="ink-stroke" stroke-width="1">${rays.join('')}</g>
    <text class="t-free" x="${cx}" y="${cy - 9}" text-anchor="middle">FREE</text>
    <text class="t-free" x="${cx}" y="${cy + 14}" text-anchor="middle">SPACE</text>
    <text class="t-trust" x="${cx}" y="${cy + 36}" text-anchor="middle">Trust women.</text>`;
}

// --- main render ------------------------------------------------------------
export function renderBingoSVG(cells) {
  const letters = ['B', 'I', 'N', 'G', 'O'];

  // grid lines
  const gridLines = [];
  for (let c = 0; c <= COLS; c += 1) {
    const x = TABLE.x + COLW * c;
    gridLines.push(`<line x1="${x}" y1="${BINGO_BOTTOM}" x2="${x}" y2="${GRID_BOTTOM}"/>`);
  }
  // table outer + BINGO row + each argument row
  for (let r = 0; r <= ROWS; r += 1) gridLines.push(`<line x1="${TABLE.x}" y1="${rowTop(r)}" x2="${TABLE.r}" y2="${rowTop(r)}"/>`);
  gridLines.push(`<rect x="${TABLE.x}" y="${TABLE.top}" width="${TABLE.r - TABLE.x}" height="${GRID_BOTTOM - TABLE.top}" fill="none"/>`);
  // BINGO column dividers
  for (let c = 1; c < COLS; c += 1) {
    const x = TABLE.x + COLW * c;
    gridLines.push(`<line x1="${x}" y1="${TABLE.top}" x2="${x}" y2="${BINGO_BOTTOM}"/>`);
  }

  // BINGO letters
  const bingo = letters
    .map((L, c) => `<text class="t-bingo" x="${colCenter(c)}" y="${TABLE.top + 76}" text-anchor="middle">${L}</text>`)
    .join('');

  // cell text
  const cellText = cells
    .map((cell, i) => {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const cx = colCenter(c);
      const cyTop = rowTop(r);
      const cyMid = cyTop + ROWH / 2;
      if (cell.free) return freeSpace(cx, cyMid);
      const lines = wrap(cell.text, 13);
      const lh = 18;
      const startY = cyMid - ((lines.length - 1) * lh) / 2 + 6;
      const tspans = lines
        .map((ln, k) => `<tspan x="${cx}" y="${(startY + k * lh).toFixed(1)}">${esc(ln)}</tspan>`)
        .join('');
      return `<text class="t-cell" text-anchor="middle">${tspans}</text>`;
    })
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Abolitionist Rising bingo card">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&amp;family=EB+Garamond:wght@400;500&amp;family=Oswald:wght@500&amp;display=swap');
    .ink-stroke { stroke: #111; stroke-width: 1.6; }
    .ink-fill { fill: #111; }
    text { fill: #111; }
    .t-title { font-family: 'Playfair Display','EB Garamond',Georgia,serif; font-weight: 700; font-size: 62px; }
    .t-sub { font-family: 'EB Garamond',Georgia,serif; font-size: 17px; letter-spacing: .2px; }
    .t-bingo { font-family: 'Playfair Display','EB Garamond',serif; font-weight: 700; font-size: 70px; }
    .t-cell { font-family: 'EB Garamond',Georgia,serif; font-size: 15px; }
    .t-free { font-family: 'Oswald','EB Garamond',sans-serif; font-weight: 500; font-size: 21px; letter-spacing: 1px; }
    .t-trust { font-family: 'EB Garamond',Georgia,serif; font-style: italic; font-size: 13px; }
    rect, line, path, polyline { stroke: #111; }
    line, .grid { stroke-width: 1.4; }
  </style>

  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>

  <!-- decorative frame -->
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke-width="2.4"/>
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke-width="1"/>

  <!-- corner sprigs -->
  ${sprig(34, 34, 0.9, 0.9)}
  ${sprig(W - 34, 34, -0.9, 0.9)}
  ${sprig(34, H - 34, 0.9, -0.9)}
  ${sprig(W - 34, H - 34, -0.9, -0.9)}

  <!-- top motifs -->
  ${dots(W / 2, 28)}
  ${sunburst(W / 2, 86)}
  ${footprint(98, 96)}
  ${footprint(W - 98, 96)}

  <!-- title -->
  <text class="t-title" x="${W / 2}" y="166" text-anchor="middle">Abolitionist Rising</text>

  <!-- subtitle with heartbeats -->
  ${heartbeat(70, 208, 70)}
  <text class="t-sub" x="${W / 2}" y="213" text-anchor="middle">Typical Arguments Abortion Abolitionists Constantly Hear.</text>
  ${heartbeat(W - 70, 208, 70, -1)}

  <!-- table -->
  <g class="grid" fill="none" stroke="#111">${gridLines.join('')}</g>
  ${bingo}
  <g>
    ${cellText}
  </g>

  <!-- side + bottom dots -->
  ${dots(26, H / 2, { vertical: true })}
  ${dots(W - 26, H / 2, { vertical: true })}
  ${dots(W / 2, H - 30)}
</svg>
`;
}

// --- CLI --------------------------------------------------------------------
function isMain() {
  return import.meta.url === `file://${process.argv[1]}`;
}
if (isMain()) {
  const args = process.argv.slice(2);
  const seedArg = args.indexOf('--seed');
  const outArg = args.indexOf('--out');
  const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : Math.floor(Math.random() * 2 ** 31);
  const rnd = mulberry32(seed);
  const svg = renderBingoSVG(buildSquares(rnd));
  if (outArg >= 0) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args[outArg + 1], svg);
    console.error(`wrote ${args[outArg + 1]} (seed ${seed})`);
  } else {
    process.stdout.write(svg);
  }
}
