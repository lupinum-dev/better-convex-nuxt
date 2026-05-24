import type { Ref } from 'vue'

import { useState } from '#app'

import type { AuthBootstrapState, AccessContextState } from './types.js'

export type PermissionDevtoolsState = AccessContextState
export type AuthBootstrapDevtoolsState = AuthBootstrapState

const PERMISSIONS_STATE_KEY = 'trellis:devtools:permissions'
const AUTH_BOOTSTRAP_STATE_KEY = 'trellis:devtools:auth-bootstrap'

export function usePermissionDevtoolsState(): Ref<PermissionDevtoolsState> {
  return useState<PermissionDevtoolsState>(PERMISSIONS_STATE_KEY, () => ({
    queryName: null,
    pending: false,
    ready: false,
    ctx: null,
    inventory: [],
    error: null,
  }))
}

export function useAuthBootstrapDevtoolsState(): Ref<AuthBootstrapDevtoolsState> {
  return useState<AuthBootstrapDevtoolsState>(AUTH_BOOTSTRAP_STATE_KEY, () => ({
    mutationName: null,
    pending: false,
    ensured: false,
    error: null,
  }))
}
