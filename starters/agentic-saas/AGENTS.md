# Agentic SaaS Starter Guardrails

- Better Auth owns users, organizations, memberships, invitations, roles, and sessions.
- App tables may store Better Auth ids as strings; do not add app-owned organization or membership mirrors.
- Agents never receive ambient authority. Every tool call must pass through an app-owned `agentRuns` delegation record.
- Agent tools are adapters over normal product mutations or draft mutations.
- Default agent writes create draft/proposal state; canonical product state requires human approval.
- Audit must distinguish agent actors from users and record the delegating Better Auth user id.
- Do not add real provider SDK imports or provider API-key env access until provider-backed execution is proven in this starter.
