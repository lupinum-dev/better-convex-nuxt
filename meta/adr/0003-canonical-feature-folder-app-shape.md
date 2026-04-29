# 0003: Use The Feature-Folder App Shape

Status: Accepted
Date: 2026-04-29

## Context

Older planning docs mentioned layouts such as `convex/domain`, `convex/operations`, `shared/schemas`, and root `pages`. The maintained examples and generated direction now use feature folders.

## Decision

The canonical app shape is the implementation-backed feature-folder model:

```text
convex/features/*
shared/features/*
app/features/*
```

Root shell files, routes, and generated config stay thin. Product behavior belongs inside feature folders.

## Consequences

Foundation docs must describe the current generated and maintained shape, not older planned layouts.

New examples and generators should converge on feature folders unless a different maintained reference shape is explicitly intentional.
