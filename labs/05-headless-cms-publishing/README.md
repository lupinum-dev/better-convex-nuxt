# 05 Headless CMS Publishing

Concept brief only. Not runnable yet.

Inspired by: **ginko-cms**

## Why this example exists

This concept pressures a real two-surface architecture:

- editorial app
- consumer delivery site

It pressures:

- editorial roles
- draft/publish workflow
- preview contracts
- content visibility by stage
- content projection into a separate frontend surface

## What Trellis must make easy

- draft vs published state lanes
- operation-backed publish/unpublish flows
- safe preview access
- content mutations owned by the editorial app
- clean read models for the consumer site

## Agent story

Agents should be able to:

- draft content from prompts or source material
- summarize diffs before publish
- tag or classify content
- propose SEO metadata
- publish only through confirmation-backed operations

## What this example validates

- Trellis as a content application layer
- multi-surface projection without duplicated business rules
- agent-assisted editorial workflows
- whether advanced boundary patterns stay clean enough for real use

## Existing work to draw from

If this concept is implemented, it should harvest patterns from the current `ginko-cms` worktree rather than reinvent the domain from scratch.
