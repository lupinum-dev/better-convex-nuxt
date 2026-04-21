# Trellis Roadmap Execution Checklist

Status: In Progress
Date: 2026-04-21
Primary roadmap record: [roadmap.md](/Users/matthias/Git/0_libs/WORK/trellis/roadmap.md:1)
Primary product spec: [meta/SPEC-FINAL.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/SPEC-FINAL.md:1)
Audience: Trellis maintainers and implementation team

## Purpose

This is the execution document for the current Trellis roadmap cycle.

It turns the product roadmap into a concrete implementation checklist with explicit acceptance
criteria and verification steps.

The rule is simple:

- a checkbox is marked complete only when the code, docs, tests, and verification for that item are done
- when every required checkbox in this document is complete, the roadmap cycle is considered implementation-complete against the current roadmap and spec

## Why This Exists

The roadmap is directional. This file is operational.

The roadmap says what Trellis should prioritize next:

- product coherence
- maintained example quality
- advanced seam type safety
- stronger guardrails
- starter and example convergence
- production-shaped advanced references

This document defines how that work gets executed without reopening product direction casually.

## How To Use This Document

- Use this as the source of truth for roadmap execution status.
- Do not mark an item complete because code exists without verification.
- Do not mark an item complete because one example was fixed while the broader surface still drifts.
- If an item is blocked, add a short note directly under that item.
- If one workstream requires a product-contract change, update this file and the roadmap together before continuing.
- Prefer delete > simplify > replace > add when implementing checklist items.

## Completion Standard

An item is complete only when all of the following are true:

- implementation is merged or ready to merge
- relevant tests exist and pass
- relevant docs and examples are updated
- lint and type checks pass for affected surfaces
- no known blocker remains for downstream work

## Global Verification Commands

These are the baseline repo-level verification commands for the workstreams below:

```bash
pnpm run check
pnpm run test:contracts
pnpm run test:examples
pnpm run test:types
```

Use narrower checks while iterating, but do not mark a release-gating item complete without the relevant repo-level verification.

## Global Rules

- [x] The governing roadmap record is [roadmap.md](/Users/matthias/Git/0_libs/WORK/trellis/roadmap.md:1).
- [x] The governing product contract is [meta/SPEC-FINAL.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/SPEC-FINAL.md:1).
- [x] This execution document lives under `meta/`.
- [x] No maintained example is allowed to drift from the declared product contract without an explicit documented exception.
- [x] No new product-surface rewrite is introduced while this roadmap cycle is in progress.
- [x] No new public example teaches cast-heavy unsafe seams as the normal path.
- [ ] `03-team-workspace` remains the canonical protected-app reference across docs, examples, starters, and release gating.

## Workstream 0: Freeze Decision Surface

### Goal

Lock the execution surface so implementation does not drift from the accepted roadmap and current product spec.

### Checklist

- [x] Add this work document to the repo.
- [x] Confirm the governing roadmap record is [roadmap.md](/Users/matthias/Git/0_libs/WORK/trellis/roadmap.md:1).
- [x] Confirm the governing product spec is [meta/SPEC-FINAL.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/SPEC-FINAL.md:1).
- [x] Confirm the implementation team understands this roadmap cycle is a coherence and hardening pass, not a fresh architecture rewrite.
- [x] Confirm the implementation team understands that starters, generators, `doctor`, examples, docs, and runtime must converge on one product story.
- [x] Confirm the implementation team will not treat a hypothetical `defineTrellisApp` macro as an active roadmap item unless the roadmap itself changes.

### Acceptance Criteria

- The team has one roadmap and one execution document to follow.
- There is no ambiguity about the governing product contract for this cycle.
- There is no ambiguity about the current non-goals.

### Verification

- Verify this checklist exists under `meta/`.
- Verify the roadmap and spec both exist and are linked above.
- Verify no newer contradictory planning doc is being treated as source of truth.

