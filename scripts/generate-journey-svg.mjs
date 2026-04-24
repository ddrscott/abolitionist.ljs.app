#!/usr/bin/env node
/**
 * Render web/public/journey-map.excalidraw → web/public/journey-map.svg.
 *
 * This exists so the runtime journey page doesn't have to load
 * @excalidraw/excalidraw (the viewer component). The file is authored
 * with `roughness: 0` everywhere and uses only four primitive element
 * types — rectangle, diamond, arrow, text — so a tiny hand-rolled
 * renderer is sufficient and avoids pulling Excalidraw into the build
 * pipeline. The `/draw/` editor still uses Excalidraw for authoring.
 *
 * Node 18+. No external deps. Idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'web/public/journey-map.excalidraw');
const OUT = path.join(ROOT, 'web/public/journey-map.svg');

const PAD = 40; // viewBox padding so strokes don't clip
const CORNER_RX = 8; // for rounded rectangles

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function elementBBox(el) {
  if (el.type === 'arrow') {
    const xs = el.points.map((p) => el.x + p[0]);
    const ys = el.points.map((p) => el.y + p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

function renderRect(el) {
  const rx = el.roundness ? CORNER_RX : 0;
  const fill = el.backgroundColor === 'transparent' ? 'none' : el.backgroundColor;
  return `<rect x="${el.x.toFixed(2)}" y="${el.y.toFixed(2)}" width="${el.width.toFixed(2)}" height="${el.height.toFixed(2)}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />`;
}

function renderDiamond(el) {
  // Vertices: top, right, bottom, left
  const { x, y, width: w, height: h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pts = `${cx.toFixed(2)},${y.toFixed(2)} ${(x + w).toFixed(2)},${cy.toFixed(2)} ${cx.toFixed(2)},${(y + h).toFixed(2)} ${x.toFixed(2)},${cy.toFixed(2)}`;
  const fill = el.backgroundColor === 'transparent' ? 'none' : el.backgroundColor;
  return `<polygon points="${pts}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />`;
}

function renderArrow(el, arrowMarkers) {
  // Register this color's arrowhead marker
  arrowMarkers.add(el.strokeColor);
  const markerId = `arrowhead-${el.strokeColor.replace('#', '')}`;
  const abs = el.points.map((p) => [el.x + p[0], el.y + p[1]]);
  const d = abs.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  const markerEnd = el.endArrowhead === 'arrow' ? ` marker-end="url(#${markerId})"` : '';
  const markerStart = el.startArrowhead === 'arrow' ? ` marker-start="url(#${markerId})"` : '';
  return `<path d="${d}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}"${markerEnd}${markerStart} />`;
}

function renderText(el) {
  // Dataset is uniform: all text is inside a container, center/middle aligned,
  // fontFamily 2 (Helvetica). The text bbox (el.x, el.y, el.width, el.height)
  // already accounts for multi-line wrapping — lines are split on "\n".
  const lines = String(el.text).split('\n');
  const cx = el.x + el.width / 2;
  const lineHeight = (el.lineHeight ?? 1.25) * el.fontSize;
  // Place first line's baseline so the block is vertically centered on el.y+el.h/2
  const blockHeight = lineHeight * lines.length;
  const cy = el.y + el.height / 2;
  const firstBaseline = cy - blockHeight / 2 + el.fontSize * 0.82;
  const tspans = lines
    .map((ln, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${cx.toFixed(2)}" dy="${dy.toFixed(2)}">${escape(ln)}</tspan>`;
    })
    .join('');
  return `<text x="${cx.toFixed(2)}" y="${firstBaseline.toFixed(2)}" text-anchor="middle" fill="${el.strokeColor}" font-family="Helvetica, Arial, sans-serif" font-size="${el.fontSize}">${tspans}</text>`;
}

function render() {
  const doc = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const elements = doc.elements.filter((e) => !e.isDeleted);

  // ViewBox — union bounding box of everything, plus padding.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    const bb = elementBBox(el);
    if (bb.x < minX) minX = bb.x;
    if (bb.y < minY) minY = bb.y;
    if (bb.x + bb.w > maxX) maxX = bb.x + bb.w;
    if (bb.y + bb.h > maxY) maxY = bb.y + bb.h;
  }
  minX -= PAD;
  minY -= PAD;
  maxX += PAD;
  maxY += PAD;
  const vbW = maxX - minX;
  const vbH = maxY - minY;

  const arrowMarkers = new Set();
  const bodyParts = [];
  for (const el of elements) {
    let snippet;
    switch (el.type) {
      case 'rectangle':
        snippet = renderRect(el);
        break;
      case 'diamond':
        snippet = renderDiamond(el);
        break;
      case 'arrow':
        snippet = renderArrow(el, arrowMarkers);
        break;
      case 'text':
        snippet = renderText(el);
        break;
      default:
        continue;
    }
    if (el.link) {
      // target="_top" breaks out of any embedding frame. rel prevents
      // tabnapping.
      snippet = `<a href="${escape(el.link)}" target="_top" rel="noopener">${snippet}</a>`;
    }
    bodyParts.push(snippet);
  }

  // Arrowhead markers (one per distinct stroke color used on arrows)
  const defs = [...arrowMarkers]
    .map(
      (c) =>
        `<marker id="arrowhead-${c.replace('#', '')}" viewBox="0 0 10 10" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="${c}" /></marker>`,
    )
    .join('');

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}" role="img" aria-label="Abolitionist reader journey flowchart">`,
    `<defs>${defs}</defs>`,
    ...bodyParts,
    `</svg>`,
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, svg);

  const linkCount = elements.filter((e) => e.link).length;
  console.log(`journey-svg: wrote ${OUT}`);
  console.log(`journey-svg:   elements=${elements.length}, links=${linkCount}, viewBox=${vbW.toFixed(0)}x${vbH.toFixed(0)}`);
}

render();
