# Reader Journey Guide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual map + seven curated reading paths that guide a reader from their current value system into the "faithful abolitionist" position the corpus defines.

**Architecture:** New content under `docs/journey/*.mdx` — one map page and seven reading-path pages. Uses the existing Fumadocs + R2 + AI Search pipeline without new infrastructure. Each reading path is a linear itinerary through the existing 207-article corpus with a short framing wrapper around each citation. Mermaid renders the map via a Fumadocs MDX component.

**Tech Stack:** Fumadocs MDX, Mermaid (via `fumadocs-ui/components/mermaid` or a remark plugin), existing Next.js static export, existing Cloudflare Worker.

**Why this shape (decisions made in brainstorming):**
- `docs/journey/` and not a separate collection → `sync_to_r2.sh` already finds it (`find -mindepth 2 -maxdepth 2`), the Fumadocs glob (`*/*.md`) already picks it up, and `category-tree.ts` groups it automatically via `categories` frontmatter. Zero engineering to wire into sidebar + RAG.
- `.mdx` (not `.md`) for journey pages → lets us use a `<Mermaid>` component. The extractor keeps writing `.md` for corpus articles. Glob extends to `*/*.{md,mdx}`.
- Paths are linear itineraries (not decision trees) → the doctrinal content already exists in the 207 articles. We're writing *connective tissue*, not re-arguing the theology. A path page is ~200–400 words of our voice + 3–6 ordered article links.
- "No ecumenical partnership" per FAQ → the atheist/non-Christian-anti-abortion path terminates at repentance + gospel, not at "you are an abolitionist." This is a doctrinal constraint, not an editorial choice.

**Scope (explicitly out):**
- No interactive decision-tree component (rejected option B)
- No homepage redesign beyond adding a single prominent CTA above the chat box
- No changes to the extractor, the corpus, or the category-tree logic

**Note on TDD:** This plan is content-heavy. Most tasks produce prose, not testable logic. The engineering tasks (Mermaid rendering, CTA) are small enough that their "test" is `pnpm dev` + visual inspection at a known URL. Don't force-fit unit tests where they don't belong; each content task has an explicit "verify" step instead.

---

## File Structure

**New files:**
- `docs/journey/index.mdx` — map page with Mermaid flowchart
- `docs/journey/start-here.mdx` — brief self-assessment routing readers into a path
- `docs/journey/path-secular-pro-choice.mdx`
- `docs/journey/path-christian-pro-choice.mdx`
- `docs/journey/path-personally-opposed.mdx`
- `docs/journey/path-pro-life-with-exceptions.mdx`
- `docs/journey/path-pro-life-incrementalist.mdx`
- `docs/journey/path-apathetic-christian.mdx`
- `docs/journey/path-anti-abortion-non-christian.mdx`
- `docs/journey/next-steps.mdx` — what to do once you agree

**Modified files:**
- `web/source.config.ts` — extend glob from `*/*.md` to `*/*.{md,mdx}`
- `web/mdx-components.tsx` — register the `<Mermaid>` component
- `web/app/(home)/page.tsx` — add the journey CTA above the chat box
- `scripts/sync_to_r2.sh` — adjust the find pattern to include `.mdx` (currently hardcoded to `-name '*.md'`)
- `web/components/chat-box.tsx` — widen citation regex from `/\.md$/i` to `/\.mdx?$/i` (two occurrences at ~L38 and ~L44) so RAG citations into journey pages resolve correctly

**Dependencies to add:**
- A Mermaid rendering library. Options in Task 2.

---

## Task 0: Create the content home + minimal routing

**Files:**
- Create: `docs/journey/index.mdx` (placeholder for now)
- Modify: `web/source.config.ts:34`
- Modify: `scripts/sync_to_r2.sh:32`
- Modify: `web/components/chat-box.tsx:38,44` (regex widening — see Step 3b)

- [ ] **Step 1: Write a minimal index page so Fumadocs has something to serve**

Create `docs/journey/index.mdx`:

```mdx
---
title: Reader Journey
slug: index
source_site: abolitionist.ljs.app
content_type: page
categories: ["Reader Journey"]
excerpt: A guided path from where you are to faithful abolitionism.
---

# Reader Journey

(Placeholder — this page will hold the map flowchart. See other pages in this section for reading paths.)
```

- [ ] **Step 2: Extend the Fumadocs glob to include `.mdx`**

Edit `web/source.config.ts`, change:

```ts
    files: ['*/*.md'],
```

to:

```ts
    files: ['*/*.{md,mdx}'],
```

- [ ] **Step 3: Extend the R2 sync glob to include `.mdx`**

Edit `scripts/sync_to_r2.sh`, change:

```bash
mapfile -t files < <(find "$DOCS_DIR" -mindepth 2 -maxdepth 2 -name '*.md' | sort)
```

to:

