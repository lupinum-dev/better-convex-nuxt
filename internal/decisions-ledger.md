# Better Convex vNext decision ledger

This is the canonical index of implementation decisions made while proving
[`RFC-better-convex-vnext.md`](./RFC-better-convex-vnext.md). The RFC owns normative product invariants;
this ledger records evidence-backed choices, rejected paths, and decisions that remain gated. The task
ledger points here instead of maintaining a second architectural history.

## Accepted decisions

| ID      | Decision                                                                                                                                                          | Evidence                                                                                                 | Consequence / deletion obligation                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `D-001` | MCP is optional and official-SDK-owned at the wire boundary; application Convex functions remain canonical.                                                       | RFC product boundary; `internal/evidence/mcp-spec-checkpoint-2026-07-20.md`                              | No proprietary agent protocol, automatic function dispatcher, or application-policy database.                         |
| `D-002` | `2025-11-25` remains the latest final MCP revision at the 2026-07-20 checkpoint; `2026-07-28` behavior is private RC evidence only until publication.             | `internal/evidence/mcp-spec-checkpoint-2026-07-20.md`                                                    | Public MCP API stabilization remains gated by `P1-015`.                                                               |
| `D-003` | The neutral topology workload is application-owned notes state with explicit search, rename, delete, report, and resource operations.                             | `internal/labs/mcp-topology/neutral/notes-application.ts`; `test/unit/vnext-neutral-notes.test.ts`       | No transport abstraction, approval framework, or job state in the neutral domain.                                     |
| `D-004` | Exact MCP SDK v2 beta packages are dev-only private laboratory dependencies.                                                                                      | `internal/evidence/mcp-sdk-lab-pin-2026-07-20.md`                                                        | Replace/reconcile the pin after the final SDK; no final support claim.                                                |
| `D-005` | The official MCP server SDK is executable in a deployed Convex HTTP action without a parser fork, Node polyfill, or patch.                                        | `internal/evidence/mcp-convex-probe-2026-07-20.md`; `internal/evidence/mcp-runtime-purity-2026-07-20.md` | Convex-native remains preferred while later hard gates are proved.                                                    |
| `D-006` | Nitro exact-call fallback is technically viable with Ed25519, pinned Convex canonical encoding, fixed wrappers, and application-owned replay. It remains private. | `internal/evidence/mcp-nitro-exact-call-2026-07-21.md`                                                   | If Nitro loses, delete the whole prototype. If it wins, retain no generic dispatcher or public Trusted Calls product. |
| `D-007` | Provider-neutral local Convex fixtures may require function readiness without fabricated Better Auth routes or injected auth secrets.                             | Deployed `P1-011` proof; `test/helpers/local-convex.ts`                                                  | Better Auth readiness remains the existing default; neutral mode is explicit and test-only.                           |

## Pending decision gates

| ID      | Decision required                                                               | Entry evidence                                                                | Current status                                |
| ------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `G-001` | Select Convex-native or Nitro-native as the one MCP topology.                   | `P1-007`–`P1-017`, final spec/SDK, conformance, hosts, latency and operations | Open; Candidate A preferred but not accepted. |
| `G-002` | Select the one public Vue reactive execution gate.                              | Phase 3 migration and cross-adapter behavior                                  | Open.                                         |
| `G-003` | Place the optional Better Auth MCP adapter at the smallest dependency boundary. | Phase 5 provider graph plus one external verifier                             | Open.                                         |
| `G-004` | Decide whether Tasks is admitted at all.                                        | Every `P8-001` entry condition                                                | Blocked; Tasks do not block 1.0.              |
| `G-005` | Rename/rebrand the repository after package cutover.                            | Phase 4 exact-package cutover and owner authority                             | Deferred; no early symmetry move.             |

## Rejected product paths

| ID      | Rejected path                                                            | Reason / simpler retained path                                                                                 |
| ------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `R-001` | Public `@better-convex/core`                                             | Keep one private client source island until another framework proves a public contract is necessary.           |
| `R-002` | Public Trusted Calls or generic service-proof package                    | Exact-call proof is a topology-specific internal fallback. Multiple non-MCP consumers would require a new RFC. |
| `R-003` | Commands/prepare-confirm package                                         | Ordinary writes remain tools; high-impact work uses negotiated MCP interaction over application-owned state.   |
| `R-004` | Universal principal/RBAC/authorization DSL                               | Preserve identity provenance; applications map `(issuer, subject)` and re-read current authority.              |
| `R-005` | Automatic exposure or generic dispatch of Convex functions               | Every tool/resource maps explicitly to one application operation.                                              |
| `R-006` | Two maintained MCP protocol topologies                                   | Complete both probes, select one, delete the loser.                                                            |
| `R-007` | Better-Convex-owned approval, handoff, workflow, replay, or job database | Project application-owned canonical records and idempotency.                                                   |
| `R-008` | Legacy Tasks API or speculative Tasks compatibility                      | Wait for final extension, SDK, two clients, and a real deferred job that cannot use structured status.         |
| `R-009` | Better Auth as the provider-neutral MCP boundary                         | Keep it as an optional first-party adapter and prove an external verifier.                                     |
| `R-010` | Roles/permissions in tokens or OAuth scopes as current authority         | Scopes are ceilings; each effect reloads canonical application authority.                                      |

## Update rule

- Add or amend an entry in the same commit as the evidence that changes the decision.
- Never silently rewrite an accepted decision. Record replacement evidence and the superseded ID.
- A pending gate is not an accepted API.
- Detailed experiments belong in `internal/evidence/**`; this file retains only the durable conclusion.
