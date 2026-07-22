# MCP topology comparison — evidence in progress

This is the canonical `P1-017` comparison record. It is deliberately incomplete until `P1-015` and
`P1-016` finish. No winner may be inferred from the current table.

| Gate                            | Convex-native                           | Nitro-native                                                   | Current evidence / remaining proof                                                                  |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Official SDK owns wire behavior | Pass                                    | Pass                                                           | Exact beta.5 pin; legacy plus modern 2026 production clients pass; final SDK reconciliation remains |
| Canonical bearer resource       | One Convex `/mcp` verifier              | Nitro `/api/mcp`; bearer stops before Convex                   | Executed tracing and token-absence scans pass                                                       |
| Application authority           | Same Convex operation                   | Same Convex operation after exact call                         | Current membership/role, tenant, scope ceiling, revocation pass                                     |
| Internal credential             | None                                    | Dedicated Ed25519 proof                                        | Candidate B requires rotation and deployment audience operations                                    |
| Runtime/deployment count        | One                                     | Two                                                            | Cloud ownership and failure recovery remain to be measured                                          |
| Extra network boundary          | None                                    | Nitro → Convex                                                 | Bounded and coarse-failure behavior passes locally                                                  |
| Local warm read latency         | 51–86 ms median                         | 10–13 ms median                                                | Multiple 20-call runs; loopback/noisy only, no production conclusion                                |
| URL interaction                 | Final-protocol gate open                | Final-protocol gate open                                       | `P1-013`, `P1-015`                                                                                  |
| MCP Apps                        | Current official extension probe passes | Current official extension probe passes                        | Final host matrix remains                                                                           |
| Inspector/conformance           | Current-final preflight passes          | Current-final preflight passes through full exact-call path    | Final suite and real hosts remain                                                                   |
| Failure recovery                | Single runtime failure                  | Nitro can survive and report stopped Convex coarsely           | Cloud retries/timeouts/operator recovery remain                                                     |
| Deletion cost if losing         | Convex MCP fixture and beta relay path  | Nitro MCP server, exact-call signer/verifier/routes/key config | Final ADR must name exact files/dependencies                                                        |

Current interpretation:

- Candidate A remains structurally simpler and framework-neutral.
- Candidate B is now a real fallback rather than two disconnected proofs and is materially faster in
  the local warm-read sample.
- The performance result does not outweigh the additional credential, deployment, timeout, and recovery
  ownership without production evidence.
- The final protocol may still invalidate either candidate. `G-001` remains open.
