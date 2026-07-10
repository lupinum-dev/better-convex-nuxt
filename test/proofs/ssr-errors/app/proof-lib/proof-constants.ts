// Shared between the fixture app and the vitest proof so the byte-scan asserts
// against the exact same strings the app embeds.

// Present ONLY inside ConvexCallError.cause. Must never reach HTML/payload/logs.
export const SENTINEL_SECRET = 'SUPER_SECRET_CAUSE_9f83a1b7c0deadbeef'

// Public, safe fields that MUST survive serialization (positive control).
export const PUBLIC_DATA_MARKER = 'safe-visible-data-marker-42'
export const PUBLIC_MESSAGE = 'Convex query failed'
export const PUBLIC_CODE = 'PROOF_SERVER_ERR'
export const PUBLIC_STATUS = 500

export const proofErrorData = {
  code: PUBLIC_CODE,
  detail: PUBLIC_DATA_MARKER,
}
