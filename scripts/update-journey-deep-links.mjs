#!/usr/bin/env node
/**
 * One-shot: rewrite specific Read: node links in
 * web/public/journey-map.excalidraw to include #hash anchors so
 * clicking a node jumps straight to the relevant section. Anchor
 * IDs were verified against the built HTML (dist/pages/.../index.html)
 * and correspond to real <h2>/<h4> headings on those pages.
 *
 * Safe to re-run; idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const SRC = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../web/public/journey-map.excalidraw',
);

// id → new link (with or without hash). Only nodes listed here are
// touched; everything else stays as-is.
const UPDATES = {
  // --- FAQ deep links (7 nodes → 1 article, now jump to sections) ---
  R_D1a: '/pages/abolitionistsrising.com/faq/#thats-just-your-belief-that-life-begins-at-fertilizationconception-can-you-find-any-scientist-who-thinks-that',
  R_D1b: '/pages/abolitionistsrising.com/faq/#isnt-consciousness-what-makes-us-valuable',
  R_D2a: '/pages/abolitionistsrising.com/faq/#what-about-bodily-autonomy-what-about-my-body-my-choice',
  R_D2b: '/pages/abolitionistsrising.com/faq/#if-abortion-is-criminalized-wont-it-just-happen-in-less-safe-ways-unsafely',
  R_D3a: '/pages/abolitionistsrising.com/faq/#do-abolitionists-support-ivf',
  R_D7a: '/pages/abolitionistsrising.com/faq/#can-people-who-disagree-with-you-join-the-abolitionist-movement',
  R_D7b: '/pages/abolitionistsrising.com/faq/#since-not-everyone-is-a-christian-shouldnt-we-argue-against-abortion-from-a-secular-perspective',

  // --- Other multi-section articles ---
  R_D2c: '/pages/abolitionistsrising.com/biblical-not-secular/#where-they-conflict-obey-god-rather-than-man',
  R_D4b: '/pages/abolitionistsrising.com/no-exceptions/#the-child-whose-mother-is-in-danger',
  R_D4c: '/pages/abolitionistsrising.com/criminalization/#equal-protection-requires-equal-justice',
  R_D5a: '/pages/abolitionistsrising.com/immediatism/#abortion-cannot-be-abolished-by-allowing-it-all-along-the-way',
  R_D7c: '/pages/abolitionistsrising.com/norman-statement/#article-xi-the-gospel',
};

function main() {
  const doc = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  let touched = 0;
  for (const el of doc.elements) {
    if (!(el.id in UPDATES)) continue;
    const next = UPDATES[el.id];
    if (el.link === next) continue;
    el.link = next;
    el.version = (el.version ?? 0) + 1;
    el.versionNonce = Math.floor(Math.random() * 0x7fffffff);
    touched++;
    console.log(`  ${el.id} → ${next}`);
  }
  fs.writeFileSync(SRC, JSON.stringify(doc, null, 2) + '\n');
  console.log(`journey-deep-links: ${touched} updated`);
}

main();
