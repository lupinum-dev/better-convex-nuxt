# Testing, Examples, Docs

Use this for Trellis tests, maintained examples, docs updates, and validation
commands. For module options and CLI commands, read
[config-cli.md](config-cli.md).

## Source Files

- Testing barrel: `src/runtime/testing/index.ts`.
- Testing docs: `apps/docs/content/docs/12.testing/**`,
  `apps/docs/content/docs/13.api-reference/6.testing.md`.
- Example apps: `examples/01-public-todo` through `examples/08-component-mini-cms`.
- Harness: `apps/harness`.
- Docs content: `apps/docs/content/docs/**`.
- Docs style: `apps/docs/STYLE.md`.
- API surface generator: `scripts/generate-api-surface.mjs`.
- Repo policy checks: `scripts/check-repo-policies.mjs`,
  `scripts/check-doc-links.mjs`,
  `scripts/check-maintained-examples-doctor.mjs`.

## Testing Helpers

Use `convexTestConfig()` in Vitest config for apps that need Trellis Convex test
module normalization.

Use `createTestContext()` for security- and tenant-aware integration tests
against real Convex handlers.

Typical protected-handler test shape:

```ts
const ctx = createTestContext({
  schema,
  modules,
  tenant: { table: 'organizations', field: 'organizationId' },
})

const team = await ctx.seedTenant({
  name: 'Acme',
  users: {
    alice: { role: 'member' },
    bob: { role: 'viewer' },
  },
})

const postId = await team.users.alice.mutation(api.posts.create, {
  title: 'Seeded by helper',
})

await expect(team.users.bob.mutation(api.posts.publish, { id: postId })).rejects.toThrow()
```

Use `asPrincipal(...)` to exercise trusted-forwarding paths in tests. It is
test-only and deliberately explicit; do not hide it behind app factories.

Keep `convex/test.setup.ts` in consumer apps when they need the generated server
mock path.

Other testing exports include `createConvexTestModules`, `convexServerMock`,
and `createObservationCapture`. Verify names in `src/runtime/testing/index.ts`
before documenting them.

## What To Test

- Permission and tenant behavior through real protected handlers.
- Browser/server/MCP parity by calling the same handler through each transport
  where relevant.
- Public surface drift when adding exports, auto-imports, or aliases.
- Example apps after changing scaffolds, module options, or common runtime
  behavior.
- Docs snippets when changing APIs that examples copy.

Do not test only leaf helpers when the risk is handler pipeline behavior. The
pipeline is the product.

## Maintained Examples

Examples are the preferred consumer reference after source and docs:

- `examples/01-public-todo`: public baseline.
- `examples/02-auth-todo`: signed-in personal baseline.
- `examples/03-team-workspace`: team/workspace permissions.
- `examples/04-saas-platform`: SaaS/platform flows.
- `examples/05-visibility-access`: visibility/access patterns.
- `examples/06-multi-workspace`: multi-workspace behavior.
- `examples/07-mcp-reference`: browser auth, MCP delegation, and trusted
  forwarding parity.
- `examples/08-component-mini-cms`: component bridge / packaged integration
  reference.

Do not use `apps/harness` as the consumer contract by default. It is a
contributor dev harness and may include private or experimental setup.

Use `examples/03-team-workspace` as the canonical protected-app reference when
you need one concrete pattern for actors, permissions, tenant isolation, and
operations.

## Scaffolds

When changing scaffolded conventions, inspect both:

- CLI templates in `src/cli/templates/init/**`.
- Maintained examples that represent the resulting app shape.

Run the example doctor when scaffold assumptions change:

```bash
pnpm run check:examples:doctor
```

## Docs Maintenance

For docs, keep the public authoring story aligned with implementation:

- API reference for symbols and options.
- Narrative guide for task flow and tradeoffs.
- Examples for consumer app shape.
- ADRs for accepted architecture decisions.

Run:

```bash
pnpm run check:docs:api-surface
pnpm run check:docs:links
```

if docs, exports, aliases, links, or generated API tables changed.

## Validation Commands

Use the narrowest meaningful command:

- `pnpm run check:publish-surface`: package export/public type surface.
- `pnpm run check:docs:api-surface`: generated docs API surface.
- `pnpm run test:contracts:repo`: repo contract tests.
- `pnpm run test:types`: type surface and examples type contracts.
- `pnpm run test:examples`: maintained example apps.
- `pnpm run check`: full default validation.

Avoid e2e unless the user asks or the change specifically touches behavior that
only e2e can verify.

## Pitfalls

- Do not update docs from memory. Read the source or generated surface first.
- Do not let examples drift from CLI templates.
- Do not add test-only factories that bypass Trellis principal/actor/tenant
  behavior.
- Do not treat generated `dist` or `.nuxt` output as the source unless the task
  is specifically about generated artifacts.
