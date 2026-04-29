# Vision

Trellis is an opinionated app framework for building reliable Nuxt + Convex apps with strong identity, permissions, tenant isolation, and agent-friendly structure.

It exists because repeated app work should not require reinventing the same security, authorization, layout, backend, and workflow decisions every time. Trellis gives those decisions a durable shape so a team can start from a known foundation instead of rebuilding the foundation per project.

## Why Trellis Exists

The original need was practical: build Convex-backed Nuxt apps without repeating the same setup for every project.

Before Trellis, each app needed its own answer to the same questions:

- where frontend, backend, and shared contracts live
- how identity enters the system
- how a transport principal becomes an app actor
- where guards, permissions, and tenant rules are enforced
- how browser UI, Nitro routes, webhooks, and agent tools share business logic
- how destructive work is previewed, confirmed, executed, and audited
- how examples, tests, docs, and generated code stay aligned

Trellis makes those answers boring and predictable.

## Product Position

Trellis is a framework, not a loose starter kit.

It is intentionally narrow:

- Nuxt is the app framework.
- Convex is the backend and data runtime.
- Better Auth is the auth foundation.
- MCP is the agent workflow surface.
- TypeScript is the contract language.

The framework is not trying to be stack-neutral, transport-neutral, or adapter-neutral. That constraint is what lets Trellis be useful. It can provide a strong path because it does not need to support every path.

## Fit

Trellis fits when an app needs several of these at once:

- a Nuxt + Convex foundation
- repeated app or product-family work
- real identity and actor resolution
- roles, permissions, tenant boundaries, or capability projection
- browser, server, webhook, and agent surfaces sharing one backend model
- conventions that make AI-assisted development safer and faster
- generated structure, lint rules, tests, and docs that reinforce the same shape

Trellis is probably wrong when:

- raw Convex plus a few Vue components is enough
- the project does not need auth, permissions, or tenant boundaries
- the team wants a neutral utility library instead of a framework
- the app needs a fundamentally different stack
- the team is not willing to keep the canonical layout and runtime model

## Human And Agent Workflows

AI agents are becoming part of normal development and operations work. That changes what a framework should provide.

It is not enough to generate a starter and leave the rest to convention. Agent-friendly systems need explicit boundaries, predictable names, clear places to work, and fewer ambiguous architectural choices. Trellis treats that as a first-class design constraint.

The same structure that helps humans review a change also helps agents make smaller, safer changes:

- feature folders define ownership boundaries
- runtime-neutral contracts separate shared shape from runtime code
- protected handlers make auth and authorization visible
- permission projection keeps UI capability state derived from backend truth
- destructive operations give agents a preview and confirmation path
- docs, examples, and checks describe one shape instead of several competing ones

## Internal-First, Open-Source Ready

Trellis is built from internal project pressure first. It is not a generic framework exercise.

The public package can be released and used by others, but the project should stay honest about its lane. People can decide whether the model fits how they want to build. Trellis should not overfit to every external niche or dilute the framework to chase breadth.

The product goal is high velocity when the fit is right, not universal applicability.

## North Star

The secure, typed, tenant-safe path should be the easiest path.

A demanding reviewer should be able to inspect a Trellis app and quickly see:

- where trust enters the system
- how the caller becomes an app actor
- where tenant boundaries are enforced
- which permissions gate each action
- how UI capabilities are derived
- where destructive work is previewed or executed
- how server and MCP surfaces reuse the same backend model

If those answers require archaeology, Trellis has failed its own purpose.