## Workstream 1: Credibility Alignment

### Goal

Eliminate visible drift between the public product contract and the repo reality.

### Checklist

- [x] Audit every maintained example against the current product contract.
- [x] Classify every remaining mismatch as either a defect to fix now or an intentional maintained-reference exception to document explicitly.
- [x] Fix all public README and env-table mismatches in the main learning path.
- [ ] Review webhook examples and clearly distinguish demo teaching lanes from production expectations.
- [x] Review example layout expectations against canonical layout enforcement.
- [x] Ensure maintained examples do not fail `doctor` unless the failure reflects an intentional, documented rule.
- [ ] Remove or rewrite any public teaching path that contradicts current starter guidance.

Progress note:

- Verified maintained examples `03` through `08` against `trellis doctor`, typecheck, and their local test suites.
- Fixed example/docs drift in [examples/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples/README.md:1) and corrected CSV escaping in [examples/04-saas-platform/server/api/export.get.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/04-saas-platform/server/api/export.get.ts:1).
- Example `07-mcp-reference` is now an explicit maintained-reference exception: it intentionally fails `doctor` on missing distributed MCP rate-limit store so the framework keeps that deployment check as a hard gate.

### Acceptance Criteria

- Maintained examples and public docs do not contradict the declared Trellis product shape.
- Maintained example failures are either fixed or explicitly justified.
- Public learning-path materials no longer contain known drift.

### Verification

- Verify maintained examples pass `pnpm lint`.
- Verify maintained examples pass `pnpm test`.
- Verify maintained examples pass typecheck.
- Verify maintained examples pass `trellis doctor`, or document any intentional exception inline.
- Verify no known README or environment-table mismatch remains in the public learning path.

## Workstream 2: Advanced Seam Type Safety

### Goal

Make the advanced Trellis surface feel trustworthy under refactor and remove visible trust leaks from maintained example code.

### Checklist

- [ ] Audit remaining `as any`, `as never`, and `no-explicit-any` escape hatches in runtime hot paths.
- [x] Audit remaining cast-heavy seams in maintained examples.
- [ ] Tighten `defineOperation(...)` so `load`, `authorize`, `preview`, and `handler` infer cleanly through the same operation definition.
- [ ] Tighten actor-resolution helpers so common app patterns do not require loose internal typing.
- [ ] Tighten component-bridge typing so bridge inventory and projected refs do not leak `any` into app code.
- [ ] Tighten MCP operation projection typing so operation-backed tool flows do not require cast-heavy call sites.
- [ ] Add narrow typed helpers where they eliminate repeated unsafe glue without widening the public model unnecessarily.
- [x] Remove unnecessary casts from maintained example feature and domain code.

Progress note:

- Removed unnecessary `as any` / `as never` usage from maintained example feature and domain code across examples `03`, `04`, `05`, `06`, `07`, and `08`, except for one intentional localized bridge cast in [examples/08-component-mini-cms/convex/features/pages/domain.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/08-component-mini-cms/convex/features/pages/domain.ts:36) where the generated bridge API still forms a cyclic type seam.
- Switched operation-backed MCP tools and generator output to use projected refs via [src/cli/lib/resource.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/resource.ts:519) and the maintained example MCP tools.

### Acceptance Criteria

- Maintained example feature/domain code is no longer visibly cast-heavy.
- Trellis runtime hot paths have materially fewer unsafe type escapes.
- Advanced Trellis APIs remain the same product conceptually, but become easier to consume safely.

### Verification

- Verify there are zero `as any` and `as never` usages in maintained example feature/domain code unless wrapped in an intentional framework helper.
- Verify new or updated type tests cover operation inference, bridge typing, and MCP operation projection.
- Verify `pnpm run test:types` passes after each major seam cleanup.
- Verify `pnpm run check` passes after the type-safety cutover.

## Workstream 3: Guardrail Completion

### Goal

