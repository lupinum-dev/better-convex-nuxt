# Trellis Documentation Workplan

Internal tracker for the current docs sweep.

This file stays outside `docs/content/` on purpose so planning notes do not leak into the public docs set.

## Current State

- [x] `SPEC.md` is gone. Use `SPEC.vNext.md` as the active design source when design context is needed.
- [x] `README.md` has been rewritten as the front door instead of a docs dump.
- [x] The planned public docs tree has been filled out across guides, task pages, reference, MCP, testing, deployment, and project docs.
- [x] `docs/content/docs/12.api-reference/7.api-surface.md` is generated from `scripts/generate-api-surface.mjs`.
- [x] `pnpm check:docs:links` passes.
- [x] The previous broken internal links from `DEVELOPMENT.md` and `docs/mdc-components.md` have been resolved by landing the real target pages.

## Docs Shape Decisions

- [x] Keep the existing route families instead of inventing a second docs IA.
- [x] Do not add a separate top-level `concepts/` section for now.
- [x] Treat observability as a real Trellis capability, but not the front-door headline.
- [x] Keep concept-heavy material embedded where readers actually need it:
  - `guide`
  - `permissions`
  - `server-side`
  - `mcp-tools`
- [x] Keep examples discoverable, but do not make guides depend on “read example 07” as the explanation.

## Completed Public Pages

### Guide

- [x] `docs/content/docs/1.guide/1.get-started.md`
- [x] `docs/content/docs/1.guide/2.installation.md`
- [x] `docs/content/docs/1.guide/3.first-protected-app.md`
- [x] `docs/content/docs/1.guide/4.how-it-works.md`
- [x] `docs/content/docs/1.guide/5.choose-the-right-example.md`
- [x] `docs/content/docs/1.guide/8.multi-caller-architecture.md`

### Data Fetching

- [x] `docs/content/docs/2.data-fetching/1.queries.md`
- [x] `docs/content/docs/2.data-fetching/2.paginated-queries.md`
- [x] `docs/content/docs/2.data-fetching/3.cached-queries.md`
- [x] `docs/content/docs/2.data-fetching/4.connection-state.md`

### Mutations

- [x] `docs/content/docs/3.mutations/1.mutations.md`
- [x] `docs/content/docs/3.mutations/2.optimistic-updates.md`
- [x] `docs/content/docs/3.mutations/3.actions.md`
- [x] `docs/content/docs/3.mutations/4.destructive-operations.md`

### Auth And Security

- [x] `docs/content/docs/4.auth-security/1.authentication.md`
- [x] `docs/content/docs/4.auth-security/2.route-protection.md`
- [x] `docs/content/docs/4.auth-security/3.auth-flows.md`
- [x] `docs/content/docs/4.auth-security/4.auth-troubleshooting.md`

### File Uploads

- [x] `docs/content/docs/5.file-uploads/1.single-file-upload.md`
- [x] `docs/content/docs/5.file-uploads/2.multi-file-uploads.md`
- [x] `docs/content/docs/5.file-uploads/3.storage-urls.md`

### Server Side

- [x] `docs/content/docs/6.server-side/1.ssr-overview.md`
- [x] `docs/content/docs/6.server-side/2.server-routes.md`
- [x] `docs/content/docs/6.server-side/3.webhooks-and-trusted-callers.md`
- [x] `docs/content/docs/6.server-side/4.hydration-and-subscriptions.md`
- [x] `docs/content/docs/6.server-side/5.private-bridge.md`

### Permissions

- [x] `docs/content/docs/7.permissions/1.setup.md`
- [x] `docs/content/docs/7.permissions/2.principal-and-actor.md`
- [x] `docs/content/docs/7.permissions/3.guards.md`
- [x] `docs/content/docs/7.permissions/4.authorization-and-can.md`
- [x] `docs/content/docs/7.permissions/5.tenant-isolation.md`
- [x] `docs/content/docs/7.permissions/6.cross-tenant-and-raw-access.md`
- [x] `docs/content/docs/7.permissions/7.operations.md`
- [x] `docs/content/docs/7.permissions/8.actor-lanes-and-models.md`

### Observability

- [x] `docs/content/docs/8.observability/1.overview.md`
- [x] `docs/content/docs/8.observability/2.semantic-events.md`
- [x] `docs/content/docs/8.observability/3.debugging-decisions.md`

### Configuration

- [x] `docs/content/docs/9.configuration/1.module-options.md`
- [x] `docs/content/docs/9.configuration/2.environment-variables.md`
- [x] `docs/content/docs/9.configuration/3.auth-options.md`
- [x] `docs/content/docs/9.configuration/4.permissions-options.md`
- [x] `docs/content/docs/9.configuration/5.mcp-options.md`

### Deployment

- [x] `docs/content/docs/10.deployment/1.overview.md`
- [x] `docs/content/docs/10.deployment/2.production-checklist.md`
- [x] `docs/content/docs/10.deployment/3.local-development.md`

### Testing

- [x] `docs/content/docs/11.testing/1.getting-started.md`
- [x] `docs/content/docs/11.testing/2.testing-protected-handlers.md`
- [x] `docs/content/docs/11.testing/3.testing-server-and-mcp.md`

### API Reference

- [x] `docs/content/docs/12.api-reference/1.composables.md`
- [x] `docs/content/docs/12.api-reference/2.components.md`
- [x] `docs/content/docs/12.api-reference/3.functions.md`
- [x] `docs/content/docs/12.api-reference/4.server.md`
- [x] `docs/content/docs/12.api-reference/5.mcp.md`
- [x] `docs/content/docs/12.api-reference/6.testing.md`
- [x] `docs/content/docs/12.api-reference/7.api-surface.md`

### MCP Tools

- [x] `docs/content/docs/13.mcp-tools/1.getting-started.md`
- [x] `docs/content/docs/13.mcp-tools/2.define-tools.md`
- [x] `docs/content/docs/13.mcp-tools/3.auth-and-permissions.md`
- [x] `docs/content/docs/13.mcp-tools/4.destructive-tools.md`
- [x] `docs/content/docs/13.mcp-tools/5.prompts-resources-sessions.md`

### Project

- [x] `docs/content/docs/14.project/1.examples.md`
- [x] `docs/content/docs/14.project/2.contributing.md`
- [x] `docs/content/docs/14.project/3.changelog.md`
- [x] `docs/content/docs/14.project/4.migration-guides.md`

## Verification

- [x] Generate API surface with `pnpm docs:api-surface`
- [x] Verify docs links with `pnpm check:docs:links`
- [ ] Run a visual docs-app pass with `pnpm --dir docs dev`
- [ ] Run broader repo lint only if the docs assertions or surfaced exports change again

## Stop-Ship Gate

- [x] A first-time reader can move from README to installation to a protected app path without needing the spec.
- [x] The docs set covers active-builder tasks across data, auth, permissions, server routes, uploads, and MCP.
- [x] Principal, actor, guards, tenancy, operations, and destructive-tool flows have dedicated homes.
- [x] The agent path is split from browser setup instead of mixed into the same onboarding page.
- [x] Contributors and upgraders have real project pages instead of placeholder nav items.
- [x] No public docs page in this sweep is an empty scaffold or TODO shell.
- [x] Internal README and docs links currently resolve.

## Next Pass

- [ ] Do a visual scan of the docs app navigation and page flow.
- [ ] Tighten any pages that feel repetitive once the full set is reviewed in sequence.
- [ ] Add future docs only when they correspond to real shipped surface, not draft ideas.
