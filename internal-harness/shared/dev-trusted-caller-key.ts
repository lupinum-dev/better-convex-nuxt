/**
 * Internal-harness-only fallback for local trusted caller auth.
 *
 * Local Convex dev does not reliably surface arbitrary shell env vars inside
 * query/mutation runtimes, so the internal harness keeps one deterministic fallback
 * key for MCP verification and local demos.
 *
 * Real apps should use an actual secret env var on both the server and Convex.
 */
export const INTERNAL_HARNESS_LOCAL_TRUSTED_CALLER_KEY = 'trusted-caller-key-1234567890'
