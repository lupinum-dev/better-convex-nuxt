# Example 06 — Multi-Workspace Agency Portal

The multi-tenant escalation. Users belong to multiple workspaces through explicit memberships,
and agency users get controlled cross-tenant views without weakening the normal tenant boundary.

## What this example teaches (beyond 01-05)

- **Multi-workspace membership** — users join multiple workspaces, each with a role
- **Workspace switching** — explicit `switchWorkspace` mutation changes active context
- **Cross-tenant dashboard** — agency users see across assigned clients only
- **Agency role separation** — agency roles and client roles coexist in the same model
- **Tenant boundary preservation** — cross-client views never weaken per-workspace isolation

## Auth shape

- Users may belong to multiple workspaces through `memberships`
- Current workspace is explicit on the user row
- Agency roles and client roles coexist in the same membership model

## Running

```bash
pnpm install
pnpm dev
```

## Testing

```bash
pnpm test
```

## Demo flow

1. Sign up and create a client workspace
2. Seed an agency portfolio
3. Switch between workspaces
4. Compare the current-workspace project view with the cross-client agency dashboard
