# 0001: Treat Trellis As An Opinionated Nuxt + Convex App Framework

Status: Accepted
Date: 2026-04-29

## Context

Trellis exists because repeated Nuxt + Convex apps kept needing the same foundation: identity, actor resolution, permissions, tenant boundaries, server calls, app layout, tests, docs, and agent workflows.

A neutral helper library would avoid strong opinions, but it would also push those decisions back into every consumer app.

## Decision

Trellis is an opinionated app framework for building reliable Nuxt + Convex apps with strong identity, permissions, tenant isolation, and agent-friendly structure.

It is not stack-neutral. It assumes Nuxt, Convex, Better Auth, TypeScript, and MCP where agent workflows are needed.

## Consequences

Trellis can provide a strong default path, generated structure, guardrails, and examples because it does not try to fit every project.

The tradeoff is intentional: projects that do not fit the stack or conventions should use something else.
