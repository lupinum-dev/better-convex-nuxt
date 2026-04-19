# Internal Harness

This workspace is the contributor-facing integration harness for Trellis.

It is not the public product story and it is not the canonical example set.

Use it for:

- repository-level Convex/runtime integration tests
- the root `pnpm dev` maintainer app
- managed e2e target coverage
- auth, trusted-caller, and MCP verification work
- focused spikes before a change graduates into the public runtime

Do not use it as the source of truth for:

- current public runtime APIs
- current documentation promises
- example-app teaching patterns

Those live in:

- [meta/SPEC-FINAL.md](../../meta/SPEC-FINAL.md)
- [README.md](../../README.md)
- [examples/README.md](../../examples/README.md)
- [meta/PROJECT-CLEANUP-BACKLOG.md](../../meta/PROJECT-CLEANUP-BACKLOG.md)

Important rules:

- a passing harness experiment does not automatically promote a feature into the public contract
- a harness-only pattern should not leak into docs or examples by accident
- backend test files here need a unique signal beyond what `examples/` already proves
- demo-style UI inside the harness is secondary to verification value

Treat this directory as maintainer infrastructure, not product truth.
