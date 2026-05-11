# 0014: Use Component Bridges For Packaged Integrations

Status: Accepted
Date: 2026-04-29

## Context

Most Trellis apps can call their own root Convex handlers directly. Packaged integrations are different: a reusable package may need to install host bridge files, manage host-owned config edits, and expose stable root refs while hiding internal component refactors.

Calling internal component refs directly from host apps creates unstable consumer contracts.

## Decision

Trellis uses component bridges for packaged integrations.

Bridge-aware packages publish a manifest. Bridge-owned tooling in `@lupinum/trellis-bridge` installs, regenerates, inspects, and checks generated host files and managed edits. Runtime helpers such as `createComponentBridge(...)` sign forwarding envelopes into component refs without bypassing guards or app-owned actor logic.

## Consequences

The bridge is a packaged-integration seam, not a general authorization shortcut.

Normal app-local flows should stay on root handlers, `serverConvex*` helpers, feature folders, and trusted forwarding.

Bridge drift is treated as a checkable framework concern, so package integrations can be maintained without asking consumers to manually call private component internals.
