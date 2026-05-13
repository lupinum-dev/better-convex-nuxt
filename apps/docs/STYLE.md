# Trellis Docs Style Guide

This is the compass for every docs page. Read it once before writing or editing a page. It exists because the docs drifted into dense spec prose — this guide pulls them back toward something a real person wants to read.

If in doubt: read the page out loud. If a sentence feels like you're reading from a manual, rewrite it.

---

## Voice

**Write to one person.** Use _you_ and _you'll_, not _the developer_ or _the user_. Contractions are fine.

**Lead with the payoff.** The first sentence of every page tells the reader what they'll walk away with — not what the page "covers" and not the signature of the thing being described.

> ❌ `useConvexQuery()` is the standard Trellis query composable for Nuxt apps. It is SSR-aware, hydrates into the live Convex subscription model, and gives you reactive state such as `data`, `status`, `pending`, `error`, `isStale`, `refresh`, and `clear`.
>
> ✅ Fetch data from Convex with one line. It renders on the server, hydrates on the client, and stays live as the data changes — no refetch, poll, or subscription wiring to write yourself.

**Vary sentence length.** If three sentences in a row are the same length, break the rhythm. Short sentences land. Use them for emphasis.

**Kill "Trellis does X" monotony.** When four paragraphs all start with _Trellis_, the reader stops seeing it. Rephrase some as verbs (_Routes flow through…_), some as outcomes (_You get…_), some as the reader's action (_You'll define…_).

**No marketing speak.** No _seamlessly_, no _powerful_, no _robust_, no _out of the box_. Dry humor is fine when it's earned and true.

**Show honesty.** If something is a sharp edge, name it. If something is deliberately opinionated, say so. Readers trust docs that admit tradeoffs.

---

## Structure

**Page opening (first 4 lines of body).**

1. One sentence: the payoff — what you'll get / do / avoid.
2. Optional second sentence: one line of context or positioning.
3. A short code snippet showing the common case (when the page is about an API).
4. A sentence pointing the reader to the rest of the page.

**Sections.** Each `##` heading answers a question the reader has _after_ reading the previous section. Not before, not hypothetically. If you can't articulate the question, cut the section.

**Last two sections of every guide.** Standardized:

- `## Common pitfalls` — 2–4 bullets. Each names the mistake in one sentence.
- `## What's next` — one or two sentences pointing to the next concrete page.

Nothing else at the bottom. No "Summary." No "Recap."

---

## Headings

- **Sentence case.** `## Keep previous data during arg changes`, not `## Keep Previous Data During Arg Changes`. Proper nouns stay capitalized.
- **Descriptive, not clever.** `## Skip a query` beats `## When not to run`.
- **No "Use this page when…"** openings — cut entirely.
- H1 (page title) comes from frontmatter `title`. Don't repeat it in the body.

---

## Jargon & the glossary

The glossary lives at [`2.concepts/2.glossary.md`](content/docs/2.concepts/2.glossary.md). Every Trellis-specific term — _principal, appIdentity, guard, check, operation, tenant, projection, App Runtime, Nuxt Runtime, Agent Runtime, transport, business layer_ — has a stable anchor there.

**Rule:** the first appearance of each of these terms on any page links to its glossary anchor.

```md
Every call flows through a [caller](/docs/concepts/glossary#caller), then an [appIdentity](/docs/concepts/glossary#appIdentity).
```

Subsequent uses on the same page are plain text. Never redefine a term inline — link to the glossary.

---

## Code blocks

**Every fenced block gets a filename in meta.**

````md
```ts [convex/todos.ts]
export const list = query.public({ ... })
```
````

**Highlight changed lines when the block is a diff against a previous one.**

````md
```ts [convex/todos.ts] {5-8}

```
````

**Package-manager variants use `::code-group`, not repeated blocks.**

````md
::code-group

```bash [pnpm]
pnpm add @lupinum/trellis
```

```bash [npm]
npm install @lupinum/trellis
```

```bash [yarn]
yarn add @lupinum/trellis
```

::
````

**Long files get `::code-collapse`.** See [mdc-components.md](mdc-components.md) for syntax.

**Multi-file snippets use `::code-tree`** (for scaffolding examples where the reader needs to see the whole layout).

---

## MDC component playbook

All available components are cataloged in [mdc-components.md](mdc-components.md). This table says **when** to reach for each.