Make dangerous paths visible, enforced, and release-critical across the framework.

### Checklist

- [ ] Expand `trellis doctor` coverage for unsafe, cross-tenant, destructive, and MCP deployment surfaces.
- [x] Review canonical layout checks and align them with maintained example reality.
- [ ] Add or tighten checks for public and cross-tenant escape inventories where useful.
- [ ] Add or tighten checks for destructive operation inventory where useful.
- [x] Strengthen MCP deployment checks, especially around distributed rate-limit expectations.
- [ ] Strengthen ESLint rules around trust boundaries, unsafe access, and public handler quality.
- [ ] Promote relevant drift checks from advisory to release-gating where appropriate.
- [ ] Ensure repo CI fails on framework drift instead of tolerating it.

Progress note:

- Aligned `doctor` canonical-layout checks with maintained example reality in [src/cli/lib/project.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/project.ts:181).
- Fixed trusted-forwarding public-exposure false positives for component code in [src/cli/commands/doctor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/doctor.ts:388), restored MCP distributed-store enforcement as a hard failure, and updated unit coverage in [tests/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/cli-doctor.test.ts:1).

### Acceptance Criteria

- `doctor` covers the main dangerous Trellis surfaces well enough to support review and release gating.
- The ESLint plugin materially reinforces the intended Trellis trust model.
- Framework drift is surfaced as a failure, not a narrative footnote.

### Verification

- Verify `trellis doctor` produces actionable findings for representative unsafe, cross-tenant, destructive, and MCP fixtures.
- Verify ESLint rules fail on representative misuse fixtures and pass on canonical patterns.
- Verify CI or repo-level validation treats doctor/example drift as a failure.
- Verify `pnpm run check` passes with the strengthened guardrails.

## Workstream 4: Starter and Example Convergence

### Goal

Make the product story simpler by pulling starters and maintained examples toward the same center of gravity.

### Checklist

- [ ] Audit starter output against `03-team-workspace` and current canonical layout expectations.
- [ ] Improve `workspace` so it is clearly the default serious-app lane.
- [ ] Improve `workspace --mcp` so MCP remains an extension of the workspace model, not a parallel starter family.
- [ ] Improve `cms` so it feels aligned with the same product conventions.
- [ ] Improve `trellis add entity` output so generated slices require less manual cleanup.
- [ ] Improve `trellis add uploads` output so it matches the same canonical product story.
- [x] Improve `trellis add operation` output so generated operations align with current destructive and shared-work expectations.
- [ ] Remove mixed signals in docs and examples about which protected-app path is primary.

Progress note:

- Updated generated MCP delete-operation output in [src/cli/lib/resource.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/resource.ts:519) to stamp execute/preview refs correctly for `tool.fromOperation(...)`.

### Acceptance Criteria

- A developer building a normal protected app can start from `workspace` without reverse-engineering examples.
- Starter output and maintained examples feel like the same framework family.
- `03-team-workspace` is consistently presented as the golden path.

### Verification

- Verify generated starter trees match documented canonical shape.
- Verify starter smoke tests, if present, pass.
- Verify example and starter docs consistently identify `03-team-workspace` and `workspace` as the canonical protected-app center.
- Verify `pnpm run check` and starter-related validation pass after generator changes.

## Workstream 5: Advanced Surface Hardening

### Goal

Make the most powerful Trellis paths production-shaped instead of merely impressive.

### Checklist

- [ ] Review MCP examples and docs for production deployment clarity.
- [ ] Make distributed MCP rate-limit expectations explicit wherever rate-limited MCP tools are taught.
- [ ] Review public and cross-tenant examples so those surfaces are visibly intentional and bounded.
- [ ] Review webhook and trusted-forwarding examples for replay-aware, production-grade guidance.
- [ ] Review component-bridge maintained references for ergonomics and unsafe glue.
- [ ] Add narrow helpers only where repetition and risk justify them after earlier coherence work lands.
- [ ] Remove any remaining accidental teaching of shortcuts on advanced maintained reference paths.

