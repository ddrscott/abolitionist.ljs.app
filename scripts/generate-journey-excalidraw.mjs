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
// Data — the structural skeleton of the map. Objections are omitted
// from the starter file on purpose; add them in Excalidraw if you want
// them on the board, or keep them in the JourneyMap component.

const POSITIONS = [
  { id: 'P1', label: 'I support legal abortion', href: '/pages/journey/path-secular-pro-choice/' },
  { id: 'P2', label: "I'm a Christian\nbut pro-choice", href: '/pages/journey/path-christian-pro-choice/' },
  { id: 'P3', label: 'Personally opposed,\nnot illegal', href: '/pages/journey/path-personally-opposed/' },
  { id: 'P4', label: 'Pro-life\nwith exceptions', href: '/pages/journey/path-pro-life-with-exceptions/' },
  { id: 'P5', label: 'Pro-life\nincrementalist', href: '/pages/journey/path-pro-life-incrementalist/' },
  { id: 'P6', label: 'Believes wrong,\nnot acting', href: '/pages/journey/path-apathetic-christian/' },
  { id: 'P7', label: 'Anti-abortion,\nnot Christian', href: '/pages/journey/path-anti-abortion-non-christian/' },
];

const GATES = [
  { id: 'G1', label: 'Is abortion the unjust\nkilling of a human being?' },
  { id: 'G2', label: 'By what authority\ndo you decide?' },
  { id: 'G3', label: "Is 'less iniquity'\nacceptable?" },
  { id: 'G4', label: 'Are exceptions\nacceptable?' },
  { id: 'G5', label: 'Is belief without\naction sufficient?' },
  { id: 'G6', label: 'How does action\nmanifest?' },
];

// P → first gate mapping (where each starter enters the trunk).
const ROUTES = {
  P1: 'G1',
  P2: 'G2',
  P3: 'G1',
  P4: 'G4',
  P5: 'G3',
  P6: 'G5',
  P7: 'GG',
};

// ---------------------------------------------------------------------------
// Layout geometry. Spaced for legibility in Excalidraw's default zoom.

const POS_W = 200;
const POS_H = 80;
const POS_GAP = 40;
const POS_ROW_Y = 40;

const GATE_W = 280;
const GATE_H = 120;
const GATE_COL_X = 1200;      // centered with respect to the 7 positions
const GATE_FIRST_Y = 280;
const GATE_ROW_GAP = 220;

const GOSPEL_OFFSET_X = 600;
const GOSPEL_Y = GATE_FIRST_Y;

const TERMINAL_W = 320;
const TERMINAL_H = 100;

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
// Build the map.

// Start node — a rounded rectangle, top-center of the position row.
const totalPosWidth = POSITIONS.length * POS_W + (POSITIONS.length - 1) * POS_GAP;
const posLeft = 0;
const posCenterX = posLeft + totalPosWidth / 2;

addShape({
  id: 'start',
  type: 'rectangle',
  x: posCenterX - 110,
  y: POS_ROW_Y - 140,
  width: 220,
  height: 80,
  text: 'Where are you\nnow?',
  fontSize: 22,
  fill: PAPER,
  stroke: INK,
  roundness: { type: 3 },
});

// Entry positions — cream rectangles with tan border, deep-linked.
POSITIONS.forEach((p, i) => {
  addShape({
    id: p.id,
    type: 'rectangle',
    x: posLeft + i * (POS_W + POS_GAP),
    y: POS_ROW_Y,
    width: POS_W,
    height: POS_H,
    text: p.label,
    fontSize: 16,
    fill: SECONDARY_SOFT,
    stroke: SECONDARY,
    roundness: { type: 3 },
    link: p.href,
  });
});

// Arrow from Start to each position.
POSITIONS.forEach((p) => {
  addArrow({ from: 'start', to: p.id, strokeColor: SECONDARY, strokeWidth: 1, withArrowhead: false });
});

// Gates — oxblood diamonds down the center. (Using rectangles here for
// legible multi-line text; switch `type: 'diamond'` if you prefer the
// classic decision-point shape — diamonds need bigger dimensions to fit
// two lines of label text.)
const gateCenterX = posCenterX;
GATES.forEach((g, i) => {
  addShape({
    id: g.id,
    type: 'rectangle',
    x: gateCenterX - GATE_W / 2,
    y: GATE_FIRST_Y + i * GATE_ROW_GAP,
    width: GATE_W,
    height: GATE_H,
    text: g.label,
    fontSize: 18,
    fill: PRIMARY,
    stroke: PRIMARY,
    textColor: PRIMARY_SOFT,
    roundness: { type: 3 },
  });
});

// Gate-to-gate trunk arrows, labeled "yes".
for (let i = 0; i < GATES.length - 1; i += 1) {
  addArrow({
    from: GATES[i].id,
    to: GATES[i + 1].id,
    label: 'yes',
    strokeColor: PRIMARY,
    strokeWidth: 3,
  });
}

// Position → first-gate arrows.
for (const [pId, gId] of Object.entries(ROUTES)) {
  if (gId === 'GG') continue; // handled below after GG exists
  addArrow({ from: pId, to: gId, strokeColor: PRIMARY, strokeWidth: 1.5 });
}

// Gospel gate — sibling branch on the right, same y as Gate 1.
const gospelX = gateCenterX + GOSPEL_OFFSET_X;
addShape({
  id: 'GG',
  type: 'rectangle',
  x: gospelX - GATE_W / 2,
  y: GOSPEL_Y,
  width: GATE_W,
  height: GATE_H,
  text: 'The gospel must\nprecede abolition.',
  fontSize: 18,
  fill: FOOTER,
  stroke: FOOTER,
  textColor: PRIMARY_SOFT,
  roundness: { type: 3 },
});
addArrow({ from: 'P7', to: 'GG', strokeColor: PRIMARY, strokeWidth: 1.5 });

// Terminals.
const faithfulY = GATE_FIRST_Y + GATES.length * GATE_ROW_GAP - 60;
addShape({
  id: 'T_FA',
  type: 'rectangle',
  x: gateCenterX - TERMINAL_W / 2,
  y: faithfulY,
  width: TERMINAL_W,
  height: TERMINAL_H,
  text: 'Faithful Abolitionist\nimmediate · total · biblical · active',
  fontSize: 18,
  fill: PRIMARY,
  stroke: GOLD,
  textColor: PRIMARY_SOFT,
  roundness: { type: 3 },
  link: '/pages/journey/next-steps/',
});
addArrow({
  from: GATES[GATES.length - 1].id,
  to: 'T_FA',
  strokeColor: PRIMARY,
  strokeWidth: 4,
});

const gospelTerminalY = GOSPEL_Y + GATE_ROW_GAP;
addShape({
  id: 'T_GOSPEL',
  type: 'rectangle',
  x: gospelX - TERMINAL_W / 2,
  y: gospelTerminalY,
  width: TERMINAL_W,
  height: TERMINAL_H,
  text: 'The gospel\nprecedes abolition',
  fontSize: 18,
  fill: FOOTER,
  stroke: SECONDARY,
  textColor: PRIMARY_SOFT,
  roundness: { type: 3 },
});
addArrow({ from: 'GG', to: 'T_GOSPEL', label: 'yes', strokeColor: PRIMARY, strokeWidth: 2 });
addArrow({
  from: 'T_GOSPEL',
  to: 'start',
  label: 'after conversion,\nre-enter',
  strokeColor: PRIMARY,
  strokeWidth: 1,
  dashed: true,
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