```bash
mapfile -t files < <(find "$DOCS_DIR" -mindepth 2 -maxdepth 2 \( -name '*.md' -o -name '*.mdx' \) | sort)
```

- [ ] **Step 3b: Widen the chat-box citation regex to strip `.mdx` too**

The AI Search chat citations arrive as R2 keys like `journey/index.mdx`. `web/components/chat-box.tsx` strips `.md` via `/\.md$/i` at two locations (~L38 and ~L44). Without this fix, any chat citation that lands on a journey page produces a broken `/docs/journey/index.mdx` URL.

Edit `web/components/chat-box.tsx`. Change both occurrences:

```ts
  const slug = filename.replace(/\.md$/i, '');
```

to:

```ts
  const slug = filename.replace(/\.mdx?$/i, '');
```

and:

```ts
  const base = filename.replace(/\.md$/i, '').split('/').pop() ?? filename;
```

to:

```ts
  const base = filename.replace(/\.mdx?$/i, '').split('/').pop() ?? filename;
```

Leave the leading comment at L8 alone — the R2 key format comment remains accurate; only the regex needs widening.

- [ ] **Step 4: Verify Fumadocs picks up the new page**

Run from `web/`:

```bash
pnpm dev
```

Open `http://localhost:3000/docs/journey` — expect the placeholder page to render and a new "Reader Journey (1)" folder to appear in the sidebar. If it doesn't appear, check that `postinstall` ran (`pnpm install` to retrigger `fumadocs-mdx`).

- [ ] **Step 5: Commit**

```bash
git add docs/journey/index.mdx web/source.config.ts scripts/sync_to_r2.sh web/components/chat-box.tsx
git commit -m "feat(journey): scaffold journey content directory + .mdx support"
```

---

## Task 1: Audit the full corpus and lock the question tree

**Files:**
- Create: `plans/2026-04-22-journey-question-tree.md` (design doc, not committed to site — reference material for tasks 3–9)

This is the highest-leverage task. Every later task depends on the question tree being right. Do not skip or skim.

- [ ] **Step 1: Read these 12 articles in full, in order**

From `docs/abolitionistsrising.com/`:

1. `abolitionism101.md` (foundation)
2. `abolitionist-not-pro-life.md` (the core distinction)
3. `immediatism.md` (strategy objection: gradualism)
4. `biblical-not-secular.md` (authority objection: why not just secular arguments)
5. `no-exceptions.md` (exceptions objection: rape, incest, disability, mother's life)
6. `norman-statement.md` (the movement's doctrinal statement — the destination)
7. `theology.md`
8. `criminalization.md` (including prosecuting mothers — a hard gate)
9. `a-mother-is-a-magistrate-why-duress-is-no-defense-for-abortion.md`
10. `faq.md` (already organized by starting worldview — mine it for objection→answer mappings)
11. `fruits-of-abolitionism-is-true-repentance-necessary.md`
12. `kristan-hawkins-flawed-reasoning-vs-scripture.md` (the Students for Life critique)

From `docs/freethestates.org/`:

13. `against-pro-life-compromise-responding-to-denny-burk-andrew-walker-et-al.md`
14. `affirmations-and-denials-regarding-abolitionist-terms-and-other-controversial-subjects.md`
15. `all-about-the-church.md`

- [ ] **Step 2: Draft the question tree**

Write the draft to `plans/2026-04-22-journey-question-tree.md`. The tree should have:

- **Seven entry nodes** (the starting value systems):
  1. Secular pro-choice
  2. Christian pro-choice / progressive Christian
  3. "Personally opposed" moderate
  4. Pro-life with exceptions (rape, incest, mother's life)
  5. Pro-life incrementalist (agrees in principle, defends "small wins")
  6. Apathetic Christian (thinks abortion is wrong, doesn't engage)
  7. Anti-abortion non-Christian (Muslim, atheist, Catholic — per FAQ gets its own path that terminates at the gospel, not at "you're an abolitionist")

- **Six decision gates** (the commitments, in order):
  1. Is abortion the unjust killing of a human being? (anthropology)
  2. By what authority do we make this claim? (Scripture vs. polling/court/pragmatism)
  3. Is "less iniquity" acceptable when true abolition is available? (immediatism)
  4. Are exceptions acceptable? (no-exceptions)
  5. Is it enough to believe, or must the church act? (obligation)
  6. How does action manifest? (moral suasion, magistrate engagement, voting, criminalization)

- **One terminal node:** "Faithful abolitionist" — commitments + next steps.

For each entry node, map which gates they need to cross (not all paths cross all gates in the same order). For each gate, list the 2–4 articles that best address it.

- [ ] **Step 3: Verify the tree against the corpus**

For each of the seven entry nodes, sanity-check by asking: "If someone at this starting point read the articles I mapped, in this order, would they arrive at the destination?" Walk it in your head. If a path feels like it skips a step, go back to the articles and add the missing link.

- [ ] **Step 4: Commit the design doc**

```bash
git add plans/2026-04-22-journey-question-tree.md
git commit -m "docs: lock question tree for reader journey guide"
```

No site-visible changes in this task. This is the blueprint the remaining tasks build from.

---

## Task 2: Wire up Mermaid rendering

**Files:**
- Modify: `web/package.json` (new dependency)
- Modify: `web/mdx-components.tsx`

Fumadocs does not ship Mermaid support out of the box. Two options, ordered by preference:

- **Option A (preferred):** Install `mermaid` + use Fumadocs's client-side pattern — a small client component that calls `mermaid.render()` in a `useEffect`. Wrap it as `<Mermaid>` in `mdx-components.tsx` so `<Mermaid chart="...">` works in any `.mdx` file.
- **Option B:** Use a remark plugin like `remark-mermaidjs`. Simpler markup (just ```` ```mermaid ```` fences) but adds a build-time dependency and makes the output less controllable.

Go with Option A. SSG-friendly (renders at `useEffect` on the client; graceful fallback to `<pre>` on the server) and doesn't touch the build pipeline.

- [ ] **Step 1: Install mermaid**

From `web/`:

```bash
pnpm add mermaid
```

- [ ] **Step 2: Create the Mermaid client component**

Create `web/components/mermaid.tsx`:

```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
      });
      try {
        const { svg } = await mermaid.render(`m-${id}`, chart);
        if (!cancelled) setSvg(svg);
      } catch (err) {
        if (!cancelled) setSvg(`<pre>${String(err)}</pre>`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <div
      ref={ref}
      className="not-prose my-6 overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-4"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? null : <pre className="text-xs text-fd-muted-foreground">{chart}</pre>}
    </div>
  );
}
```

- [ ] **Step 3: Register Mermaid in `mdx-components.tsx`**

Read `web/mdx-components.tsx`, then edit it to add the `Mermaid` component to the components passed to MDX:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/components/mermaid';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Mermaid,
    ...components,
  };
}
```

(If the existing file has a different shape, preserve its structure and just add the `Mermaid` import + entry.)

- [ ] **Step 4: Smoke-test Mermaid**

Temporarily add a Mermaid block to `docs/journey/index.mdx`:

```mdx
<Mermaid chart={`graph TD
  A[Start] --> B{Is abortion the unjust killing of a human?}
  B -->|No| C[Read: Abolitionist, Not Pro-Life]
  B -->|Yes| D[Continue to authority question]
`} />
```

Run `pnpm dev` and load `/docs/journey`. Expect a rendered flowchart on the page. If it renders, proceed. If it doesn't, check browser console for Mermaid init errors.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/components/mermaid.tsx web/mdx-components.tsx docs/journey/index.mdx
git commit -m "feat(journey): render Mermaid diagrams in MDX pages"
```

---

## Task 3: Write the map page

**Files:**
- Modify: `docs/journey/index.mdx`

This page is the visual overview. Short prose + a single Mermaid flowchart + links into each of the seven path pages.

- [ ] **Step 1: Rewrite `docs/journey/index.mdx` with the full map**

Replace the placeholder. Use this exact frontmatter + structure (fill in the flowchart from the question tree produced in Task 1):

```mdx
---
title: Start Here - Your Reader Journey
slug: index
source_site: abolitionist.ljs.app
content_type: page
categories: ["Reader Journey"]
excerpt: A guided path from your current view of abortion to faithful abolitionism.
---

# Start Here

This site exists for one reason: to help you see that abortion is the murder of a human being made in the image of God, and to walk you from wherever you stand today into the position that abortion must be abolished immediately, totally, and in the name of Jesus Christ.

We are not trying to win a debate. We are asking you to let Scripture come into conflict with whatever you currently believe about this subject.

## Find your starting point

Pick the description that fits you best. Each path is a short reading order through this archive — three to six articles, in the order that will make the next one make sense.

<Mermaid chart={`graph TD
  S([Where are you now?])
  S --> P1[I support legal abortion]
  S --> P2[I'm a Christian but pro-choice]
  S --> P3[I'm personally opposed<br/>but don't want it illegal]
  S --> P4[Pro-life with exceptions<br/>rape / incest / mother's life]
  S --> P5[Pro-life incrementalist<br/>'small wins matter']
  S --> P6[I know it's wrong<br/>but I don't do anything]
  S --> P7[I oppose abortion<br/>but I'm not a Christian]

  P1 --> G1
  P2 --> G2
  P3 --> G1
  P4 --> G4
  P5 --> G3
  P6 --> G5
  P7 --> GOSPEL

  G1{Is abortion the<br/>killing of a human?}
  G2{By what authority<br/>do you decide?}
  G3{Is 'less iniquity'<br/>acceptable?}
  G4{Do exceptions<br/>betray the principle?}
  G5{Is belief without action<br/>sufficient?}

  G1 --> G2
  G2 --> G3
  G3 --> G4
  G4 --> G5
  G5 --> FA

  FA([Faithful abolitionist:<br/>immediate, total, biblical, active])
  GOSPEL([The gospel precedes abolition])
  GOSPEL --> FA

  classDef entry fill:#fef3c7,stroke:#92400e
  classDef gate fill:#e0e7ff,stroke:#3730a3
  classDef terminal fill:#dcfce7,stroke:#166534
  class P1,P2,P3,P4,P5,P6,P7 entry
  class G1,G2,G3,G4,G5 gate
  class FA,GOSPEL terminal
`} />

## The seven paths

- **[I support legal abortion](/docs/journey/path-secular-pro-choice)** — the full journey, starting with whether the preborn child is a human being.
- **[I'm a Christian but pro-choice](/docs/journey/path-christian-pro-choice)** — where Scripture and your current position conflict.
- **[I'm personally opposed but don't want it illegal](/docs/journey/path-personally-opposed)** — why "you can't legislate morality" is a category error.
- **[I'm pro-life but support exceptions](/docs/journey/path-pro-life-with-exceptions)** — the rape/incest/mother's-life objections addressed directly.
- **[I'm pro-life and support incremental laws](/docs/journey/path-pro-life-incrementalist)** — the heaviest lift in the archive, and the path the movement exists to challenge.
- **[I know abortion is wrong but I'm not doing anything](/docs/journey/path-apathetic-christian)** — why belief without action is the church's great sin on this matter.
- **[I oppose abortion but I'm not a Christian](/docs/journey/path-anti-abortion-non-christian)** — read this first. The gospel is not optional.

## When you've arrived

When you agree that abortion is the murder of a human being and must be abolished immediately, totally, and by the authority of Scripture — **[read the next steps](/docs/journey/next-steps).**
```

- [ ] **Step 2: Render and verify**

Run `pnpm dev`, open `/docs/journey`. Expect:
- Page title "Start Here – Your Reader Journey"
- Intro paragraph
- Rendered Mermaid flowchart (seven colored entry nodes, five gates, two terminal nodes)
- Seven bullet links to the path pages (these will 404 until later tasks create them — that's expected)
- Link to next-steps

If the Mermaid fails to render, do NOT debug it here — go back to Task 2 and fix it there, then come back.

- [ ] **Step 3: Commit**

```bash
git add docs/journey/index.mdx
git commit -m "feat(journey): write the map page with visual flowchart"
```

---

## Task 4: Build the reusable reading-path template (dogfood it with path-pro-life-with-exceptions)

**Files:**
- Create: `docs/journey/path-pro-life-with-exceptions.mdx`

This is the second-most-common reader (after incrementalist) and has clean source material (`no-exceptions.md`, `kristan-hawkins-flawed-reasoning-vs-scripture.md`, FAQ "What about rape and incest?"). It establishes the template the other six pages will copy.

- [ ] **Step 1: Write `docs/journey/path-pro-life-with-exceptions.mdx`**

```mdx
---
title: If You Are Pro-Life But Support Exceptions
slug: path-pro-life-with-exceptions
source_site: abolitionist.ljs.app
content_type: page
categories: ["Reader Journey"]
excerpt: Why exceptions for rape, incest, and the mother's life betray the very principle they claim to defend.
---

# If You Are Pro-Life But Support Exceptions

## You are likely here if you believe

- Abortion is generally wrong, but it should be legal in cases of rape or incest.
- If the mother's life is in danger, abortion must be an option.
- A child with a severe disability might be mercifully aborted.
- You don't want to force a rape victim to carry her attacker's child.

## The question your position cannot answer

If the preborn child is a human being — and we both agree they are — then an exception for rape means we believe it is just to kill an innocent human being for the crime of his or her father. An exception for disability means we believe some human lives are worth less than others. An exception for the mother's life assumes a dilemma that modern medicine and honest examination almost never produce.

An exception is not a compromise. It is a denial of the principle.

## Read in this order

1. **[No Exceptions](/docs/abolitionistsrising.com/no-exceptions)** — the case that exceptions are morally incoherent given what we both agree the child is.
2. **[FAQ — "What about rape and incest?"](/docs/abolitionistsrising.com/faq)** — the direct answer to the hardest case.
3. **[Kristan Hawkins' Flawed Reasoning vs Scripture](/docs/abolitionistsrising.com/kristan-hawkins-flawed-reasoning-vs-scripture)** — addresses Students for Life's defense of exceptions from within the pro-life movement.
4. **[Biblical, Not Secular](/docs/abolitionistsrising.com/biblical-not-secular)** — where the authority to reject exceptions actually comes from.
5. **[Abolitionist, Not Pro-Life](/docs/abolitionistsrising.com/abolitionist-not-pro-life)** — why the pro-life movement cannot self-correct on this point.

## The specific objection the corpus answers

> "I just can't tell a rape victim she has to carry her attacker's child."

The archive's answer: we are not telling her she has to endure her attacker — we are telling her she may not murder her child. Rape is a capital crime against the mother. The child is the second victim, not the perpetrator. **Read [No Exceptions](/docs/abolitionistsrising.com/no-exceptions)** and sit with that distinction.

## When you've read these

If you agree that exceptions deny the very principle they claim to defend, you are no longer a consistent pro-life person — you are an abolitionist who hasn't yet said the word out loud.

**[Continue to Next Steps →](/docs/journey/next-steps)**

Or, if you still hesitate on strategy ("yes, but we can't pass that today"), read **[If You're Pro-Life and Support Incremental Laws](/docs/journey/path-pro-life-incrementalist)** next.
```

- [ ] **Step 2: Render and verify**

Open `/docs/journey/path-pro-life-with-exceptions`. Expect:
- Title renders
- All five "Read in this order" links resolve (click each one; every target is an existing article)
- The "Continue to Next Steps" link is a dead link for now — that's fine; Task 10 creates it.

- [ ] **Step 3: Lock the template structure**

Freeze these six sections. Every other path page uses them verbatim in this order:

1. `# If You Are <descriptor>`
2. `## You are likely here if you believe` — bulleted beliefs
3. `## The question your position cannot answer` — 1–2 paragraphs naming the obstacle
4. `## Read in this order` — numbered, 3–6 articles from the corpus, one sentence per item
5. `## The specific objection the corpus answers` — a blockquote objection + the archive's answer in 2–3 sentences
6. `## When you've read these` — the off-ramp: "go to next-steps" OR "still stuck? try this path"

- [ ] **Step 4: Commit**

```bash
git add docs/journey/path-pro-life-with-exceptions.mdx
git commit -m "feat(journey): write path for pro-life readers who support exceptions"
```

---

## Task 5: Write `path-pro-life-incrementalist.mdx`

**Files:**
- Create: `docs/journey/path-pro-life-incrementalist.mdx`

This is the most theologically loaded path in the archive. It's the one the whole movement exists to argue against. Source material is dense: `immediatism.md`, `against-pro-life-compromise-responding-to-denny-burk-andrew-walker-et-al.md`, FAQ "Was Dobbs a step in the right direction?", `why-i-believe-voting-for-a-pro-abortion-candidate-is-a-sin-no-matter-the-context.md`.

- [ ] **Step 1: Write the page using the Task 4 template**

Fill in the six sections. Key content decisions for this page:

- **Obstacle:** The reader believes compromise is prudent stewardship. The corpus's response is that "less iniquity is still iniquity" (Isaiah 10), and that gradual emancipation was satanic policy per Heyrick (quoted in `immediatism.md`).
- **Reading order:** `immediatism.md` → `biblical-not-secular.md` → `against-pro-life-compromise-responding-to-denny-burk-andrew-walker-et-al.md` → `abolitionist-not-pro-life.md`. Five items max.
- **Objection:** "But we've saved X lives by passing heartbeat bills." The archive's answer (from `immediatism.md`): heartbeat bills teach the culture that abortion is permissible before a heartbeat, weakening the case against all abortion. The "lives saved" framing ignores the ongoing dehumanization the legislation codifies.

- [ ] **Step 2: Render and verify**

Open `/docs/journey/path-pro-life-incrementalist`. All citations resolve. Mermaid/template integrity intact.

- [ ] **Step 3: Commit**

```bash
git add docs/journey/path-pro-life-incrementalist.mdx
git commit -m "feat(journey): write path for incrementalist pro-life readers"
```

---

## Task 6: Write `path-secular-pro-choice.mdx`

**Files:**
- Create: `docs/journey/path-secular-pro-choice.mdx`

The longest journey — reader starts with no shared premise. Begins with humanity of the preborn child (science + image of God) and ends at "the gospel is not optional."

- [ ] **Step 1: Write the page using the Task 4 template**

Content decisions:

- **Obstacle:** The reader has not yet granted that the preborn is a human being, or grants it but believes bodily autonomy trumps it.
- **Reading order:** FAQ "That's just your belief…" (the science citations) → FAQ "What about bodily autonomy?" → FAQ "Isn't forced birth just like forced organ donation?" → `no-exceptions.md` → `biblical-not-secular.md`. That last pivot is deliberate — it names that the secular argument is necessary but insufficient.
- **Objection:** "My body, my choice." The archive's answer (from FAQ): the body inside the mother is not her body, and bodily autonomy is not absolute.
- **Off-ramp:** If convinced abortion is wrong but not yet a Christian, route to `path-anti-abortion-non-christian.mdx`. If convinced and already a Christian, route to `next-steps`.

- [ ] **Step 2: Render and verify.**

- [ ] **Step 3: Commit**

```bash
git add docs/journey/path-secular-pro-choice.mdx
git commit -m "feat(journey): write path for secular pro-choice readers"
```

---

## Task 7: Write `path-christian-pro-choice.mdx`

**Files:**
- Create: `docs/journey/path-christian-pro-choice.mdx`

- [ ] **Step 1: Write the page using the Task 4 template**

Content decisions:

- **Obstacle:** The reader professes Christian faith but believes abortion is either ambiguous in Scripture or a matter of personal conscience.
- **Reading order:** `theology.md` → `biblical-not-secular.md` → `abolitionism101.md` → `no-exceptions.md`.
- **Objection:** "Scripture doesn't explicitly mention abortion." The archive's answer: Scripture explicitly condemns murder and the shedding of innocent blood, and identifies image-bearing from conception (Psalm 139, Jeremiah 1:5, Exodus 21:22-25). The question isn't whether the word "abortion" appears — it's whether preborn life is human. Scripture answers unambiguously.
- **Off-ramp:** Next-steps.

- [ ] **Step 2: Render and verify.**

- [ ] **Step 3: Commit**

```bash
git add docs/journey/path-christian-pro-choice.mdx
git commit -m "feat(journey): write path for Christian pro-choice readers"
```

---

## Task 8: Write `path-personally-opposed.mdx`

**Files:**
- Create: `docs/journey/path-personally-opposed.mdx`

- [ ] **Step 1: Write the page using the Task 4 template**

Content decisions:

- **Obstacle:** The reader believes abortion is wrong for them but that it's wrong to "impose morality" through law.
- **Reading order:** FAQ "You can't legislate morality, right?" → `criminalization.md` → `biblical-not-secular.md` → `abolitionist-not-pro-life.md`.
- **Objection:** "I don't want to impose my beliefs on others." The archive's answer (from FAQ): every law is the imposition of some moral framework. The question is not whether morality will be legislated — it's whose.
- **Off-ramp:** Route to `path-pro-life-with-exceptions` or `path-pro-life-incrementalist` depending on whether they accept exceptions, or direct to `next-steps`.

- [ ] **Step 2: Render and verify.**

- [ ] **Step 3: Commit**

```bash
git add docs/journey/path-personally-opposed.mdx
git commit -m "feat(journey): write path for 'personally opposed' readers"
```

---

## Task 9: Write `path-apathetic-christian.mdx`

**Files:**
- Create: `docs/journey/path-apathetic-christian.mdx`

This path is different in kind. The reader already agrees with the theology; the issue is the will. The reading order leads toward rebuke, repentance, and specific action.

- [ ] **Step 1: Write the page using the Task 4 template**

Content decisions:

- **Obstacle:** The reader believes abortion is murder but has not acted. Per `biblical-not-secular.md`, the church's apathy is the primary obstacle to abolition.
- **Reading order:** `stay-steeped-in-prayer-as-you-seek-to-abolish-abortion.md` → `fruits-of-abolitionism-is-true-repentance-necessary.md` → `all-about-the-church.md` (freethestates.org) → `abolitionists-must-stand-firm-to-oppose-murder-love-murderers.md`.
- **Objection:** "I'm not a lobbyist or activist — this isn't my calling." The archive's answer: every believer is called to rescue those being led to slaughter (Proverbs 24:11). The church, not a specialized caste of activists, is the body the Scripture addresses.
- **Off-ramp:** Direct to `next-steps` — no other path. This reader's next step is action.

- [ ] **Step 2: Render and verify.**

- [ ] **Step 3: Commit**

```bash
git add docs/journey/path-apathetic-christian.mdx
git commit -m "feat(journey): write path for apathetic Christian readers"
```

---

## Task 10: Write `path-anti-abortion-non-christian.mdx`

**Files:**
- Create: `docs/journey/path-anti-abortion-non-christian.mdx`

This path terminates differently from the other six. Per the FAQ ("Can People Who Disagree With You Join The Abolitionist Movement?"), a non-Christian cannot be an abolitionist in this corpus's sense — three of the five tenets (Gospel-Centered, Biblical, Church-Driven) make it impossible. The path leads to the gospel, not to a signature.

This is a doctrinal constraint from the source material. Do not soften it.

- [ ] **Step 1: Write the page using the Task 4 template**

Content decisions:

- **Obstacle:** The reader already opposes abortion but wants to partner with abolitionists without embracing Christianity.
- **Reading order:** FAQ "Can People Who Disagree With You Join The Abolitionist Movement?" → `norman-statement.md` → FAQ "Since not everyone is a Christian, shouldn't we argue against abortion from a secular perspective?" → `theology.md`.
- **Objection:** "We have the same goal — why can't we partner?" The archive's answer (from FAQ): "the measure of our success is not how many babies we see saved… but rather the measurement of our success is faithful obedience to the Lord Jesus Christ." Shared ends don't create shared means when the means are obedience.
- **Off-ramp:** This page terminates at "repent and believe the gospel." There is no onward link to next-steps. Link instead to the Norman Statement as the canonical gospel presentation + a short paragraph directing the reader to a local Bible-preaching church.

- [ ] **Step 2: Render and verify.**

- [ ] **Step 3: Commit**

```bash
git add docs/journey/path-anti-abortion-non-christian.mdx
git commit -m "feat(journey): write path for anti-abortion non-Christian readers"
```

---

## Task 11: Write `next-steps.mdx`

**Files:**
- Create: `docs/journey/next-steps.mdx`

The terminal page for anyone who has arrived at the abolitionist position. Not a reading list — an action list.

- [ ] **Step 1: Write `docs/journey/next-steps.mdx`**

Frontmatter + sections:

```mdx
---
title: Next Steps - You Are Here
slug: next-steps
source_site: abolitionist.ljs.app
content_type: page
categories: ["Reader Journey"]
excerpt: Concrete actions for someone who has arrived at the abolitionist position.
---

# You Are Here

If you've walked a path to this page, you now believe:

- Abortion is the murder of a human being created in the image of God.
- God's Word — not polling, not courts, not pragmatism — is the authority that demands its abolition.
- Abolition must be immediate and total. Exceptions are iniquitous.
- Belief is not enough. The church is obligated to act.

This is the position of the Norman Statement, the doctrinal confession of the Abolitionist Movement.

## Do these, in this order

**1. Sign the Norman Statement.** The doctrinal foundation of today's movement. Read it in full, not just the summary: [The Norman Statement](/docs/abolitionistsrising.com/norman-statement).

**2. Pray.** Not as a substitute for action — as the source of it. See [Stay Steeped in Prayer as You Seek to Abolish Abortion](/docs/abolitionistsrising.com/stay-steeped-in-prayer-as-you-seek-to-abolish-abortion).

**3. Find an abolitionist church or group near you.** The movement is body-driven. Go to the [state pages on Abolitionists Rising](https://abolitionistsrising.com/) and find your state. If there isn't a group near you, be the first one.

**4. Engage your magistrates.** Your state senators, representatives, and local magistrates all have a biblical duty to abolish abortion. Schedule meetings. Explain their duty before God and Constitution. See [Biblical, Not Secular](/docs/abolitionistsrising.com/biblical-not-secular).

**5. Vote consistently.** Read [Why I Believe Voting for a Pro-Abortion Candidate Is a Sin](/docs/abolitionistsrising.com/why-i-believe-voting-for-a-pro-abortion-candidate-is-a-sin-no-matter-the-context) and [How Shall an Abolitionist Vote](/docs/abolitionistsrising.com/how-shall-an-abolitionist-vote).

**6. Go to the killing centers.** Preach the gospel to those stumbling toward slaughter. Plead with mothers. This is not metaphor.

**7. Bring this into your church.** The silence of the church is the largest obstacle to abolition. See [All About the Church](/docs/freethestates.org/all-about-the-church).

## What you cannot do

You cannot wait.

You cannot hand this off to a specialized group of activists while you resume ordinary Christian life. Ordinary Christian life, in a culture that practices child sacrifice, includes the active work of abolition.

You cannot partner with pro-life organizations whose strategies you now understand to be iniquitous. See [Abolitionist, Not Pro-Life](/docs/abolitionistsrising.com/abolitionist-not-pro-life).

You cannot be silent.

## If you still have questions

Ask the archive directly — the search box on this site is connected to every article. Or browse the full archive by topic on the **All Articles** sidebar link.

If the question is pastoral rather than theological, find the abolitionist church nearest you. This movement is not a blog and not a mailing list. It is the body of Christ moving.
```

- [ ] **Step 2: Render and verify**

Open `/docs/journey/next-steps`. Click every internal link; expect all resolve to existing articles.

- [ ] **Step 3: Commit**

```bash
git add docs/journey/next-steps.mdx
git commit -m "feat(journey): write next-steps terminal page"
```

---

## Task 12: Add a "start here" self-assessment page (optional but recommended)

**Files:**
- Create: `docs/journey/start-here.mdx`

A single-page version of the "which path fits you" question, for readers who arrive at `/docs/journey/start-here` from an external link (social, email) rather than the map page. Same content philosophy but tighter — one paragraph per entry, large CTA buttons.

This is nearly redundant with `index.mdx` and could be skipped. Decide at this point: does the map-page-with-seven-bullets suffice? If yes, delete this task and move on. If no, execute it.

- [ ] **Step 1: Decide whether to build this page**

Read back `docs/journey/index.mdx`. If the map page's "seven paths" section already does what this page would do, skip to Task 13 and mark this task complete without creating the file. If you believe a simplified standalone is valuable, proceed.

- [ ] **Step 2: If proceeding, write `docs/journey/start-here.mdx`** following the same frontmatter convention and linking out to the seven paths.

- [ ] **Step 3: Commit (if file created)**

```bash
git add docs/journey/start-here.mdx
git commit -m "feat(journey): add start-here self-assessment page"
```

---

## Task 13: Add homepage CTA

**Files:**
- Modify: `web/app/(home)/page.tsx`

The homepage currently leads with the chat box. The user has stated the site's primary purpose is guiding readers into abolitionism. The CTA must be prominent and above the chat box.

Do not replace the chat box — it handles off-path objections that no linear journey can anticipate. Add a CTA banner above it.

- [ ] **Step 1: Modify `web/app/(home)/page.tsx`**

Add a `<section>` between the `<header>` and `<ChatBox />`:

```tsx
      <section className="mb-8 rounded-lg border border-fd-primary/40 bg-fd-primary/5 p-6">
        <h2 className="mb-2 text-xl font-semibold">New here? Start the reader journey.</h2>
        <p className="mb-4 text-fd-muted-foreground">
          Seven guided paths that take you from your current view of abortion to
          the abolitionist position this archive defends. Pick the one that fits
          you.
        </p>
        <Link
          href="/docs/journey"
          className="inline-block rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
        >
          Start the journey →
        </Link>
      </section>
```

- [ ] **Step 2: Render and verify**

Run `pnpm dev`. Open `http://localhost:3000`. Expect:
- Header "Ask the Abolition Archive"
- CTA banner "New here? Start the reader journey."
- Chat box below the banner
- "Start the journey →" button links to `/docs/journey`

- [ ] **Step 3: Commit**

```bash
git add web/app/\(home\)/page.tsx
git commit -m "feat(journey): add homepage CTA linking to reader journey"
```

---

## Task 14: End-to-end verification + deploy

**Files:**
- None created/modified

- [ ] **Step 1: Link integrity check**

For each of the 10 journey pages, open it in dev mode and click every outbound link. Every link must resolve either to another journey page or to an existing corpus article. Any broken link is a content bug; fix it in the originating file before proceeding.

- [ ] **Step 2: Category tree check**

Open `/docs` (or any article page) and expand the sidebar. Expect a "Reader Journey (9)" or "(10)" folder containing every journey page. If the count is wrong, check that every journey file has `categories: ["Reader Journey"]` in its frontmatter.

- [ ] **Step 3: Build test**

From `web/`:

```bash
pnpm build
```

Expect a clean build with no TypeScript or MDX errors. If Mermaid or a component import fails at build time, fix before deploying.

- [ ] **Step 4: R2 sync test (dry run first)**

Run `scripts/sync_to_r2.sh` and confirm the output lists all new `.mdx` files under `docs/journey/`. The `.mdx` extension must be picked up by the find command (verify by grepping the output for `journey`).

- [ ] **Step 5: Deploy**

From `web/`:

```bash
wrangler deploy
```

- [ ] **Step 6: Production smoke test**

Open `https://abolitionist.ljs.app/docs/journey`. Verify the Mermaid diagram renders. Click through one full path (start → path page → corpus citation → next steps). If every step renders and every link resolves, the feature is live.

- [ ] **Step 7: RAG smoke test**

Open the homepage chat box. Ask: "I'm a pro-life Christian who supports rape and incest exceptions. Where should I start?" Expect the answer to cite `/docs/journey/path-pro-life-with-exceptions` (or the underlying articles). AI Search indexing can take a few minutes after the R2 sync; if the journey pages aren't yet cited, wait 5–10 minutes and retry.

- [ ] **Step 8: Commit any fixes and write a final wrap-up commit if needed**

```bash
git status
# If everything was already committed in prior tasks, nothing to do.
```

---

## Self-review checklist (run after writing, before executing)

- [ ] Every new file listed in "File Structure" has a corresponding task that creates it.
- [ ] Every `[Article title](/docs/...)` link in the template sections points to a file that exists today in `docs/`. (Verify by running `ls docs/abolitionistsrising.com/` and `ls docs/freethestates.org/` against the slugs referenced in tasks 4–11.)
- [ ] The Mermaid chart syntax in Task 3 is valid. (Verify by pasting the `graph TD` block into `mermaid.live` before writing it into the file.)
- [ ] `source.config.ts` glob change (Task 0) and `sync_to_r2.sh` find change (Task 0) are consistent with each other — both must pick up `.mdx`.
- [ ] The non-Christian path's terminus (Task 10) does not link to `next-steps.mdx`. This is intentional and load-bearing.
- [ ] No task uses TDD language ("write failing test", "verify red") where the task produces prose rather than logic. TDD was consciously adapted here; this is documented in the header.
- [ ] Frequent commits: every task ends in a commit step. No task bundles multiple conceptual changes.