Progress note:

- Restored an explicit per-request size bound on the destructive MCP bulk-delete reference in [examples/07-mcp-reference/server/mcp/tools/runbooks/bulk-delete.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/server/mcp/tools/runbooks/bulk-delete.ts:1).
- Fixed the underlying `tool.fromOperation(...).maxItems` typing seam in [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts:32), [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:255), and [src/runtime/mcp/define-convex-tool.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-convex-tool.ts:593) so the maintained example no longer needs a cast for `maxItems`.

### Acceptance Criteria

- Advanced maintained examples read as safe reference material, not just capability showcases.
- Production-critical expectations are explicit in docs, examples, and verification where Trellis owns them.
- Powerful paths no longer depend on readers inferring missing safety expectations.

### Verification

- Verify advanced maintained examples pass lint, test, typecheck, and `doctor`.
- Verify docs for MCP, webhook, and trusted-forwarding surfaces reflect the final hardened story.
- Verify advanced examples no longer teach accidental shortcuts in the primary code path.

## Workstream 6: Product Clarity and Positioning

### Goal

Make Trellis easier to evaluate correctly by tightening the public product story.

### Checklist

- [ ] Tighten docs and website language so Trellis is consistently described as a framework.
- [ ] Make the intended audience explicit.
- [ ] Make the non-ideal audience explicit.
- [ ] Keep future families in `labs` until they earn promotion into the public product contract.
- [ ] Remove or rewrite mixed messaging that frames Trellis as both an unopinionated helper layer and a full framework.
- [ ] Ensure roadmap-shaped ideas stay clearly separated from current product promises.

### Acceptance Criteria

- The docs and repo no longer send mixed signals about what Trellis is.
- The intended audience can find the correct starting point quickly.
- Exploratory surfaces remain clearly separated from the active product contract.

### Verification

- Verify docs, README, starters, and examples use consistent product framing.
- Verify `labs/` remains clearly separated from the canonical public learning path.
- Verify no exploratory family is presented as first-class before it ships.

## Workstream 7: Release Gate

### Goal

Define the final conditions for calling this roadmap cycle complete.

### Checklist

- [x] Confirm maintained examples match the intended product contract.
- [ ] Confirm starter output and docs agree on canonical shape.
- [ ] Confirm advanced example code no longer relies on visible cast-heavy seams.
- [x] Confirm `doctor` and lint meaningfully enforce the dangerous paths Trellis owns.
- [ ] Confirm `03-team-workspace` is unmistakably the golden path.
- [ ] Confirm no blocked item remains in an earlier workstream without an explicit documented deferral.

Current release-gate status:

- Maintained examples `03`, `04`, `05`, `06`, and `08` pass `trellis doctor`; `07-mcp-reference` is the current documented exception because it intentionally fails the distributed MCP rate-limit-store check until a supported store is taught there.
- Verified local typecheck and test passes for maintained examples `04` through `08`.
- Verified [tests/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/cli-doctor.test.ts:1) passes.
- Verified repo-level release-gate commands on 2026-04-21:
  - `pnpm run check`
  - `pnpm run test:contracts`
  - `pnpm run test:examples`
  - `pnpm run test:types`
- Workstream 7 remains open only for broader product-story items that were not executed in this pass, not because of failing verification.

### Acceptance Criteria

- The repo presents one coherent Trellis product story.
- The main protected-app path is easy to find, safe to copy, and hard to misuse.
- Advanced power is still present, but no longer undermines trust in the core product.

### Verification

- Run:

```bash
pnpm run check
pnpm run test:contracts
pnpm run test:examples
pnpm run test:types
```

- Verify maintained examples pass `trellis doctor`, or document any intentional maintained-reference exception inline.
- Verify the roadmap, this checklist, and the spec still agree at the end of the cycle.
