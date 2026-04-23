#!/usr/bin/env node
/**
 * Generate a starter Excalidraw diagram of the reader-journey map.
 *
 * Usage:
 *   node scripts/generate-journey-excalidraw.mjs
 *   → writes web/public/journey-map.excalidraw
 *
 * Then open /draw/ in the browser (in-app Excalidraw editor) or drag
 * the file onto excalidraw.com.
 *
 * ---------------------------------------------------------------------
 * Structure
 * ---------------------------------------------------------------------
 *
 *  Start terminator
 *         │
 *         ▼
 *  ┌───────────────┐       (yes, trunk cascade)
 *  │ D1 top diamond│──────────────────────────────► D2 top diamond ► ...
 *  └───────┬───────┘
 *          │ no
 *          ▼
 *     D1a drill ─(yes)─► R_D1a article rectangle
 *          │ no
 *          ▼
 *     D1b drill ─(yes)─► R_D1b
 *          │ no
 *          ▼
 *     D1c drill ─(yes)─► R_D1c
 *          │ no
 *          ▼
 *         D2 (next top; rejoin trunk)
 *
 * Each top's drill cascade runs DOWN a second column. Reads sit in a
 * third column to the right of their drill. YES at a drill sends the
 * reader to the targeted article; NO advances to the next drill. NO at
 * the last drill falls through to the next top. Top YES continues the
 * main trunk without visiting any drill.
 *
 * Data (FLOW[]) is authoritative. To add / change content, edit the
 * array below and rerun.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'web', 'public', 'journey-map.excalidraw');

// ---------------------------------------------------------------------------
// AR palette — same tokens used by the site.
const PRIMARY       = '#430607'; // oxblood
const PRIMARY_SOFT  = '#FDE8E8'; // text on oxblood
const SECONDARY     = '#C49A6E'; // tan hairline
const SECONDARY_SOFT= '#F8F2ED'; // cream fill
const TERTIARY      = '#CC3206'; // rust — yes-branch arrows
const GOLD          = '#FFC10A'; // fire-CTA border
const INK           = '#000000';
const PAPER         = '#FFFFFF';

// ---------------------------------------------------------------------------
// Layout geometry.
const COL_TRUNK = 100;   // top-assertion column (diamond TL corner)
const COL_DRILL = 540;   // sub-drill column
const COL_READ  = 980;   // article-to-read column

const DECISION_W = 280;
const DECISION_H = 180;
const ARTICLE_W  = 320;
const ARTICLE_H  = 120;
const TERMINAL_W = 320;
const TERMINAL_H = 100;

const TOP_TO_FIRST_DRILL = 240; // y distance from top.y to first drill.y
const DRILL_STEP         = 220; // y distance between successive drills
const TOP_GAP            = 120; // y distance from last drill bottom to next top
const START_Y            = 0;
const FIRST_TOP_Y        = 180;

// ---------------------------------------------------------------------------
// FLOW — 7 top propositions, variable drill counts.
// Each path runs Top → Drill → Read (YES) OR Top → Drill → next Drill (NO).
// After the last drill of a cluster, NO falls through to the next top.
// Every article href points at a file that actually exists in pages/.

const FLOW = [
  // ─── 1. Preborn is a human being ───────────────────────────────
  {
    id: 'D1',
    question: 'The preborn child is a\nhuman being from the\nmoment of conception',
    drills: [
      {
        id: 'D1a',
        question: 'Is it because the scientific\nconsensus on when life begins\nis actually unclear?',
        read: {
          id: 'R_D1a',
          label: "Read: FAQ §2 — 'That's\njust your belief'\n(embryology citations)",
          href: '/pages/abolitionistsrising.com/faq/',
        },
      },
      {
        id: 'D1b',
        question: 'Is it because personhood\nbegins at viability,\nheartbeat, or sentience\n— not conception?',
        read: {
          id: 'R_D1b',
          label: 'Read: FAQ §2 —\narbitrary thresholds',
          href: '/pages/abolitionistsrising.com/faq/',
        },
      },
      {
        id: 'D1c',
        question: "Is it because Christ's\nincarnation at conception\nhas no bearing on\npreborn personhood?",
        read: {
          id: 'R_D1c',
          label: "Read: Jesus' Incarnation\nis the Death Knell\nto Abortion",
          href: '/pages/freethestates.org/jesus-incarnation-is-the-death-knell-to-abortion/',
        },
      },
    ],
  },

  // ─── 2. Equal right to life + legal protection ────────────────
  {
    id: 'D2',
    question: 'Every human being has\nequal right to life and\nlegal protection from\nconception onward',
    drills: [
      {
        id: 'D2a',
        question: "Is it because the mother's\nbodily autonomy overrides\nthe child's right to life?",
        read: {
          id: 'R_D2a',
          label: 'Read: FAQ §2 —\nbodily autonomy +\norgan donation rebuttal',
          href: '/pages/abolitionistsrising.com/faq/',
        },
      },
      {
        id: 'D2b',
        question: 'Is it because banning\nabortion would cause\nmore maternal deaths\nfrom unsafe abortions?',
        read: {
          id: 'R_D2b',
          label: "Read: FAQ §2 —\n'won't criminalization\nmake abortions unsafe?'",
          href: '/pages/abolitionistsrising.com/faq/',
        },
      },
      {
        id: 'D2c',
        question: 'Is it because the state\nhas no business\nlegislating morality?',
        read: {
          id: 'R_D2c',
          label: 'Read: Biblical, Not Secular\n— on authority, law,\nand public moral claims',
          href: '/pages/abolitionistsrising.com/biblical-not-secular/',
        },
      },
    ],
  },

  // ─── 3. Every means of preborn killing ─────────────────────────
  {
    id: 'D3',
    question: 'Every means of preborn\nkilling — IVF, abortifacient\ncontraceptives, chemical\nabortion, surgical abortion\n— carries equal moral weight',
    drills: [
      {
        id: 'D3a',
        question: 'Is it because IVF is\nmorally distinct — its goal\nis creating new life,\nnot ending it?',
        read: {
          id: 'R_D3a',
          label: 'Read: FAQ §1 — Do\nabolitionists support IVF?\n+ Weeping Time Documentary',
          href: '/pages/abolitionistsrising.com/faq/',
        },
      },
      {
        id: 'D3b',
        question: 'Is it because hormonal\ncontraceptives and IUDs\nprevent fertilization\nrather than kill after it?',
        read: {
          id: 'R_D3b',
          label: 'Read: National Right to Life\nPro-Abortion (Oklahoma SB 834)\n— abortifacient BC explained',
          href: '/pages/freethestates.org/national-right-to-life-pro-abortion-oklahoma-sb-834/',
        },
      },
      {
        id: 'D3c',
        question: 'Is it because chemical\n(pill) abortion is less\nsevere than surgical?',
        read: {
          id: 'R_D3c',
          label: "Read: Rep. John Talley —\n'we already have enough\nabortion laws'",
          href: '/pages/freethestates.org/rep-john-talley-r-keep-abortion-legal-because-we-have-enough-abortion-laws/',
        },
      },
    ],
  },

  // ─── 4. No exceptions ──────────────────────────────────────────
  {
    id: 'D4',
    question: 'No circumstance — rape,\nincest, fetal abnormality,\nor maternal life — justifies\nintentionally killing\na preborn child',
    drills: [
      {
        id: 'D4a',
        question: 'Is it because a child\nconceived through rape\nor incest may be\ntreated differently?',
        read: {
          id: 'R_D4a',
          label: 'Read: No Exceptions +\nA Mother is a Magistrate\n— why duress is no defense',
          href: '/pages/abolitionistsrising.com/no-exceptions/',
        },
      },
      {
        id: 'D4b',
        question: 'Is it because ending the\npregnancy can be justified\nto save the mother\'s life?',
        read: {
          id: 'R_D4b',
          label: 'Read: No Exceptions —\nthe medical case and the\nkilling / letting-die distinction',
          href: '/pages/abolitionistsrising.com/no-exceptions/',
        },
      },
      {
        id: 'D4c',
        question: 'Is it because a mother\nwho procures an abortion\nshould not face legal\naccountability at all?',
        read: {
          id: 'R_D4c',
          label: 'Read: Criminalization —\nequal protection under law',
          href: '/pages/abolitionistsrising.com/criminalization/',
        },
      },
      {
        id: 'D4d',
        question: 'Is it because holding\nwomen legally accountable\nis cruel, unmerciful,\nor unloving?',
        read: {
          id: 'R_D4d',
          label: 'Read: Abolitionists Must\nStand Firm to Oppose\nMurder, Love Murderers',
          href: '/pages/abolitionistsrising.com/abolitionists-must-stand-firm-to-oppose-murder-love-murderers/',
        },
      },
    ],
  },

  // ─── 5. Immediate and total abolition ──────────────────────────
  {
    id: 'D5',
    question: 'Only immediate and total\nabolition of abortion is\njust — not incremental\nrestrictions or compromises',
    drills: [
      {
        id: 'D5a',
        question: 'Is it because incremental\nlaws save SOME lives\nand some is better\nthan none?',
        read: {
          id: 'R_D5a',
          label: "Read: Immediatism —\nGarrison and Heyrick on\nthe logic of 'some' vs. 'all'",
          href: '/pages/abolitionistsrising.com/immediatism/',
        },
      },
      {
        id: 'D5b',
        question: 'Is it because total\nabolition is politically\nimpossible to pass\nin the near term?',
        read: {
          id: 'R_D5b',
          label: "Read: Kristan Hawkins'\nFlawed Reasoning\nvs. Scripture",
          href: '/pages/abolitionistsrising.com/kristan-hawkins-flawed-reasoning-vs-scripture/',
        },
      },
      {
        id: 'D5c',
        question: 'Is it because pro-life\norganizations and SBC\nseminaries endorse\ngradualism?',
        read: {
          id: 'R_D5c',
          label: 'Read: Against Pro-Life\nCompromise + Abolitionist,\nNot Pro-Life',
          href: '/pages/freethestates.org/against-pro-life-compromise-responding-to-denny-burk-andrew-walker-et-al/',
        },
      },
      {
        id: 'D5d',
        question: 'Is it because Dobbs\n(2022) already ended\nmost abortions\nin America?',
        read: {
          id: 'R_D5d',
          label: "Read: 4 Abolitionist Rapid\nReactions to Dobbs + FAQ\n'Was Dobbs a step in the\nright direction?'",
          href: '/pages/freethestates.org/4-abolitionist-rapid-reactions-to-the-wrongly-decided-dobbs-decision/',
        },
      },
    ],
  },

  // ─── 6. Active Christian obedience ─────────────────────────────
  {
    id: 'D6',
    question: 'Every Christian is called\nto active obedience against\nabortion — belief or prayer\nalone is insufficient',
    drills: [
      {
        id: 'D6a',
        question: 'Is it because abolition\nactivism is a special\ncalling for some\nChristians, not all?',
        read: {
          id: 'R_D6a',
          label: 'Read: All About the Church\n— every member,\nnot a specialized caste',
          href: '/pages/freethestates.org/all-about-the-church/',
        },
      },
      {
        id: 'D6b',
        question: 'Is it because intercession\nand financial giving\nfulfill the duty?',
        read: {
          id: 'R_D6b',
          label: 'Read: Stay Steeped in Prayer\n— prayer as source,\nnot substitute, of action',
          href: '/pages/abolitionistsrising.com/stay-steeped-in-prayer-as-you-seek-to-abolish-abortion/',
        },
      },
      {
        id: 'D6c',
        question: 'Is it because consistent\npro-life voting alone\nis sufficient Christian\nwitness?',
        read: {
          id: 'R_D6c',
          label: 'Read: How Shall an\nAbolitionist Vote +\nFruits of Abolitionism',
          href: '/pages/abolitionistsrising.com/how-shall-an-abolitionist-vote/',
        },
      },
      {
        id: 'D6d',
        question: 'Is it because voting\nRepublican — even for\nmixed candidates like Trump\n— is faithful witness?',
        read: {
          id: 'R_D6d',
          label: 'Read: Christians Could\nForce Trump + Why Voting\nfor a Pro-Abortion\nCandidate Is a Sin',
          href: '/pages/abolitionistsrising.com/christians-could-force-trump-to-be-an-abolitionist-of-abortion-with-merely-a-lift-of-the-finger-youdonthavemyvoteyet/',
        },
      },
    ],
  },

  // ─── 7. Gospel-centered ────────────────────────────────────────
  {
    id: 'D7',
    question: 'The gospel of Jesus Christ\nis central to the abolition\nof abortion — secular moral\nreasoning is not sufficient',
    drills: [
      {
        id: 'D7a',
        question: 'Is it because shared\nopposition to abortion\nis sufficient common\nground for partnership?',
        read: {
          id: 'R_D7a',
          label: "Read: FAQ §1 — 'Can\nPeople Who Disagree with\nYou Join the Movement?'",
          href: '/pages/abolitionistsrising.com/faq/',
        },
      },
      {
        id: 'D7b',
        question: 'Is it because secular\narguments persuade a\nwider audience more\neffectively?',
        read: {
          id: 'R_D7b',
          label: "Read: FAQ §1 —\n'Shouldn't we argue from\na secular perspective?'\n(Garrison quote)",
          href: '/pages/abolitionistsrising.com/faq/',
        },
      },
      {
        id: 'D7c',
        question: 'Is it because the movement\nshould not require a\ntheological confessional\ntest?',
        read: {
          id: 'R_D7c',
          label: 'Read: Norman Statement\nArticle XI + Theological\nFoundations',
          href: '/pages/abolitionistsrising.com/norman-statement/',
        },
      },
      {
        id: 'D7d',
        question: 'Is it because abolitionist\nrhetoric toward pro-life\nleaders is too divisive,\nharsh, or unloving?',
        read: {
          id: 'R_D7d',
          label: 'Read: Why Do Pro-Lifers\nDespise Abolitionists\n+ Abolitionists Must\nStand Firm',
          href: '/pages/freethestates.org/why-do-pro-lifers-despise-abolitionists/',
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Excalidraw element helpers — id, seed, version boilerplate.

let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}
function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
let zIndex = 0;
function indexAt() {
  const i = zIndex++;
  return `a${i.toString().padStart(3, '0')}`;
}

let elements = [];

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
    roughness: 0,
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
    index: indexAt(),
    customData: null,
    frameId: null,
    groupIds: [],
  };
}

// Bound-text element centered inside `container`. Excalidraw does NOT
// auto-place bound text — you have to set x/y/width/height to position
// it within the container explicitly.
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
    fontFamily: 2, // Helvetica — reliably rendered, no font-file roundtrip
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
    id, type, x, y, width, height,
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

// Pick the edge-midpoint on `shape` facing `(tx, ty)`.
function edgePointToward(shape, tx, ty) {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: shape.x + shape.width, y: cy }
      : { x: shape.x, y: cy };
  }
  return dy > 0
    ? { x: cx, y: shape.y + shape.height }
    : { x: cx, y: shape.y };
}

function addArrow({ from, to, label, dashed = false, strokeColor = INK, strokeWidth = 2, withArrowhead = true }) {
  const src = elements.find((e) => e.id === from);
  const tgt = elements.find((e) => e.id === to);
  if (!src || !tgt) throw new Error(`addArrow: missing endpoint (${from} → ${to})`);
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
    id, type: 'arrow',
    x: sp.x, y: sp.y,
    width: Math.abs(dx), height: Math.abs(dy),
    strokeColor, strokeWidth,
    strokeStyle: dashed ? 'dashed' : 'solid',
    backgroundColor: 'transparent',
    boundElements: [],
  });
  a.points = [[0, 0], [dx, dy]];
  a.lastCommittedPoint = null;
  a.startBinding = { elementId: from, focus: 0, gap: 4 };
  a.endBinding   = { elementId: to,   focus: 0, gap: 4 };
  a.startArrowhead = null;
  a.endArrowhead = withArrowhead ? 'arrow' : null;
  a.elbowed = false;
  elements.push(a);

  // Mirror the binding onto the source/target boundElements.
  for (const refId of [from, to]) {
    const ref = elements.find((e) => e.id === refId);
    if (ref) {
      ref.boundElements = ref.boundElements ?? [];
      ref.boundElements.push({ type: 'arrow', id });
    }
  }

  if (label) {
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
        backgroundColor: '#FFFFFF',
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

// START terminator.
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

// Iterate the flow, laying out each top and its drill cascade. The y
// cursor advances by each section's required height.
let cursor = FIRST_TOP_Y;
const topYAt = {};
const lastDrillYAt = {};

for (const top of FLOW) {
  const topY = cursor;
  topYAt[top.id] = topY;

  // Top diamond.
  addShape({
    id: top.id,
    type: 'diamond',
    x: COL_TRUNK,
    y: topY,
    width: DECISION_W,
    height: DECISION_H,
    text: top.question,
    fontSize: 14,
    fill: PRIMARY,
    stroke: PRIMARY,
    textColor: PRIMARY_SOFT,
  });

  // Drill cascade down the second column.
  let drillY = topY + TOP_TO_FIRST_DRILL;
  top.drills.forEach((drill, di) => {
    addShape({
      id: drill.id,
      type: 'diamond',
      x: COL_DRILL,
      y: drillY,
      width: DECISION_W,
      height: DECISION_H,
      text: drill.question,
      fontSize: 14,
      fill: PRIMARY,
      stroke: PRIMARY,
      textColor: PRIMARY_SOFT,
    });
    // Read rectangle in the third column, vertically centered on drill.
    addShape({
      id: drill.read.id,
      type: 'rectangle',
      x: COL_READ,
      y: drillY + (DECISION_H - ARTICLE_H) / 2,
      width: ARTICLE_W,
      height: ARTICLE_H,
      text: drill.read.label,
      fontSize: 13,
      fill: SECONDARY_SOFT,
      stroke: SECONDARY,
      roundness: { type: 3 },
      link: drill.read.href,
    });
    if (di < top.drills.length - 1) drillY += DRILL_STEP;
  });
  lastDrillYAt[top.id] = drillY;

  cursor = drillY + DECISION_H + TOP_GAP;
}

// Final terminator ("Faithful Abolitionist").
addShape({
  id: 'T_FA',
  type: 'rectangle',
  x: trunkCX - TERMINAL_W / 2,
  y: cursor,
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

// ---------------------------------------------------------------------------
// Arrows.

addArrow({ from: 'start', to: FLOW[0].id, strokeColor: PRIMARY, strokeWidth: 2 });

FLOW.forEach((top, i) => {
  const nextTopId = FLOW[i + 1] ? FLOW[i + 1].id : 'T_FA';

  // Top YES → next top (main trunk)
  addArrow({
    from: top.id,
    to: nextTopId,
    label: 'yes',
    strokeColor: PRIMARY,
    strokeWidth: 3,
  });
  // Top NO → first drill
  addArrow({
    from: top.id,
    to: top.drills[0].id,
    label: 'no',
    strokeColor: PRIMARY,
    strokeWidth: 2,
  });

  top.drills.forEach((drill, di) => {
    // Drill YES → targeted read (rust)
    addArrow({
      from: drill.id,
      to: drill.read.id,
      label: 'yes',
      strokeColor: TERTIARY,
      strokeWidth: 2,
    });
    // Drill NO → next drill, or fall through to next top
    const noTarget = top.drills[di + 1] ? top.drills[di + 1].id : nextTopId;
    addArrow({
      from: drill.id,
      to: noTarget,
      label: 'no',
      strokeColor: PRIMARY,
      strokeWidth: 2,
      dashed: di === top.drills.length - 1, // fall-through looks dashed
    });
  });
});

// ---------------------------------------------------------------------------

const doc = {
  type: 'excalidraw',
  version: 2,
  source: 'https://abolitionist.ljs.app/draw',
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
