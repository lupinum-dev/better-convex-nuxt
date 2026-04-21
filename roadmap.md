# Trellis Roadmap

This document is the current product-owner roadmap for Trellis.

It is intentionally grounded in the current repo surface, not in hypothetical redesigns. Trellis
already chose its lane:

- opinionated framework, not neutral helper library
- canonical starters and generators, not blank-canvas setup
- one backend/runtime model reused across browser UI, Nitro routes, trusted forwarding, and MCP
- one canonical protected-app reference, with advanced branches layered on top

The job of this roadmap is to make that product sharper, safer, and more coherent.

## Current Read

Trellis is already strong where most frameworks are weak:

- principal, actor, guard, load, authorize, handler, observe
- tenant isolation and permission projection
- destructive-operation safety
- MCP projection on the same policy model
- testing support
- docs and example depth

The biggest remaining risks are not missing primitives. They are seam quality and product cohesion:

- maintained examples do not all meet the same quality bar as the generated product surface
- advanced paths still rely on too many `as any` and `as never` escapes
- some dangerous surfaces are documented and linted, but not yet enforced consistently enough
- the framework story is stronger than the starter and example convergence story

## Product Position

Trellis is a framework.

That means the product surface is:

- `trellis init`
- `trellis add`
- `trellis doctor`
- canonical layout
- maintained examples
- built-in ESLint rules
- built-in devtools and observability

This roadmap does not treat Trellis as a candidate for a new single-file macro configuration model.

Not planned in this roadmap:

- `defineTrellisApp` as a top-level replacement for starters and generators
- framework-agnostic expansion
- visual permission builders
- Trellis-owned auth replacement
- breadth-first feature expansion for its own sake

## North Star

The secure, typed, tenant-safe path should be the easiest path.

A demanding reviewer should be able to look at a Trellis app and see:

- where trust changes
- where tenant boundaries change
- where destructive work happens
- where public and cross-tenant surfaces exist
- how UI capability state is derived
- how the same rules project into server and MCP surfaces

## Guiding Principles

1. Finish the framework that already exists.
2. Make maintained examples meet product standards.
3. Remove trust leaks in advanced seams before adding new capability.
4. Prefer enforcement over narrative.
5. Keep `03-team-workspace` as the canonical protected-app center of gravity.

## Phase 0: Credibility Alignment

Goal: eliminate drift between the public product contract and the repo reality.

Priority work:

- Bring every maintained example to the same bar as the generated framework surface.
- Remove doc and config drift across README, spec, examples, starters, and `doctor`.
- Distinguish clearly between demo-grade shortcuts and production-grade patterns.
- Review every maintained example for consistency with the canonical app shape and current product contract.

Concrete focus areas:

- `examples/03-team-workspace` remains the clean canonical protected-app reference.
- `examples/04-saas-platform` through `examples/08-component-mini-cms` must either conform to the canonical shape or be explicitly classified as a different maintained reference shape.
- `trellis doctor` must not fail on maintained examples unless the failure reflects a real defect the repo intends to fix.
- environment-variable tables, example READMEs, and generated starter expectations must match the actual code.
- webhook examples must clearly separate route-boundary teaching from production hardening expectations.

Acceptance criteria:

- all maintained examples pass `pnpm lint`
- all maintained examples pass `pnpm test`
- all maintained examples pass typecheck
- all maintained examples pass `trellis doctor`, or the remaining failures are intentional and encoded as explicit product rules
- no known README or env-table mismatch remains in the public learning path

## Phase 1: Advanced Seam Type Safety

Goal: make the advanced Trellis surface feel trustworthy under refactor.

This is the highest-leverage technical phase. The core model is good; the roughness is in the type seams.

Priority work:

- tighten `defineOperation`
- tighten actor-resolution helpers
- tighten component-bridge typing
- tighten MCP operation projection typing
- remove unnecessary casts from maintained example application code

Primary target areas:

- `src/runtime/functions/define-operation.ts`
- `src/runtime/auth/define-actor.ts`
- `src/runtime/functions/create-component-bridge.ts`
- `src/runtime/mcp/*`
- maintained example feature code under `examples/*/convex/features/**`

Desired outcome:

- `load`, `authorize`, `preview`, and `handler` infer cleanly through operation definitions
- operation-backed mutations and previews do not require call-site casts in maintained examples
- component bridge inventory and projected refs do not leak `any` into app code
- route-param and record-id handling in example UI code uses typed helpers instead of ad hoc casts where possible

Acceptance criteria:

- zero `as any` and `as never` in maintained example feature/domain code, except where technically unavoidable and wrapped in a named framework helper
- materially fewer `no-explicit-any` escape hatches in Trellis runtime hot paths
- no maintained example needs cast-heavy plumbing to use destructive operations or MCP operation bindings

## Phase 2: Guardrail Completion

Goal: make dangerous paths visible and enforceable across the framework.

Trellis already has meaningful guardrails:

- `trellis doctor`
- ESLint rules
- observability and devtools
- runtime rules for destructive MCP flows

