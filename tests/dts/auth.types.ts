import { definePermission, definePermissionContext } from '@lupinum/trellis/auth'
import { expectTypeOf } from 'vitest'

const readPermission = definePermission({
  key: 'task.read',
  check: true,
})

const publishPermission = definePermission({
  key: 'task.publish',
  check: true,
  project: false,
})

const _permissionContext = definePermissionContext({
  permissions: [readPermission, publishPermission] as const,
  resolve: async (_ctx: { principal: { userId: string } }) => ({
    userId: 'user_1',
    tenantId: 'workspace_1',
    role: 'owner' as const,
  }),
  extend: (_ctx, actor) => ({
    displayName: actor.userId,
  }),
})

type PermissionContextResult = Awaited<ReturnType<typeof _permissionContext.handler>>

type ExpectedPermissionContext = {
  userId: string | null
  tenantId: string | null
  role: string | null
  can: {
    'task.read': boolean
  }
  displayName: string
}

expectTypeOf<PermissionContextResult>().toMatchTypeOf<ExpectedPermissionContext | null>()
expectTypeOf<NonNullable<PermissionContextResult>>().toMatchTypeOf<ExpectedPermissionContext>()
