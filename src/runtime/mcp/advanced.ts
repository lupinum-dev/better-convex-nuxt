// Advanced/internal MCP surface.
//
// The blessed first-reader Trellis 1.0 lanes are `defineMcpApp` and the
// `mcp.tool.{query,mutation,operation}` factories returned by it. They cover
// the common cases: a Convex ref backs the tool and Trellis owns auth,
// preview, confirmation, tenant binding, and result envelope shape.
//
// `defineMcpTool` and `defineTool` are the older low-level entry points.
// They give a consumer full handler control, but skip the structural
// guarantees the blessed lanes enforce. Keep them for tools that genuinely
// need multi-step orchestration outside a single Convex ref. Do not teach
// them in first-reader docs.
export { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
export { defineTool } from './define-convex-tool.js'
