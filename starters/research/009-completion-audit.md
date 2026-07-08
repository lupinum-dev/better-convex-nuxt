# 009 Completion Audit

This audit checks whether the research folder satisfies the requested scope:
collect learnings from the local projects and Convex ecosystem, do multiple
research passes, and produce starter requirements with enough confidence to
begin implementation without rebuilding Trellis or Lupinum.

## Scope Check

| Requirement                                | Status | Evidence                                                                                                                                          |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `starters/research`                 | Done   | This folder and the indexed research files exist.                                                                                                 |
| Use `better-convex-nuxt` as starting point | Done   | `001-local-lessons.md`, `007-hosting-and-api-fit.md`, `008-implementation-readiness.md`                                                           |
| Apply Trellis lessons                      | Done   | `001-local-lessons.md`, `005-mcp-and-agents.md`                                                                                                   |
| Apply Lupinum lessons                      | Done   | `001-local-lessons.md`, `006-decisions-and-open-questions.md`, `008-implementation-readiness.md`                                                  |
| Apply `convex-tenants` lessons             | Done   | `001-local-lessons.md`, `002-external-evidence.md`, `003-requirements.md`                                                                         |
| Apply `convex-authz` lessons               | Done   | `001-local-lessons.md`, `002-external-evidence.md`, `003-requirements.md`                                                                         |
| Apply `convex-helpers` lessons             | Done   | `001-local-lessons.md`, especially the custom function, RLS, zod, trigger, and API-generation notes.                                              |
| Research Convex Agents                     | Done   | `002-external-evidence.md`, `005-mcp-and-agents.md`, `007-hosting-and-api-fit.md`                                                                 |
| Research MCP direction                     | Done   | `002-external-evidence.md`, `005-mcp-and-agents.md`, `007-hosting-and-api-fit.md`                                                                 |
| Research B2B / vertical SaaS needs         | Done   | `002-external-evidence.md`, `003-requirements.md`, `004-starter-matrix.md`                                                                        |
| Produce all requirements                   | Done   | `003-requirements.md`, `004-starter-matrix.md`, `008-implementation-readiness.md`                                                                 |
| Produce multiple passes                    | Done   | Passes are split across local lessons, external evidence, requirements, MCP/agents, hosting/API fit, and implementation readiness.                |
| Reach actionable confidence                | Done   | `006-decisions-and-open-questions.md` separates high, medium, and low confidence; `008-implementation-readiness.md` defines file lists and gates. |

## Confidence Result

The research is sufficient to start implementation for:

- `public`
- `team`
- `agency`

The research is sufficient to start a narrow spike for:

- `mcp-agent` MCP host choice
- Convex Agent approval/context integration

The research is not sufficient to implement these as default starter machinery
yet:

- shared `convex-b2b` package;
- generated MCP wrappers;
- Trellis-style doctor;
- public OAuth MCP;
- WorkOS/SSO/SCIM defaults;
- ABAC/ReBAC/materialized permission models.

## Decision Boundary

The next implementation step should be one starter, not another platform pass.

Recommended first implementation:

1. Build `starters/public`.
2. Build `starters/team`.
3. Build `starters/agency`.
4. Spike `starters/mcp-agent` host/runtime choices before hardening it.

Do not extract shared packages until `team` and `agency` both repeat the same
tested invariants.

## Remaining Open Questions

The open questions in `006-decisions-and-open-questions.md` are not blockers
for starting `public`, `team`, or `agency`. They are blockers only for deciding
the permanent MCP host and for deciding whether common B2B code deserves a
shared package.
