import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { definePermission, definePermissionKey } from '../../src/runtime/auth'
import {
  defineOperationDescriptor,
  getOperationMetadata,
  implementOperation,
  trellisOperationProjectionMetadataKey,
} from '../../src/runtime/functions'

describe('operation descriptors', () => {
  it('binds a shared descriptor to a Convex operation implementation', () => {
    const projectDeleteKey = definePermissionKey('projects.delete')
    const projectDelete = definePermission({
      key: projectDeleteKey.key,
      check: true,
    })
    const args = { id: v.string() }

    const descriptor = defineOperationDescriptor({
      id: 'projects.delete',
      kind: 'destructive',
      args,
      permission: projectDeleteKey,
      safety: 'destructive-write',
    })

    const operation = implementOperation(descriptor, {
      guard: projectDelete,
      permission: projectDelete,
      preview: async () => ({
        display: { summary: 'Delete project' },
        confirm: { id: 'project-1' },
      }),
      handler: async () => ({ ok: true }),
    })

    expect(operation.id).toBe('projects.delete')
    expect(operation.kind).toBe('destructive')
    expect(operation.args).toBe(args)
    expect(getOperationMetadata(operation)).toMatchObject({
      id: 'projects.delete',
      kind: 'destructive',
      permissionKey: 'projects.delete',
      safety: 'destructive-write',
    })
    expect(operation[trellisOperationProjectionMetadataKey]).toEqual({
      operationId: 'projects.delete',
      projection: 'execute',
    })
  })

  it('rejects descriptor and implementation arg drift', () => {
    const descriptor = defineOperationDescriptor({
      id: 'projects.archive',
      kind: 'destructive',
      args: { id: v.string() },
    })

    expect(() =>
      implementOperation(descriptor, {
        args: { id: v.string() },
        guard: definePermission({ key: 'projects.archive', check: true }),
        handler: async () => null,
      } as never),
    ).toThrow('args that does not match the operation descriptor')
  })

  it('rejects descriptor and implementation permission drift', () => {
    const descriptor = defineOperationDescriptor({
      id: 'projects.archive',
      kind: 'destructive',
      args: { id: v.string() },
      permission: definePermissionKey('projects.archive'),
    })

    expect(() =>
      implementOperation(descriptor, {
        args: descriptor.args,
        guard: definePermission({ key: 'projects.write', check: true }),
        permission: definePermission({ key: 'projects.write', check: true }),
        handler: async () => null,
      } as never),
    ).toThrow('uses "projects.archive"')
  })
})
