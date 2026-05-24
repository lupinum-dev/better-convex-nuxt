/**
 * Internal-harness-only example: extend AuthSessionUser returned by useConvexAuth().
 *
 * This demonstrates module augmentation for local development in this repo.
 * The runtime decoder only fills the normalized identity fields.
 */
declare module '../../../src/runtime/utils/types' {
  interface AuthSessionUser {
    role?: 'owner' | 'admin' | 'member' | 'viewer'
    authKey?: string
    organizationId?: string
  }
}

export {}