| Component                          | Use for                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `::note`                           | Side information the reader can skim. _"If you need X instead, see Y."_ Doesn't change what they should do.                             |
| `::tip`                            | Non-obvious productivity wins. _"You can pass a getter to make args reactive."_ Something helpful they wouldn't find on their own.      |
| `::warning`                        | Production-risk gotchas. _"Don't use `subscribe: false` for data the UI expects to stay live."_                                         |
| `::caution`                        | Data-loss or security risk. _"Never expose this mutation without a guard."_ The strongest callout — reserve for real danger.            |
| `::callout`                        | Navigation nudge with an icon + link. Use sparingly; `::note` + inline link is usually enough.                                          |
| `::steps`                          | Sequential tutorials. Replaces `## Step 1` / `## Step 2` heading patterns. The `level="4"` attribute controls the heading level inside. |
| `::code-group`                     | "Same thing, multiple ways" — package managers, before/after, two client libraries.                                                     |
| `::code-collapse`                  | Any code block over ~40 lines that isn't the star of the section.                                                                       |
| `::code-tree`                      | Scaffolding / multi-file setup where layout matters.                                                                                    |
| `::field-group` + `::field`        | API reference option tables. Always prefer over a plain markdown table for function options.                                            |
| `::tabs` + `:::tabs-item`          | Config variations — e.g., public-only vs auth-ready config, or rendered vs source.                                                      |
| `::card` + `::card-group`          | Hub / index pages only. Don't sprinkle into guide bodies.                                                                               |
| `::accordion` + `::accordion-item` | FAQ sections and rarely-expanded detail. Not for core content.                                                                          |

**Density target.** A well-written guide page lands 1–3 callouts per page — enough to break up the prose, not so many that they stop carrying weight. If a page has five `::warning` blocks, either it's the wrong component or the content belongs inline.

---

## Lists

Lists are cheap. Too many kill a page.

- **Use a list** when order or enumeration is the point (steps, three mutually exclusive options, return values).
- **Use prose** when the items are connected ideas. _"Trellis checks the guard, then loads the record, then runs the handler"_ reads better than three bullets of the same.
- **Avoid nested lists deeper than one level.** If you're nesting, the structure wants to be a table or two paragraphs.

Bullet points don't need terminal periods if every bullet is a phrase. They do need them if any bullet is a full sentence. Be consistent within a list.

---

## Tables

Use tables when the reader is comparing things along shared dimensions — options × defaults × types, or feature × when-to-use × when-not. A two-column table with one row per heading is a list in disguise; use `::field-group` or prose instead.

---

## Frontmatter

Every page has:

```yaml
---
title: 'Short noun phrase'
description: 'One sentence the search engine will show under the title. Fits on one line.'
links:
  - label: 'Related page label'
    icon: 'i-lucide-<something>'
    to: '/docs/...'
---
```

- `title`: short noun phrase. Sentence case. No trailing punctuation.
- `description`: one sentence, ≤ 160 chars. Say what the reader will get, not what the page "covers."
- `links`: 1–3 entries pointing to the most natural next reads (installation, related guide, example repo). External links get `target: _blank`.

Hub/index pages (`1.getting-started.md`, etc.) may add a hero or card layout; guide pages don't.

---

## Diagrams

For architectural / sequence / fan-in diagrams, use Mermaid fenced blocks. (Wiring is a Wave 1 prerequisite — see `DOCS-WORKPLAN.md`.)

Rules:

- **≤ 8 nodes per diagram.** If you need more, the model is too complex for that page.
- **Diagrams supplement prose.** The page must still make sense if the diagram fails to render.
- **Label every edge.** Unlabeled arrows are decoration.

---

## Length targets

- **Guide page:** 250–600 words of prose plus 1–3 code examples. If you're over 800 words, the page probably wants to split.
- **Reference page:** as long as the surface requires, but every entry follows the same shape (one-line purpose sentence → signature → options via `::field-group` → example).
- **Hub page:** ≤ 200 words of prose; mostly `::card-group` links.

---

## Before you merge

Walk the page you just edited in the dev server (`pnpm --dir docs dev`). Read it top to bottom on a fresh tab. If you catch yourself skimming, the reader will too — rewrite the part you skipped.

Then:

- `pnpm check:docs:links` — no broken internal links.
- `pnpm check:docs:api-surface` — reference still matches public API.
- `pnpm --dir docs build` — clean production build.
