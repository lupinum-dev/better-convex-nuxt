# Better Convex Nuxt Starters

These starters are separate apps, not one configurable template.

Use the smallest starter that matches the product you are building:

- `public`: public Nuxt + Convex app, no auth.
- `team`: B2B SaaS baseline with organizations, memberships, invites, RBAC, and audit.
- `agency`: agency/client workspace model with delegated client access.
- `mcp-agent`: team-style app with service actors and MCP tool adapters.
- `vertical-ai`: AI workflow starter where agents create drafts and humans approve canonical changes.

Current implementation and verification notes are in
[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).

The starters intentionally duplicate some backend access code. Do not extract a
shared B2B package until two starters have the same tested invariant and the
extracted API is smaller than the duplicated code.
