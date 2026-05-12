import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { definePermission, definePermissionKey } from '../../src/runtime/auth'
import {
  defineOperationDescriptor,
  getOperationMetadata,
  implementOperation,
  operationPreview,
  operationPreviewValidator,
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
      preview: async () =>
        operationPreview({ summary: 'Delete project', confirm: { id: 'project-1' } }),
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

  it('rejects descriptor and implementation result schema drift', () => {
    const returns = v.object({ ok: v.boolean() })
    const previewReturns = operationPreviewValidator({
      confirm: v.object({ id: v.string() }),
    })
    const descriptor = defineOperationDescriptor({
      id: 'projects.archive',
      kind: 'destructive',
      args: { id: v.string() },
      returns,
      previewReturns,
    })

    expect(() =>
      implementOperation(descriptor, {
        returns: v.null(),
        guard: definePermission({ key: 'projects.archive', check: true }),
        preview: async () =>
          operationPreview({ summary: 'Archive project', confirm: { id: 'project-1' } }),
        handler: async () => null,
      } as never),
    ).toThrow('implementOperation(projects.archive) received returns')

    expect(() =>
      implementOperation(descriptor, {
        previewReturns: v.null(),
        guard: definePermission({ key: 'projects.archive', check: true }),
        preview: async () =>
          operationPreview({ summary: 'Archive project', confirm: { id: 'project-1' } }),
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow('implementOperation(projects.archive) received previewReturns')
  })

  it('rejects descriptor and implementation safety drift', () => {
    const descriptor = defineOperationDescriptor({
      id: 'projects.create',
      name: 'CreateProject',
      kind: 'safe',
      args: { name: v.string() },
      safety: 'bounded-write',
    })

    expect(() =>
      implementOperation(descriptor, {
        safety: 'sensitive-write',
        guard: definePermission({ key: 'projects.create', check: true }),
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow('implementOperation(projects.create) received safety')
  })

  it('rejects descriptor and implementation name drift', () => {
    const descriptor = defineOperationDescriptor({
      id: 'projects.rename',
      name: 'RenameProject',
      kind: 'safe',
      args: { id: v.string(), name: v.string() },
    })

    expect(() =>
      implementOperation(descriptor, {
        name: 'ChangeProjectName',
        guard: definePermission({ key: 'projects.rename', check: true }),
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow('implementOperation(projects.rename) received name')
  })

  it('requires destructive descriptor implementations to provide a preview handler', () => {
    const descriptor = defineOperationDescriptor({
      id: 'projects.delete',
      kind: 'destructive',
      args: { id: v.string() },
    })

    expect(() =>
      implementOperation(descriptor, {
        guard: definePermission({ key: 'projects.delete', check: true }),
        handler: async () => ({ ok: true }),
      } as never),
    ).toThrow('implementOperation(projects.delete) requires a preview handler')
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
