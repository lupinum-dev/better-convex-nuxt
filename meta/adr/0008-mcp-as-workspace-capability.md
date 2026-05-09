# 0008: Treat MCP As A Workspace Capability

Status: Accepted
Date: 2026-04-29

## Context

MCP needs auth, permissions, tenant boundaries, sessions, prompts, resources, tools, and destructive-operation safety. It should not create a second backend model.

## Decision

MCP is a capability layered onto the workspace model, not a separate starter family.

MCP tools project the same app-owned backend model used by browser and server surfaces.

## Consequences

`workspace-mcp` is the canonical starter template for agent-enabled workspace
apps. `workspace --mcp` remains an accepted CLI alias while the next-major
starter surface is being shaped.

MCP examples should emphasize principal forwarding, actor resolution, permission-aware discovery, scoped tools, and operation-backed destructive work.