The next step is to make them comprehensive and release-critical.

Priority work:

- expand `doctor` coverage for unsafe, cross-tenant, destructive, and MCP surfaces
- strengthen ESLint rules around trust boundaries and unsafe access
- make repo CI fail on framework drift rather than tolerate it
- add explicit inventories for dangerous surfaces where useful

Concrete checks to strengthen:

- unsafe query and mutation inventory
- cross-tenant escape inventory
- destructive operation inventory
- MCP rate-limit deployment checks
- canonical layout enforcement
- permission-query wiring
- starter-to-example drift

ESLint priorities:

- require explicit reasons on unsafe and cross-tenant escapes
- forbid raw permission shortcuts where Trellis primitives already exist
- enforce preview requirements on destructive shared or MCP-facing work
- push public-facing handlers toward explicit return contracts

Acceptance criteria:

- `doctor` covers the main dangerous Trellis surfaces well enough to be part of review and release gating
- repo CI treats doctor/example drift as a failure, not a warning
- dangerous paths are easy to inventory from the repo without manual code archaeology

## Phase 3: Starter and Example Convergence

Goal: make the product story simpler and more teachable.

The framework already has a strong center. The learning path and starter experience should reflect that more aggressively.

Priority work:

- keep `03-team-workspace` as the default protected-app reference
- make generated starters feel closer to the best maintained examples
- make `trellis add` produce less mechanical cleanup work
- simplify the beginner-to-production story

Product rules:

- `public` and `personal` stay teaching and small-app lanes
- `workspace` is the default serious product lane
- MCP remains an extension of `workspace`, not a separate starter taxonomy
- advanced reference apps stay branches, not primary entry points

Starter priorities:

- improve `workspace`
- improve `workspace --mcp`
- improve `cms`
- improve `add entity`
- improve `add uploads`
- improve `add operation`

Acceptance criteria:

- a developer building a normal protected app can start from `workspace` without reverse-engineering example structure
- starter output aligns closely with canonical layout and docs
- `03-team-workspace` is consistently presented as the canonical protected-app reference across repo surfaces

## Phase 4: Advanced Surface Hardening

Goal: make the most powerful Trellis paths production-shaped instead of merely impressive.

Priority work:

- harden MCP deployment expectations
- harden webhook and trusted-forwarding guidance and helpers
- harden public and cross-tenant examples
- improve component-bridge ergonomics for maintained reference paths

Specific concerns:

- distributed MCP rate limiting must be explicit for production guidance
- public and cross-tenant surfaces should be visibly intentional
- webhook examples should model replay-aware, production-grade expectations more clearly
- bridge-heavy examples should not require fragile internal knowledge to understand or extend

This phase may add narrow helpers where repetition and risk justify them, but only after the earlier coherence work lands.

Potential candidates:

- stronger webhook helper surface
- clearer distributed MCP rate-limit setup story
- bridge-oriented typed wrappers that remove remaining unsafe glue

Acceptance criteria:

- maintained advanced examples read as safe reference material, not just capability demos
- production-critical deployment expectations are explicit in docs and examples
- advanced examples stop teaching accidental shortcuts

## Phase 5: Product Clarity and Positioning

Goal: make Trellis easier to evaluate correctly.

Priority work:

- tighten the website and docs around the actual product story
- be explicit about who Trellis is for
- be explicit about who should not use Trellis
- keep future families in `labs` until they earn promotion

Messaging priorities:

- Trellis is for repeated Nuxt + Convex + Better Auth + MCP apps with real auth, permissions, tenancy, server boundaries, or agent access
- Trellis is not optimized for the smallest possible abstraction footprint
- the framework earns its weight at the protected-app and cross-surface boundary level

Acceptance criteria:

- the docs and repo no longer send mixed signals about Trellis being a library versus a framework
- the intended audience can identify the correct starting point quickly
- exploratory families remain clearly separated from the current product contract

## Sequencing

Recommended order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5 in parallel where it does not block engineering work

Practical overlap:

- Phase 0 and Phase 1 can overlap lightly
- Phase 2 should begin before Phase 1 fully ends so new fixes land with stronger enforcement
- Phase 3 should start once the type and guardrail direction is stable
- Phase 4 should not lead the roadmap

## Release Gates

Before calling the next Trellis release materially stronger, the repo should satisfy all of the following:

- maintained examples match the intended product contract
- starter output and docs agree on canonical shape
- advanced example code no longer relies on visible cast-heavy seams
- `doctor` and lint meaningfully enforce the dangerous paths Trellis owns
- `03-team-workspace` is unmistakably the golden path

## Explicit Non-Goals

These are not roadmap priorities now:

- replacing the current starter-plus-generator model with a single macro-based app definition
- expanding beyond Nuxt + Convex as a first-class target
- building visual permission tooling
- creating role packs or RBAC marketplaces
- adding broad new primitive families before current ones are cohesive

## One-Sentence Version

Trellis should spend this roadmap cycle becoming internally consistent, type-trustworthy, and review-friendly, not broader.
