# Internal Harness

This workspace is an experimental and integration harness for Trellis internals.

It is **not** the active vNext runtime contract.

Use it for:

- repository-level integration testing
- experimental spikes
- validating ideas before they are promoted into the public contract
- preserving research around deferred features

Do **not** use it as the source of truth for:

- current public runtime APIs
- current vNext product boundaries
- current documentation promises

Those live in:

- [VNEXT_RUNTIME_CONTRACT.md](../../VNEXT_RUNTIME_CONTRACT.md)
- [VNEXT_TRACKING.md](../../VNEXT_TRACKING.md)
- [SPEC.vNext.md](../../SPEC.vNext.md)

Important:

- this harness intentionally contains experiments for deferred or rejected ideas
- a passing harness experiment does not automatically promote a feature into vNext core
- a failing deferred-feature experiment does not invalidate the current vNext contract

Treat this directory as research and integration infrastructure, not product truth.
