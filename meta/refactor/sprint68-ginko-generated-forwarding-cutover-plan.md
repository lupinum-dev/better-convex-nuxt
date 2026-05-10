# Sprint 68: Ginko Generated Forwarding Cutover

## Summary

Remove raw trusted-forwarding fields from Ginko generated bridge artifacts and
prove the generated consumer bridge uses signed `_trellisForwarding` envelopes.

This sprint targets generated output and its generator/checks only. Authored
Ginko source already signs bridge calls with `createTrustedForwardingEnvelope`.
The remaining raw `_trustedForwardingKey` / `_trustedForwarding` hits are in
generated Convex component refs.

## Why This Sprint

The Trellis 1.0 tracker still has one technical Ginko bridge item open:

- migrate Ginko component bridge factories, generated host refs, and test
  helpers from raw `_trustedForwardingKey` / `_trustedForwarding` fields to
  signed `_trellisForwarding` envelopes.

Current scan shows:

- authored Ginko component bridge code uses `_trellisForwarding`;
- test helpers and workflow slice use `createTrustedForwardingEnvelope`;
- generated `packages/convex/src/_generated/component.ts` still contains raw
  `_trustedForwardingKey` / `_trustedForwarding` types.

The right fix is to update/regenerate generated artifacts through the maintained
generator path and add a guardrail. Do not hand-edit generated files unless the
generator is also updated and the regeneration command is recorded.

## Non-Goals

- Do not redesign the Ginko bridge registry.
- Do not change Trellis forwarding protocol or envelope implementation.
- Do not migrate Ginko docs/setup wording in this sprint.
- Do not run full packed-package E2E unless the focused generated-artifact gate
  requires it.
- Do not keep raw forwarding as an accepted generated shape.

## Action Plan

### 1. Locate The Generated Artifact Source

- [ ] Identify the command/source that writes
      `packages/convex/src/_generated/component.ts`.
- [ ] Confirm whether the file is generated from Trellis bridge metadata,
      Ginko bridge manifest rendering, Convex codegen, or package build output.
- [ ] Record the regeneration command in this sprint plan before changing the
      generated artifact.

### 2. Update The Generator Or Source Metadata

- [ ] Update the canonical generator/source so generated component refs expose
      `_trellisForwarding?: string` instead of raw `_trustedForwardingKey` /
      `_trustedForwarding`.
- [ ] Regenerate the affected generated files through the maintained command.
- [ ] Do not manually patch generated output without a generator change.

### 3. Add A No-Raw-Forwarding Guardrail

- [ ] Add or extend a Ginko test/check that scans authored and generated bridge
      paths for `_trustedForwardingKey` and raw `_trustedForwarding`.
- [ ] Allow historical docs only if the scan deliberately excludes
      `docs/refactor/**`.
- [ ] Require `_trellisForwarding` in the generated bridge proof where the
      bridge call needs forwarded identity.

### 4. Run Focused Ginko Verification

- [ ] `pnpm exec vitest run test/module/bridge-api-parity.test.ts`
- [ ] `pnpm exec vitest run test/module/package-boundaries.test.ts`
- [ ] `pnpm exec vitest run test/refactor/workflow-vertical-slice.test.ts`
- [ ] Run the focused no-raw-forwarding check added or updated in this sprint.
- [ ] `rg -n "_trustedForwardingKey|_trustedForwarding\\b" packages/cms/src packages/convex/src test/fixtures/basic/convex/ginkoCms test/helpers.ts test/refactor -g '!**/docs/refactor/**'`
      returns no live raw forwarding hits.

### 5. Update Trellis Tracker

- [ ] Mark the Ginko raw forwarding migration item complete only after generated
      artifacts and guardrail pass.
- [ ] Mark the Ginko bridge package/e2e no-raw-forwarding prove item complete
      only if the focused generated/artifact proof passes.
- [ ] Add a Sprint 68 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Leave docs wording, packed Trellis install, and full Ginko `pnpm run check`
      open unless those gates actually run and pass.

### 6. Verify Trellis Plan State

- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec oxfmt --check meta/refactor/sprint68-ginko-generated-forwarding-cutover-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check` in Trellis and Ginko.

## Done Means

- Generated Ginko component bridge refs no longer expose raw trusted-forwarding
  fields.
- Ginko authored/generated bridge paths use signed `_trellisForwarding`.
- A repeatable Ginko check prevents raw forwarding fields from returning.
- Trellis tracker marks only the verified raw-forwarding items complete.
- Broader docs and packed-package gates remain honestly open unless run.
