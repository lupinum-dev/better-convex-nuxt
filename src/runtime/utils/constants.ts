// ============================================================
// useState keys — single source of truth for all Nuxt state keys
// ============================================================
export const STATE_KEY_TOKEN = 'convex:token'
export const STATE_KEY_USER = 'convex:user'
export const STATE_KEY_PENDING = 'convex:pending'
export const STATE_KEY_AUTH_ERROR = 'convex:authError'
/** @dev Only allocated when import.meta.dev is true */
export const STATE_KEY_AUTH_WATERFALL = 'convex:authWaterfall'
/** @dev Only allocated when import.meta.dev is true */
export const STATE_KEY_AUTH_TRACE_ID = 'convex:authTraceId'
/** @dev Only allocated when import.meta.dev is true */
export const STATE_KEY_DEVTOOLS_INSTANCE_ID = 'convex:devtoolsInstanceId'

// ============================================================
// Better Auth cookie names
// ============================================================

export const BETTER_AUTH_SESSION_COOKIE_NAME = 'better-auth.session_token'
export const BETTER_AUTH_SECURE_SESSION_COOKIE_NAME = '__Secure-better-auth.session_token'

// ============================================================
// Timeouts — all values in milliseconds
// ============================================================

/** How long to cache the last fetched token before re-fetching. */
export const TOKEN_CACHE_MS = 10_000

/**
 * Safety buffer subtracted from JWT expiry before considering it expired.
 * Ensures tokens are refreshed before they actually expire.
 */
export const TOKEN_EXPIRY_SAFETY_BUFFER_MS = 30_000

/** Timeout for auth state to settle (e.g. awaitAuthReady). */
export const AUTH_REFRESH_TIMEOUT_MS = 5_000

/** Timeout used by the global auth middleware waiting for auth to settle. */
export const AUTH_MIDDLEWARE_TIMEOUT_MS = 5_000

/** HTTP timeout for server-side auth token exchange. */
export const SERVER_FETCH_TIMEOUT_MS = 8_000

/** Timeout for one-shot subscription queries to resolve. */
export const SUBSCRIPTION_TIMEOUT_MS = 10_000

/** Debounce window to prevent multiple rapid unauthorized redirects. */
export const UNAUTHORIZED_REDIRECT_DEBOUNCE_MS = 1_500

/**
 * Grace period after client mount before showing offline UI.
 * Prevents a flash of "offline" state during initial WebSocket setup.
 */
export const CONNECTION_HYDRATION_GRACE_MS = 500

// ============================================================
// Upload defaults
// ============================================================

/** Default maximum number of concurrent uploads for useConvexUpload queue mode. */
export const DEFAULT_UPLOAD_MAX_CONCURRENT = 3

// ============================================================
// DevTools
// ============================================================

/**
 * Returns a BroadcastChannel name scoped to the current origin.
 * Prevents DevTools messages from leaking between different apps
 * running on different ports during development.
 */
export const getDevtoolsChannelName = (origin: string) =>
  `convex-devtools:${origin}`
