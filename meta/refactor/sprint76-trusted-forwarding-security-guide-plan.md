# Sprint 76: Trusted Forwarding Security Guide Cleanup

## Summary

Continue Slice 12 by making the trusted-forwarding docs teach the signed 1.0
security model.

The current task guide already says trusted forwarding is identity forwarding,
not authorization. The remaining cleanup is to make it explicit that
`_trellisForwarding` is the only live transport, raw trusted-forwarding fields
are deleted except historical/migration mentions, server helpers construct the
envelope, and verification failures fail closed without logging secrets.

## Why This Sprint

Trusted forwarding is a security boundary, not a convenience option. If the docs
leave old raw key language or per-call key override language in the active
authoring surface, users will treat forwarding as "pass identity-shaped args"
instead of signed server-to-Convex transport authentication.

This sprint should leave one clear story:

- Nitro/webhook/MCP/bridge callers sign `_trellisForwarding`;
- Convex verifies the envelope before forwarded principal/delegation metadata is
  trusted;
- the envelope authenticates the forwarding boundary only;
- backend principal, actor, guard, tenant, load, authorize, and handler logic
  still decide permission;
- raw `_trustedForwardingKey` / `_trustedForwarding` fields are not a supported
  app path.

## Non-Goals

- Do not change runtime code.
- Do not rewrite bridge package-author docs.
- Do not rewrite MCP projection docs.
- Do not complete the full public API reference rewrite.
- Do not document raw forwarding compatibility.
- Do not teach users to manually build envelopes unless the API already exposes
  that as an advanced surface.

## Action Plan

### 1. Establish The Forwarding Docs Baseline

- [ ] Scan active user-facing docs and API references:

  ```bash
  rg -n "_trellisForwarding|_trustedForwardingKey|_trustedForwarding\\b|trustedForwardingKey|trusted forwarding|trusted-forwarding|forwarded principal|forwarded delegation|CONVEX_TRUSTED_FORWARDING|auth: 'trusted'|auth: \"trusted\"|signed envelope|envelope|principal|delegation" apps/docs/content/docs README.md examples -g '*.md'
  ```

- [ ] Classify hits as current signed forwarding docs, stale raw forwarding
      surface, env/deployment checklist, MCP/bridge adjacent docs, or false
      positives.
- [ ] Record the baseline in this plan before editing.

### 2. Tighten `/docs/server-side/webhooks-and-trusted-forwarding`

- [ ] Treat this page as the canonical task guide for trusted forwarding.
- [ ] State that `_trellisForwarding` is the only supported live forwarding
      transport.
- [ ] State that raw `_trustedForwardingKey` / `_trustedForwarding` fields are
      deleted from app authoring surfaces and must not appear in public args.
- [ ] Explain the signed envelope in junior-readable terms:
      function ref, args hash, principal/delegation, purpose, expiry, replay id,
      and key id are signed together.
- [ ] Explain that server helpers create the envelope when using
      `auth: 'trusted'`; most apps should not manually build it.
- [ ] Explain fail-closed behavior for malformed, wrong function ref, args hash
      drift, expiry, unknown key id, wrong audience/purpose, and replay.
- [ ] Explain safe logging: no raw envelopes, raw keys, bearer tokens,
      principal/delegation payloads, subjects, JTIs, tenant keys, or confirmation
      payloads.
- [ ] Keep the core rule loud: valid envelope authenticates transport only; it
      never grants business permission.

### 3. Align Server API Reference

- [ ] Remove or reframe `trustedForwardingKey?` if it appears as a normal
      per-call option.
- [ ] Keep `auth: 'trusted'`, `principal`, and `delegation` documented as the
      server helper shape.
- [ ] Add a terse note that helpers sign `_trellisForwarding` and do not send
      identity-shaped public args.
- [ ] Keep the API reference terse; link back to the task guide for the security
      explanation.

### 4. Align Deployment And Troubleshooting Notes

- [ ] Ensure deployment overview/checklist mention only the server-owned
      forwarding secret and signed path.
- [ ] Ensure auth troubleshooting does not imply browser auth and trusted
      forwarding share a trust path.
- [ ] Add or preserve `trellis doctor --security` guidance only if already
      accurate.

### 5. Leave Adjacent Docs Open

- [ ] Do not mark bridge package-author guide complete.
- [ ] Do not mark public API reference complete.
- [ ] If bridge docs still need package-author signed forwarding details, record
      them as future scope.

### 6. Verify

- [ ] `pnpm run check:docs:links`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] Forwarding docs scan from step 1 has no active raw-forwarding docs, or
      every remaining hit is documented here as historical/migration/future
      scope.
- [ ] `pnpm exec oxfmt --check apps/docs/content/docs/07.server-side/3.webhooks-and-trusted-forwarding.md apps/docs/content/docs/13.api-reference/4.server.md apps/docs/content/docs/11.deployment apps/docs/content/docs/05.auth-security/4.auth-troubleshooting.md meta/refactor/sprint76-trusted-forwarding-security-guide-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

### 7. Update The Refactor Tracker

- [ ] Add a Sprint 76 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Mark Trusted forwarding security guide complete only if the task guide and
      server API reference are aligned and verified.
- [ ] Leave bridge package-author and full public API reference items open.

## Done Means

- Trusted forwarding docs teach signed `_trellisForwarding`, not raw forwarding.
- Users understand that forwarding authenticates transport identity injection
  and does not grant authorization.
- Server helper docs do not present per-call trusted key overrides as normal app
  authoring.
- Failure and logging rules are explicit enough for a reviewer to reason about.
- Deployment docs point users to one production-safe forwarding setup.
