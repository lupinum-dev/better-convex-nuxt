import type { Ref } from 'vue'

import { useState } from '#app'

export interface PermissionDevtoolsState {
  queryName: string | null
  pending: boolean
  ready: boolean
  ctx: unknown | null
  error: string | null
}

export interface AuthBootstrapDevtoolsState {
  mutationName: string | null
  pending: boolean
  ensured: boolean
  lastUserId: string | null
  error: string | null
}

const PERMISSIONS_STATE_KEY = 'better-convex:devtools:permissions'
const AUTH_BOOTSTRAP_STATE_KEY = 'better-convex:devtools:auth-bootstrap'

export function usePermissionDevtoolsState(): Ref<PermissionDevtoolsState> {
  return useState<PermissionDevtoolsState>(PERMISSIONS_STATE_KEY, () => ({
    queryName: null,
    pending: false,
    ready: false,
    ctx: null,
    error: null,
  }))
}

export function useAuthBootstrapDevtoolsState(): Ref<AuthBootstrapDevtoolsState> {
  return useState<AuthBootstrapDevtoolsState>(AUTH_BOOTSTRAP_STATE_KEY, () => ({
    mutationName: null,
    pending: false,
    ensured: false,
    lastUserId: null,
    error: null,
  }))
}
