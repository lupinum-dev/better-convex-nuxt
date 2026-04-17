# To Think: Logging / Observability State

Date: 2026-04-17

## Current state

Trellis now has a real split between:

- `logging`
  - debug/runtime sink control
  - mostly developer-facing noise shaping
  - not the product abstraction
- `observability`
  - semantic Trellis events
  - correlation ids
  - sampling
  - redaction
  - adapter delivery

This is the right product direction. The old state mixed these concerns and made "logging" mean too many things at once.

## What is good

- The product language is now correct.
  - `observability` is the semantic pipeline.
  - `logging` is the low-level sink/debug knob.
- The highest-value Trellis events are wired.
  - principal / actor resolution
  - guard / authorize outcomes
  - tenant / service denials
  - `db.crossTenant` / `db.raw`
  - destructive operation preview / confirmation / execute
  - MCP tool called / denied / confirmation required / executed / failed
- The implementation is framework-shaped, not vendor-shaped.
  - Trellis owns the event model.
- the shipped adapter is just the built-in `console` sink
  - `evlog` did not become the core abstraction
- The first real vNext example is wired.
  - `examples-next/01-kanban-workspace`

## What is bad

- `src/runtime/utils/logger.ts` is still too transitional.
  - It now acts as both the old debug logger and an observability bridge.
  - This works, but it is not a clean long-term architecture.
- `src/runtime/utils/observability.ts` is doing too much.
  - types
  - defaults
  - sampling
  - redaction
  - correlation
  - adapter handling
  - hidden arg helpers
  - formatting
- Correlation propagation is strongest in operation-backed MCP flows, but not universal across every raw Convex ref path.
  - This is honest.
  - It is also uneven.
- Event emission is still somewhat stringly and hand-wired.
  - Good enough now.
  - Risky if the surface keeps growing without another cleanup pass.

## What is ugly

- The ugliest part is the hidden observability arg plumbing around Convex-bound flows.
  - Today we inject internal metadata into args and strip it back out later.
  - This is justified under current Convex constraints.
  - It is not elegant.

Current shape:

```ts
{
  id: 'board_123',
  __trellis: {
    correlationId: 'corr_abc',
    originTransport: 'mcp',
    requestId: 'req_xyz',
  },
}
```

Why this is ugly:

- business args and runtime metadata share the same object
- protected builders must quietly accept internal fields
- Trellis must remember to strip them before user-facing handler logic

- The repo test/harness output is still noisy even when green.
  - The code is passing.
  - The shutdown noise makes it look less healthy than it is.

## Important reality

We deliberately did **not** force hidden observability args through every generic browser/server/raw Convex path.

Why:

- that would be a brittle compatibility hack
- it would pollute every raw function boundary
- it would create a stronger-looking correlation story than the runtime can honestly guarantee

So the current state is:

- strong semantic observability
- strong correlation on operation-backed MCP flows
- local semantic events on generic raw-ref paths
- not perfect end-to-end correlation everywhere

This is the correct tradeoff for now.

## Alternatives for the ugly hidden-arg path

### Option A: keep the current flat hidden fields

Pros:

- already works
- small mechanism

Cons:

- scattered internal keys
- most hacky form

### Option B: move to one reserved internal envelope

Example:

```ts
{
  id: 'board_123',
  __trellis: {
    correlationId: 'corr_abc',
    transport: 'mcp',
    requestId: 'req_xyz',
  }
}
```

Pros:

- still works under current constraints
- cleaner than several flat hidden keys
- easier to validate and strip

Cons:

- still technically arg pollution
- still not a true side channel

This is the best practical cleanup if we want to improve the current mechanism without redesigning Trellis.

### Option C: full input envelope redesign

Example:

```ts
{
  input: { id: 'board_123' },
  __trellis: { correlationId: 'corr_abc' }
}
```

Pros:

- explicit separation of business input and framework metadata

Cons:

- much larger runtime break
- too much churn for this problem alone

This is not justified right now.

### Option D: wait for true out-of-band metadata support

Ideal shape:

```ts
convex.mutation(ref, args, {
  meta: { correlationId, transport: 'mcp' }
})
```

Pros:

- actually elegant
- proper separation of concerns

Cons:

- depends on upstream platform capabilities
- not something Trellis can force today

## Recommended next move

Short term:

- keep the single reserved `__trellis` envelope, but treat it as a temporary propagation seam rather than a finished abstraction

Longer term:

- split `src/runtime/utils/observability.ts` into smaller units
  - event model
  - config/defaults
  - emitter/sampling/redaction
  - transport metadata helpers
- reduce the bridging role of `src/runtime/utils/logger.ts`
- keep pushing toward a real out-of-band metadata channel if Convex ever supports it

## Blunt verdict

The observability implementation is:

- good as a product move
- good enough to ship
- not yet elegant in its internal form

The main technical debt is not the event model itself.
It is the metadata propagation seam.
