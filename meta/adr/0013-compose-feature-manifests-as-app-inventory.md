# 0013: Compose Feature Manifests As The App Inventory

Status: Accepted
Date: 2026-04-29

## Context

Feature folders are useful as a file layout, but layout alone does not give Trellis enough information to enforce framework boundaries. The runtime and doctor need a reliable inventory of schema tables, permissions, tenant-scoped tables, global tables, capabilities, and operations.

## Decision

Feature folders expose manifests through `defineFeature(...)`, and apps compose them through `composeFeatures(...)`.

The composed manifest is the app inventory used to merge schema, collect permissions, derive tenant table classification, preserve explicit global-table classification, and catch duplicate feature/schema/permission declarations.

## Consequences

Feature folders are not only directories; they are typed framework boundaries.

Generated code, maintained examples, `doctor`, and analysis checks should prefer the composed manifest over hand-maintained parallel lists.

Schema tables with `workspaceId` and `by_workspace` can be derived as tenant-scoped, while explicit `globalTables` keep tenant-independent tables out of isolation.
