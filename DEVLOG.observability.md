# Dev Log: Observability Status

Date: 2026-04-17

## Current status

Trellis observability is now in its first real product shape.

What is shipped:

- Trellis owns the semantic observability model.
- `evlog` is the shipped delivery layer.
- public `logging` config is gone.
- public adapter configuration is gone.
- `__trellis` is the single propagation seam across Nuxt/MCP -> Convex.
- semantic events and wide summaries both exist.
- structured denial explainability is part of the contract.
- production defaults are on:
  - `enabled: true`
  - `level: 'critical'`
  - backend/MCP capture on
  - browser capture off

## What is good

- The product boundary is finally right.
  - Trellis owns meaning.
  - `evlog` owns delivery.
- Correlation is ingress-owned instead of being recreated ad hoc.
- `transport` vs `originTransport` is the correct split.
- The event contract is typed and closed enough to be useful.
- Explainability is no longer a vague aspiration; it is on the wire for MCP denial/error paths.
- Observability failures are contained and do not change business outcomes.
- Docs, runtime defaults, and tests are aligned again.

## What is still ugly

- `__trellis` is still a metadata envelope inside business args.
  - It is hidden and stripped correctly.
  - It is still the ugliest seam in the system.
- Wide summaries are useful but still less obvious than the semantic event path.
- The `evlog` bridge is intentionally thin, but it is still a delivery dependency we now own.

## Current tradeoffs

### Good tradeoffs

- Closed unions for event names and `reasonCode`
  - expensive to evolve carelessly
  - worth it because they make the contract enforceable
- semantic events plus wide summaries
  - slightly more moving parts
  - much better operator signal than choosing only one model
- production-on observability
  - more volume by default
  - much more honest than “enabled in docs, silent in reality”

### Costs we are accepting

- extra event volume
- extra per-call payload bytes from `__trellis`
- some extra CPU in hot paths
- a stronger compatibility burden around event names and `reasonCode`

### Costs we are not accepting

- observability breaking business flows
- a second public logger configuration surface
- remote-drain assumptions leaking into the Trellis semantic model

## Important truths

- This is not an OTel system.
- This is not a metrics system.
- This is not audit.
- This is not a generic logging abstraction.

It is a Trellis-native semantic observability layer with `evlog` delivery.

## Known footguns

- Dumping large blobs into `details` will make redaction and event volume worse.
- Low-quality `details.explanation` hurts agent usefulness.
- `reasonCode` is now a public contract and should be treated that way.
- If Convex ever gets a true out-of-band metadata channel, `__trellis` should be deleted quickly rather than normalized into permanence.

## What still needs improvement

- deeper MCP end-to-end observability integration coverage
- clearer public docs for wide summaries and test capture usage
- eventual richer delivery targets beyond `evlog`
- eventual removal of `__trellis` when the platform allows it

## Current rating

Architecture: `9/10`

Current shipped runtime: `8.5/10`

Why not higher yet:

- `__trellis` is still a seam
- delivery ecosystem is still narrow
- long-term contract evolution discipline has not been battle-tested

## Short conclusion

This is now a good system with explicit tradeoffs, not a half-finished logging layer.

The remaining work is mostly:

- coverage depth
- ergonomics
- future platform cleanup

not a rewrite of the core direction.
