# 0009: Separate Examples, Labs, Docs, And Harness Roles

Status: Accepted
Date: 2026-04-29

## Context

Trellis has several repo surfaces that can look similar from the outside: examples, labs, hosted docs, root foundation docs, and the internal harness.

If their roles blur, readers and agents may treat experiments or maintainer infrastructure as product truth.

## Decision

Keep the roles explicit:

- root docs are maintainer- and agent-facing foundation docs
- `apps/docs/content/docs/**` is user-facing product documentation
- `examples/01` through `08` are maintained runnable references
- `examples/03-team-workspace` is the canonical protected app
- `labs/` is archived or experimental concept material
- `apps/harness/` is maintainer infrastructure and e2e target coverage

## Consequences

Harness experiments do not automatically become public contract.

Labs can stay in the repo, but they must be labeled as non-canonical.

User-facing docs should not link to deleted planning specs as the current design source.
