/**
 * Playground-only example: extend ConvexUser returned by useConvexAuth().
 *
 * This demonstrates module augmentation for local development in this repo.
 * The runtime decoder only fills the normalized identity fields.
 */
declare module '../../src/runtime/utils/types' {
  interface ConvexUser {
    role?: 'owner' | 'admin' | 'member' | 'viewer'
    authId?: string
    organizationId?: string
  }
}

export {}
