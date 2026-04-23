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

const FLOW = [
  {
    id: 'D1',
    question: 'Abortion should\nbe legal.',
    read: {
      id: 'R1',
      label: 'Read: Equal Protection\n+ FAQ on bodily autonomy',
      href: '/pages/abolitionistsrising.com/criminalization/',
    },
  },
  {
    id: 'D2',
    question: 'Exceptions for rape,\nincest, or the mother\'s life\nare acceptable.',
    read: {
      id: 'R2',
      label: 'Read: No Exceptions',
      href: '/pages/abolitionistsrising.com/no-exceptions/',
    },
  },
  {
    id: 'D3',
    question: 'Incremental laws\nthat save some babies\nare a win.',
    read: {
      id: 'R3',
      label: 'Read: Immediatism +\nAbolitionist, Not Pro-Life',
      href: '/pages/abolitionistsrising.com/immediatism/',
    },
  },
  {
    id: 'D4',
    question: 'I believe abortion\nis wrong, but I\ndon\'t need to act.',
    read: {
      id: 'R4',
      label: "Read: All About the Church\n+ Stay Steeped in Prayer",
      href: '/pages/freethestates.org/all-about-the-church/',
    },
  },
  {
    id: 'D5',
    question: 'Abolition work\ndoesn\'t require\nthe gospel of Christ.',
    read: {
      id: 'R5',
      label: 'Read: Norman Statement\n+ Theological Foundations',
      href: '/pages/abolitionistsrising.com/norman-statement/',
    },
  },
];

// ---------------------------------------------------------------------------
// Layout geometry. Flowchart runs top-to-bottom in one column; the
// "read this article" rectangles hang to the right of each decision.

const TRUNK_X = 400;        // x of the decision column (diamond TL corner)
const ARTICLE_X = 900;      // x of the article column (rect TL corner)

const DECISION_W = 260;
const DECISION_H = 160;
const ARTICLE_W = 320;
const ARTICLE_H = 100;
const TERMINAL_W = 300;
const TERMINAL_H = 90;

const ROW_STEP = 260;       // vertical spacing between successive rows
const START_Y = 0;
const DECISIONS_Y = START_Y + 160;

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

const trunkCX = TRUNK_X + DECISION_W / 2;

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

// Decision diamonds + their associated "read this" rectangles.
FLOW.forEach((step, i) => {
  const y = DECISIONS_Y + i * ROW_STEP;

  // Decision (diamond, oxblood fill, pale text).
  addShape({
    id: step.id,
    type: 'diamond',
    x: TRUNK_X,
    y,
    width: DECISION_W,
    height: DECISION_H,
    text: step.question,
    fontSize: 16,
    fill: PRIMARY,
    stroke: PRIMARY,
    textColor: PRIMARY_SOFT,
  });

  // "Read this" rectangle, offset to the right, deep-linked.
  addShape({
    id: step.read.id,
    type: 'rectangle',
    x: ARTICLE_X,
    y: y + (DECISION_H - ARTICLE_H) / 2,
    width: ARTICLE_W,
    height: ARTICLE_H,
    text: step.read.label,
    fontSize: 16,
    fill: SECONDARY_SOFT,
    stroke: SECONDARY,
    roundness: { type: 3 },
    link: step.read.href,
  });
});

// Final terminator — "Faithful Abolitionist", gold-bordered fire CTA.
const terminalY = DECISIONS_Y + FLOW.length * ROW_STEP;
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
addArrow({
  from: 'start',
  to: FLOW[0].id,
  strokeColor: PRIMARY,
  strokeWidth: 2,
});

// For each decision: YES to the article on its right, NO to the next
// decision (or the terminal for the last one). After reading, the
// article's bottom points at the next decision so the loop is explicit
// and the reader sees "read, then continue."
FLOW.forEach((step, i) => {
  const next = FLOW[i + 1];
  // YES branch — diamond → article.
  addArrow({
    from: step.id,
    to: step.read.id,
    label: 'yes',
    strokeColor: TERTIARY,
    strokeWidth: 2,
  });
  if (next) {
    // NO branch — diamond → next decision (main trunk).
    addArrow({
      from: step.id,
      to: next.id,
      label: 'no',
      strokeColor: PRIMARY,
      strokeWidth: 2.5,
    });
    // After-reading arrow — article → next decision (re-joins trunk).
    addArrow({
      from: step.read.id,
      to: next.id,
      strokeColor: SECONDARY,
      strokeWidth: 1,
      dashed: true,
      withArrowhead: true,
    });
  } else {
    // Last decision's NO → the terminal.
    addArrow({
      from: step.id,
      to: 'T_FA',
      label: 'no',
      strokeColor: PRIMARY,
      strokeWidth: 3,
    });
    // After-reading on the final decision rejoins the terminal too.
    addArrow({
      from: step.read.id,
      to: 'T_FA',
      strokeColor: SECONDARY,
      strokeWidth: 1,
      dashed: true,
      withArrowhead: true,
    });
  }
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
