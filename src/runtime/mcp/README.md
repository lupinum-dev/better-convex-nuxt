# MCP Runtime Boundaries

`define-mcp-app.ts` wires MCP tools to Trellis runtime context: principal resolution,
delegation, capabilities, rate limits, middleware, observability, and Convex calls.

Error parsing is owned by `../utils/call-result.ts`. MCP-facing normalization is
owned by `error-normalization.ts`.

Destructive confirmation token creation, verification, drift diagnostics, preview
state checks, and replay redemption helpers are owned by
`destructive-confirmation.ts`.

Result envelope policy is owned by `result-envelope.ts` and MCP post-processing
helpers in `mcp-tool-result.ts`.
