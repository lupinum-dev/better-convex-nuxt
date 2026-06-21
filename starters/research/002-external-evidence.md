# 002 External Evidence

## Convex Agents

Sources:

- https://docs.convex.dev/agents/overview
- https://docs.convex.dev/agents/tools
- https://docs.convex.dev/agents/tool-approval
- https://docs.convex.dev/agents/usage-tracking
- https://docs.convex.dev/agents/rate-limiting

Findings:

- Convex Agent is already the correct default for persisted agent threads,
  messages, streaming, context, tools, workflows, RAG, files, debugging, usage
  tracking, and rate limiting.
- Tools can call Convex queries, mutations, and actions from an action context.
- Tool context can carry extra fields such as organization/workspace identity.
- Tool approval is built around persisted approval requests and server-side
  approve/deny/continue functions.
- Starters should compose Convex Agent before inventing agent persistence.

Requirement:

Starter code must not build a generic agent-state component unless a real
starter cannot express its actor/workspace/approval model with Convex Agent.

## Convex Components

Sources:

- https://docs.convex.dev/components/authoring
- https://docs.convex.dev/components/using

Findings:

- Components are appropriate when reusable persistent state should be isolated
  behind a component API.
- Components have their own schema, functions, generated code, and execution
  environment.
- `ctx.auth` is not available inside components; app functions authenticate and
  pass identifiers into the component.
- Component API IDs cross boundaries as strings, not app-table `Id<T>` types.
- Hybrid components add compatibility complexity.

Requirement:

Use a Convex component only when reusable persistent state is worth the
component boundary. Otherwise prefer app-owned files or plain library helpers.

## MCP

Sources:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices

Findings:

- MCP authorization for HTTP transports is OAuth-oriented and explicitly about
  clients making requests on behalf of resource owners.
- MCP tools are model-controlled. The protocol recommends human visibility and
  confirmation for sensitive operations.
- Tool metadata/annotations are descriptive and not sufficient enforcement.
- Servers must validate tool inputs, implement access controls, rate-limit tool
  calls, sanitize outputs, and audit tool usage.

Requirement:

MCP starter code must resolve a caller into the same backend actor model used by
the app, then call normal Convex functions. It must not create a separate MCP
authorization system.

## B2B SaaS

Sources:

- https://workos.com/blog/user-management-for-b2b-saas
- https://workos.com/blog/model-your-b2b-saas-with-organizations
- https://workos.com/blog/enterprise-readiness-checklist-2026

Findings:

- B2B SaaS starts with authentication but quickly becomes organizations, roles,
  SSO, SCIM, audit trails, and lifecycle management.
- Organizations are the primary account/access boundary.
- Users and memberships should be separate so one user can belong to multiple
  organizations with different roles.
- Invitations, pending memberships, domain join, lifecycle status, and audit
  logs are recurring requirements.
- Delegated access/impersonation needs secure flows, clear UI indicators, and
  audit.
- SSO/SCIM/MFA are important but often better bought or deferred until the
  starter is targeting enterprise readiness.

Requirement:

The `team` and `agency` starters need real organization, membership, invitation,
role, and audit models. SSO/SCIM should be integration recipes, not default
infrastructure.

## Convex Authz And Tenants Components

Sources:

- https://www.convex.dev/components/djpanda/convex-authz
- https://www.convex.dev/components/djpanda/convex-tenants
- Local repos: `/Users/matthias/Git/convex/convex-authz`,
  `/Users/matthias/Git/convex/convex-tenants`.

Findings:

- `convex-tenants` proves that org/member/team/invitation components are
  viable in Convex.
- `convex-authz` proves advanced authorization can be componentized, including
  materialized permission lookups and ReBAC.
- The combination is powerful but too heavy as a universal starter default.

Requirement:

Start with simple app-owned RBAC in prepared starters. Treat advanced authz as
a later enterprise starter or explicit package choice.
