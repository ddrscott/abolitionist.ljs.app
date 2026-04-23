#!/usr/bin/env node
/**
 * Generate a starter Excalidraw diagram of the reader-journey map.
 *
 * Source of truth: structure and hrefs roughly mirror
 * web/src/components/JourneyMap.tsx. Keep this script in sync
 * conceptually (or regenerate after major changes to the map's
 * content), but do not treat it as authoritative once someone has
 * hand-edited the .excalidraw file.
 *
 * Usage:
 *   node scripts/generate-journey-excalidraw.mjs \
 *     > web/public/journey-map.excalidraw
 *
 * Then open web/public/journey-map.excalidraw at excalidraw.com
 * (drag the file onto the canvas) to edit visually.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'web', 'public', 'journey-map.excalidraw');

// ---------------------------------------------------------------------------
// AR palette — same tokens used by the site.

const PRIMARY = '#430607';       // oxblood
const PRIMARY_SOFT = '#FDE8E8';  // text on oxblood
const SECONDARY = '#C49A6E';     // tan hairline
const SECONDARY_SOFT = '#F8F2ED';// cream fill for positions
const TERTIARY = '#CC3206';      // rust for objection "no" edges
const GOLD = '#FFC10A';          // fire-CTA border
const FOOTER = '#0A2029';        // deep teal for gospel terminal
const INK = '#000000';
const PAPER = '#FFFFFF';

// ---------------------------------------------------------------------------
// The map, modeled as a proper flowchart (diamonds for decisions,
// rectangles for reading steps). Each decision is an assertion the
// reader might hold about abortion; YES sends them to a challenging
// article, NO advances to the next assertion. Readers work downward
// until they hit a NO they can't honestly give — that's where they
// stop and read.

// Three-level cascade per top assertion. Each path is:
//   L1 (top assertion) → L2 (specific reason they hold it)
//   → L3 (narrower form of that reason)
//   → YES/NO branching to a targeted article.
// NO at any decision falls through to the next top assertion.
// The goal is that readers rule out objections quickly and only read
// the ONE article that addresses their exact sticking point.

const FLOW = [
  {
    id: 'D1',
    question: 'Abortion should\nbe legal.',
    l2: {
      id: 'D1_L2',
      question: "The preborn isn't\nyet fully human.",
    },
    l3: {
      id: 'D1_L3',
      question: "Viability or heartbeat\nmarks when a person\nbegins.",
    },
    readYes: {
      id: 'R_D1_yes',
      label: 'Read: FAQ — arbitrary\nthresholds (viability,\nheartbeat, sentience)',
      href: '/pages/abolitionistsrising.com/faq/',
    },
    readNo: {
      id: 'R_D1_no',
      label: "Read: FAQ —\n“That's just your belief”\n(embryology cited)",
      href: '/pages/abolitionistsrising.com/faq/',
    },
  },
  {
    id: 'D2',
    question: 'Exceptions for rape,\nincest, or the mother\'s\nlife are acceptable.',
    l2: {
      id: 'D2_L2',
      question: 'A child conceived in\nrape carries less\nweight than other children.',
    },
    l3: {
      id: 'D2_L3',
      question: 'The attacker\'s crime\njustifies taking\nthe child\'s life.',
    },
    readYes: {
      id: 'R_D2_yes',
      label: 'Read: No Exceptions\n(the rape case)',
      href: '/pages/abolitionistsrising.com/no-exceptions/',
    },
    readNo: {
      id: 'R_D2_no',
      label: 'Read: Criminalization\n(punishing the\nwrong person)',
      href: '/pages/abolitionistsrising.com/criminalization/',
    },
  },
  {
    id: 'D3',
    question: 'Incremental laws\nthat save some babies\nare a win.',
    l2: {
      id: 'D3_L2',
      question: 'Saving SOME lives\nis better than\nsaving none.',
    },
    l3: {
      id: 'D3_L3',
      question: 'Heartbeat bills\nand limits are\na net good.',
    },
    readYes: {
      id: 'R_D3_yes',
      label: 'Read: Immediatism\n(Garrison, Heyrick,\nand the logic of\n"some" vs. "all")',
      href: '/pages/abolitionistsrising.com/immediatism/',
    },
    readNo: {
      id: 'R_D3_no',
      label: "Read: Kristan Hawkins'\nFlawed Reasoning",
      href: '/pages/abolitionistsrising.com/kristan-hawkins-flawed-reasoning-vs-scripture/',
    },
  },
  {
    id: 'D4',
    question: 'I believe abortion\nis wrong, but\nI don\'t need to act.',
    l2: {
      id: 'D4_L2',
      question: 'Activism is a\nspecial calling for\nsome Christians, not me.',
    },
    l3: {
      id: 'D4_L3',
      question: 'My prayers and\ndonations are enough.',
    },
    readYes: {
      id: 'R_D4_yes',
      label: 'Read: Stay Steeped\nin Prayer (prayer\nas source, not\nsubstitute)',
      href: '/pages/abolitionistsrising.com/stay-steeped-in-prayer-as-you-seek-to-abolish-abortion/',
    },
    readNo: {
      id: 'R_D4_no',
      label: 'Read: All About\nthe Church (every\nmember, not a caste)',
      href: '/pages/freethestates.org/all-about-the-church/',
    },
  },
  {
    id: 'D5',
    question: 'Abolition work\ndoesn\'t require\nthe gospel of Christ.',
    l2: {
      id: 'D5_L2',
      question: 'Secular moral\nreasoning is\nsufficient.',
    },
    l3: {
      id: 'D5_L3',
      question: 'Shared opposition\nto abortion makes\nany ally a partner.',
    },
    readYes: {
      id: 'R_D5_yes',
      label: 'Read: FAQ — “Can\nnon-Christians\npartner with\nthe movement?”',
      href: '/pages/abolitionistsrising.com/faq/',
    },
    readNo: {
      id: 'R_D5_no',
      label: 'Read: Norman\nStatement Article XI\n+ Theological Foundations',
      href: '/pages/abolitionistsrising.com/norman-statement/',
    },
  },
];

// ---------------------------------------------------------------------------
// Layout geometry. Each top assertion gets one ROW running left-to-right:
//   trunk diamond (c1) → L2 diamond (c2) → L3 diamond (c3)
//                                          └─ YES → read rect (c4, row − 60)
//                                          └─ NO  → read rect (c4, row + 60)
// Top-level NOs cascade vertically down the trunk column.

const COL_TRUNK = 400;
const COL_L2 = 780;
const COL_L3 = 1160;
const COL_READS = 1540;

const DECISION_W = 260;
const DECISION_H = 140;
const ARTICLE_W = 300;
const ARTICLE_H = 100;
const TERMINAL_W = 300;
const TERMINAL_H = 90;

// One "row" = one top assertion + its full narrowing cascade. The
// read rectangles sit ±70 above/below the row's center y, so ROW_STEP
// needs enough vertical slack for the top read (− 70 + padding) and
// the bottom read (+ 70 + padding).
// READ_Y_OFFSET moves each read rect ±N px from the row centerline. The
// read rects are ARTICLE_H tall, so adjacent-row spacing works out to
// ROW_STEP − 2·READ_Y_OFFSET − ARTICLE_H. With 320 − 140 − 100 = 80px,
// reads from neighboring rows are comfortably separated.
const ROW_STEP = 320;
const READ_Y_OFFSET = 70;
const START_Y = 0;
const FIRST_ROW_Y = START_Y + 180;

// Random-ish IDs — Excalidraw just needs unique strings, not real UUIDs.
let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

function randomSeed() {
  // Excalidraw uses 32-bit ints for seed / versionNonce.
  return Math.floor(Math.random() * 2 ** 31);
}

function indexAt(i) {
  // Excalidraw uses fractional-index strings for z-order ("a0" < "a1").
  return `a${i.toString().padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Element constructors. Every Excalidraw element shares a common prefix
// of fields (type, id, x, y, width, height, angle, …). Constructors
// return the object + a text child bound to it when relevant.

let elements = [];
let zIndex = 0;

function baseElement(over) {
  return {
    id: over.id,
    type: over.type,
    x: over.x,
    y: over.y,
    width: over.width,
    height: over.height,
    angle: 0,
    strokeColor: over.strokeColor ?? INK,
    backgroundColor: over.backgroundColor ?? PAPER,
    fillStyle: over.fillStyle ?? 'solid',
    strokeWidth: over.strokeWidth ?? 2,
    strokeStyle: over.strokeStyle ?? 'solid',
    roughness: 0, // clean lines to match AR broadside aesthetic
    opacity: 100,
    roundness: over.roundness ?? null,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: over.boundElements ?? null,
    updated: Date.now(),
    link: over.link ?? null,
    locked: false,
    index: indexAt(zIndex++),
    customData: null,
    frameId: null,
    groupIds: [],
  };
}

// Bound-text elements need explicit x/y/width/height; Excalidraw does
// NOT auto-place them just because `containerId` is set. If the text
// element ships with width=0, the label is invisible (which is exactly
// what I shipped first). Center the text inside its container here.
function textOn(container, text, fontSize, color) {
  const lines = text.split('\n');
  const lineHeight = 1.25;
  const heightPx = Math.round(lines.length * fontSize * lineHeight);
  const widthPx = container.width - 20;
  return {
    ...baseElement({
      id: nextId('txt'),
      type: 'text',
      x: Math.round(container.x + (container.width - widthPx) / 2),
      y: Math.round(container.y + (container.height - heightPx) / 2),
      width: widthPx,
      height: heightPx,
      strokeColor: color,
      backgroundColor: 'transparent',
    }),
    fontSize,
    // 2 = Helvetica. Readily available, reliably rendered, no font-file
    // round-trip before the labels paint.
    fontFamily: 2,
    text,
    textAlign: 'center',
    verticalAlign: 'middle',
    baseline: Math.round(fontSize * 0.8),
    containerId: container.id,
    originalText: text,
    lineHeight,
    autoResize: true,
  };
}

function addShape({ id, type, x, y, width, height, text, fontSize, fill, stroke, textColor, link, roundness }) {
  const shape = baseElement({
    id,
    type,
    x,
    y,
    width,
    height,
    backgroundColor: fill,
    strokeColor: stroke,
    roundness,
    link: link ?? null,
    boundElements: [],
  });
  if (text) {
    const tx = textOn(shape, text, fontSize ?? 18, textColor ?? INK);
    shape.boundElements.push({ type: 'text', id: tx.id });
    elements.push(shape);
    elements.push(tx);
  } else {
    elements.push(shape);
  }
  return shape;
}

// Pick the edge-midpoint on `shape` that faces (tgtCx, tgtCy). This
// lets the arrow exit the correct side (top/bottom/left/right) based
// on the target's direction instead of always using a fixed edge.
function edgePointToward(shape, tgtCx, tgtCy) {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = tgtCx - cx;
  const dy = tgtCy - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: shape.x + shape.width, y: cy } // right edge
      : { x: shape.x, y: cy };              // left edge
  }
  return dy > 0
    ? { x: cx, y: shape.y + shape.height }  // bottom edge
    : { x: cx, y: shape.y };                // top edge
}

function addArrow({ from, to, label, dashed = false, strokeColor = INK, strokeWidth = 2, withArrowhead = true }) {
  // Look up the bound shapes so we can draw the arrow geometrically
  // between them. Bindings alone do NOT auto-route — the arrow must
  // already connect the two shapes at authoring time, else Excalidraw
  // renders it at its stored (x,y,points) which is (0,0,flat) for a
  // generator that trusted bindings. See the Apr 23 debug session.
  const src = elements.find((e) => e.id === from);
  const tgt = elements.find((e) => e.id === to);
  if (!src || !tgt) {
    throw new Error(`addArrow: missing endpoint (from=${from}, to=${to})`);
  }
  const srcCx = src.x + src.width / 2;
  const srcCy = src.y + src.height / 2;
  const tgtCx = tgt.x + tgt.width / 2;
  const tgtCy = tgt.y + tgt.height / 2;
  const sp = edgePointToward(src, tgtCx, tgtCy);
  const ep = edgePointToward(tgt, srcCx, srcCy);
  const dx = ep.x - sp.x;
  const dy = ep.y - sp.y;

  const id = nextId('arr');
  const a = baseElement({
    id,
    type: 'arrow',
    x: sp.x,
    y: sp.y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    strokeColor,
    strokeWidth,
    strokeStyle: dashed ? 'dashed' : 'solid',
    backgroundColor: 'transparent',
    boundElements: [],
  });
  a.points = [
    [0, 0],
    [dx, dy],
  ];
  a.lastCommittedPoint = null;
  a.startBinding = { elementId: from, focus: 0, gap: 4 };
  a.endBinding = { elementId: to, focus: 0, gap: 4 };
  a.startArrowhead = null;
  a.endArrowhead = withArrowhead ? 'arrow' : null;
  a.elbowed = false;
  elements.push(a);

  // Tell the source/target shapes that this arrow is bound to them
  // (makes Excalidraw keep the arrow attached during drag).
  for (const refId of [from, to]) {
    const ref = elements.find((e) => e.id === refId);
    if (ref) {
      ref.boundElements = ref.boundElements ?? [];
      ref.boundElements.push({ type: 'arrow', id });
    }
  }

  if (label) {
    // Arrow label — Excalidraw does NOT auto-position container text
    // for arrows either. Place at the geometric midpoint of the
    // segment with size estimated from label length.
    const fontSize = 14;
    const lines = label.split('\n');
    const widthPx = Math.max(...lines.map((l) => l.length)) * fontSize * 0.6;
    const heightPx = lines.length * fontSize * 1.25;
    const midX = sp.x + dx / 2;
    const midY = sp.y + dy / 2;
    const tx = {
      ...baseElement({
        id: nextId('txt'),
        type: 'text',
        x: Math.round(midX - widthPx / 2),
        y: Math.round(midY - heightPx / 2),
        width: Math.round(widthPx),
        height: Math.round(heightPx),
        strokeColor,
        backgroundColor: '#FFFFFF', // opaque so the arrow doesn't show through
      }),
      fontSize,
      fontFamily: 2,
      text: label,
      textAlign: 'center',
      verticalAlign: 'middle',
      baseline: Math.round(fontSize * 0.8),
      containerId: id,
      originalText: label,
      lineHeight: 1.25,
      autoResize: true,
    };
    elements.push(tx);
    a.boundElements.push({ type: 'text', id: tx.id });
  }
  return a;
}

// ---------------------------------------------------------------------------
// Build the flowchart.

const trunkCX = COL_TRUNK + DECISION_W / 2;

// START terminator — rounded rectangle, top of the flow.
addShape({
  id: 'start',
  type: 'rectangle',
  x: trunkCX - TERMINAL_W / 2,
  y: START_Y,
  width: TERMINAL_W,
  height: TERMINAL_H,
  text: 'Ask the\nAbolitionist',
  fontSize: 22,
  fill: PAPER,
  stroke: INK,
  roundness: { type: 3 },
});

// For each top assertion, lay out its narrowing cascade L1 → L2 → L3
// → { read_yes, read_no }. Top's NO falls through to the next top.
FLOW.forEach((step, i) => {
  const rowY = FIRST_ROW_Y + i * ROW_STEP;

  // L1 — top assertion (diamond on the trunk column)
  addShape({
    id: step.id,
    type: 'diamond',
    x: COL_TRUNK,
    y: rowY,
    width: DECISION_W,
    height: DECISION_H,
    text: step.question,
    fontSize: 14,
    fill: PRIMARY,
    stroke: PRIMARY,
    textColor: PRIMARY_SOFT,
  });

  // L2 — specific reason they hold it
  addShape({
    id: step.l2.id,
    type: 'diamond',
    x: COL_L2,
    y: rowY,
    width: DECISION_W,
    height: DECISION_H,
    text: step.l2.question,
    fontSize: 14,
    fill: PRIMARY,
    stroke: PRIMARY,
    textColor: PRIMARY_SOFT,
  });

  // L3 — narrower form of the reason
  addShape({
    id: step.l3.id,
    type: 'diamond',
    x: COL_L3,
    y: rowY,
    width: DECISION_W,
    height: DECISION_H,
    text: step.l3.question,
    fontSize: 14,
    fill: PRIMARY,
    stroke: PRIMARY,
    textColor: PRIMARY_SOFT,
  });

  // YES read — above the row line
  addShape({
    id: step.readYes.id,
    type: 'rectangle',
    x: COL_READS,
    y: rowY + DECISION_H / 2 - READ_Y_OFFSET - ARTICLE_H / 2,
    width: ARTICLE_W,
    height: ARTICLE_H,
    text: step.readYes.label,
    fontSize: 13,
    fill: SECONDARY_SOFT,
    stroke: SECONDARY,
    roundness: { type: 3 },
    link: step.readYes.href,
  });

  // NO read — below the row line
  addShape({
    id: step.readNo.id,
    type: 'rectangle',
    x: COL_READS,
    y: rowY + DECISION_H / 2 + READ_Y_OFFSET - ARTICLE_H / 2,
    width: ARTICLE_W,
    height: ARTICLE_H,
    text: step.readNo.label,
    fontSize: 13,
    fill: SECONDARY_SOFT,
    stroke: SECONDARY,
    roundness: { type: 3 },
    link: step.readNo.href,
  });
});

// Final terminator — "Faithful Abolitionist", gold-bordered fire CTA.
const terminalY = FIRST_ROW_Y + FLOW.length * ROW_STEP;
addShape({
  id: 'T_FA',
  type: 'rectangle',
  x: trunkCX - TERMINAL_W / 2,
  y: terminalY,
  width: TERMINAL_W,
  height: TERMINAL_H,
  text: 'Faithful Abolitionist\nread the next steps',
  fontSize: 18,
  fill: PRIMARY,
  stroke: GOLD,
  textColor: PRIMARY_SOFT,
  roundness: { type: 3 },
  link: '/pages/journey/next-steps/',
});

// Arrows.
// START → D1 (the initial flow in).
addArrow({ from: 'start', to: FLOW[0].id, strokeColor: PRIMARY, strokeWidth: 2 });

FLOW.forEach((step, i) => {
  const nextTopId = FLOW[i + 1] ? FLOW[i + 1].id : 'T_FA';

  // L1 YES → L2
  addArrow({ from: step.id, to: step.l2.id, label: 'yes', strokeColor: TERTIARY, strokeWidth: 2 });
  // L1 NO → next top (trunk cascade)
  addArrow({ from: step.id, to: nextTopId, label: 'no', strokeColor: PRIMARY, strokeWidth: 2.5 });

  // L2 YES → L3
  addArrow({ from: step.l2.id, to: step.l3.id, label: 'yes', strokeColor: TERTIARY, strokeWidth: 2 });
  // L2 NO → next top (fall-through)
  addArrow({
    from: step.l2.id,
    to: nextTopId,
    label: 'no',
    strokeColor: PRIMARY,
    strokeWidth: 1.5,
    dashed: true,
  });

  // L3 YES/NO → the two targeted reads
  addArrow({ from: step.l3.id, to: step.readYes.id, label: 'yes', strokeColor: TERTIARY, strokeWidth: 2 });
  addArrow({ from: step.l3.id, to: step.readNo.id, label: 'no', strokeColor: PRIMARY, strokeWidth: 2 });
});

// ---------------------------------------------------------------------------

const doc = {
  type: 'excalidraw',
  version: 2,
  source: 'https://abolitionist.ljs.app/editor',
  elements,
  appState: {
    gridSize: 20,
    viewBackgroundColor: PAPER,
    theme: 'light',
    currentItemRoughness: 0,
    currentItemFontFamily: 2,
  },
  files: {},
};

writeFileSync(OUT, JSON.stringify(doc, null, 2));
console.error(`wrote ${elements.length} elements to ${OUT}`);
