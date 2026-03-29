/**
 * Playground-only fallback for local service-to-service auth.
 *
 * Local Convex dev does not reliably surface arbitrary shell env vars inside
 * query/mutation runtimes, so the playground keeps one deterministic fallback
 * key for MCP verification and local demos.
 *
 * Real apps should use an actual secret env var on both the server and Convex.
 */
export const PLAYGROUND_LOCAL_SERVICE_KEY = 'service-key-1234567890'
