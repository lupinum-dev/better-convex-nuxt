/**
 * Playground-only example: extend ConvexUser returned by useConvexAuth().
 *
 * This demonstrates module augmentation for local development in this repo.
 * Runtime values only appear if these claims are present in the Convex JWT.
 */
declare module '../../src/runtime/utils/types' {
  interface ConvexUser {
    role?: 'owner' | 'admin' | 'member' | 'viewer'
    authId?: string
    organizationId?: string
  }
}

export {}
