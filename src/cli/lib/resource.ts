import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { InitTemplateSet, TemplateFile } from './init.js'

type ResourceAppKind = 'personal' | 'workspace' | 'author-owned'

type ResourceGeneratorContext = {
  kind: ResourceAppKind
  hasMcp: boolean
  hasFeatureManifest: boolean
  ownerField: 'ownerId' | 'authorId'
  tenantField: 'workspaceId' | null
  hasUpdatedAt: boolean
  guardImportPath: '../../auth/guards'
  name: string
  fileStem: string
  singularPascal: string
  singularCamel: string
  pluralPascal: string
  pluralCamel: string
  tableName: string
  permissionPrefix: string
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function kebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function camelCase(value: string): string {
  const parts = kebabCase(value).split('-').filter(Boolean)
  if (parts.length === 0) return 'resource'
  return (
    parts[0] +
    parts
      .slice(1)
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join('')
  )
}

function pascalCase(value: string): string {
  const camel = camelCase(value)
  return camel[0]!.toUpperCase() + camel.slice(1)
}

function pluralize(value: string): string {
  if (value.endsWith('y') && !/[aeiou]y$/i.test(value)) {
    return `${value.slice(0, -1)}ies`
  }
  if (/[sxz]$|ch$|sh$/i.test(value)) {
    return `${value}es`
  }
  return `${value}s`
}

async function inferResourceContext(cwd: string, name: string): Promise<ResourceGeneratorContext> {
  const schemaPath = resolve(cwd, 'convex/schema.ts')
  const schemaSource = await readFile(schemaPath, 'utf8')
  const hasWorkspaceCaller = await exists(resolve(cwd, 'convex/auth/caller.ts'))
  const hasAuthorOwnedPages = await exists(resolve(cwd, 'convex/features/pages/domain.ts'))
  const kind: ResourceAppKind = hasWorkspaceCaller
    ? 'workspace'
    : hasAuthorOwnedPages
      ? 'author-owned'
      : 'personal'
  const hasFeatureManifest = await exists(resolve(cwd, 'convex/features/index.ts'))
  const guardImportPath = '../../auth/guards'

  const singularCamel = camelCase(name)
  const singularPascal = pascalCase(name)
  const pluralCamel = pluralize(singularCamel)
  const pluralPascal = pascalCase(pluralCamel)
  const ownerField =
    kind === 'author-owned' || /authorId\s*:/.test(schemaSource) ? 'authorId' : 'ownerId'
  const tenantField = kind === 'workspace' ? 'workspaceId' : null
  const hasUpdatedAt = /updatedAt\s*:/.test(schemaSource)
  const hasMcp =
    (await exists(resolve(cwd, 'server/mcp/runtime.ts'))) ||
    (await exists(resolve(cwd, 'server/mcp/index.ts')))

  return {
    kind,
    hasMcp,
    hasFeatureManifest,
    ownerField,
    tenantField,
    hasUpdatedAt,
    guardImportPath,
    name,
    fileStem: kebabCase(name),
    singularPascal,
    singularCamel,
    pluralPascal,
    pluralCamel,
    tableName: pluralCamel,
    permissionPrefix: singularCamel,
  }
}

function resourceContractTemplate(ctx: ResourceGeneratorContext): string {
  const createName = `create${ctx.singularPascal}`
  const updateName = `update${ctx.singularPascal}`
  const deleteName = `delete${ctx.singularPascal}`
  const getName = `get${ctx.singularPascal}`
  const listName = `list${ctx.pluralPascal}`

  return `
import { defineArgs } from '@lupinum/trellis/args'
import { defineOperationDescriptor, operationPreviewValidator } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export const ${createName} = defineArgs({
  description: 'Create a ${ctx.singularCamel}',
  args: {
    name: v.string(),
  },
})

export const ${updateName} = defineArgs({
  description: 'Update a ${ctx.singularCamel}',
  args: {
    id: v.id('${ctx.tableName}'),
    name: v.string(),
  },
})

export const ${deleteName} = defineArgs({
  description: 'Delete a ${ctx.singularCamel}',
  args: {
    id: v.id('${ctx.tableName}'),
  },
})

export const remove${ctx.singularPascal}Descriptor = defineOperationDescriptor({
  id: '${ctx.tableName}.remove',
  name: 'remove${ctx.singularPascal}',
  kind: 'destructive',
  args: ${deleteName}.args,
  permission: '${ctx.permissionPrefix}.delete',
  safety: 'destructive-write',
  returns: v.null(),
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      operation: v.literal('${ctx.tableName}.remove'),
      targetId: v.id('${ctx.tableName}'),
      affectedCounts: v.object({
        ${ctx.tableName}: v.number(),
      }),
    }),
  }),
})

export const ${getName} = defineArgs({
  description: 'Get one ${ctx.singularCamel}',
  args: {
    id: v.id('${ctx.tableName}'),
  },
})

export const ${listName} = defineArgs({
  description: 'List ${ctx.pluralCamel}',
  args: {},
})
`.trimStart()
}

function resourcePermissionsTemplate(ctx: ResourceGeneratorContext): string {
  const createCheck =
    ctx.kind === 'workspace' ? "hasWorkspace.and(hasMinimumRole('member'))" : 'isAuthenticated'
  const readCheck =
    ctx.kind === 'workspace' ? "hasWorkspace.and(hasMinimumRole('viewer'))" : 'isAuthenticated'
  const deleteCheck =
    ctx.kind === 'workspace' ? "hasWorkspace.and(hasMinimumRole('member'))" : 'isAuthenticated'
  const imports =
    ctx.kind === 'workspace'
      ? `import { hasMinimumRole, hasWorkspace } from '${ctx.guardImportPath}'\n`
      : `import { isAuthenticated } from '${ctx.guardImportPath}'\n`

  return `
import { definePermission } from '@lupinum/trellis/auth'
${imports}
export const ${ctx.singularCamel}ReadPermission = definePermission({
  key: '${ctx.permissionPrefix}.read',
  check: ${readCheck},
})

export const ${ctx.singularCamel}CreatePermission = definePermission({
  key: '${ctx.permissionPrefix}.create',
  check: ${createCheck},
})

export const ${ctx.singularCamel}DeletePermission = definePermission({
  key: '${ctx.permissionPrefix}.delete',
  check: ${deleteCheck},
})

export const ${ctx.singularCamel}Permissions = [
  ${ctx.singularCamel}ReadPermission,
  ${ctx.singularCamel}CreatePermission,
  ${ctx.singularCamel}DeletePermission,
] as const
`.trimStart()
}

function resourceOperationTemplate(ctx: ResourceGeneratorContext): string {
  return `
import { requireRecord } from '@lupinum/trellis/auth'
import { implementOperation, operationEffect, operationIssue, operationPreview, previewOf } from '@lupinum/trellis/backend'

import { remove${ctx.singularPascal}Descriptor } from '../../../shared/features/${ctx.tableName}/contract'
import { ${ctx.singularCamel}DeletePermission } from './permissions'
import { mutation } from '../../functions'

export const remove${ctx.singularPascal}Op = implementOperation(remove${ctx.singularPascal}Descriptor, {
  identityForwardingFunctionRef: 'features/${ctx.tableName}/domain:remove',
  guard: ${ctx.singularCamel}DeletePermission,
  load: async (ctx, args) => {
    const ${ctx.singularCamel} = await ctx.db.get(args.id)
    requireRecord(${ctx.singularCamel}, '${ctx.singularPascal}')
    return { ${ctx.singularCamel} }
  },
  preview: async (_ctx, _args, { ${ctx.singularCamel} }) => operationPreview({
    summary: \`Will permanently delete "\${${ctx.singularCamel}.name}"\`,
    warnings: [operationIssue({ code: 'permanent-delete', message: 'This cannot be undone' })],
    effects: [operationEffect({ kind: '${ctx.tableName}', summary: '${ctx.singularPascal} records deleted', count: 1 })],
    confirm: {
      operation: '${ctx.tableName}.remove',
      targetId: ${ctx.singularCamel}._id,
      affectedCounts: { ${ctx.tableName}: 1 },
    },
  }),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
    return null
  },
})

export const previewRemove${ctx.singularPascal} = mutation.protected(previewOf(remove${ctx.singularPascal}Op))
`.trimStart()
}

function resourceDomainTemplate(ctx: ResourceGeneratorContext): string {
  const contractImport = `../../../shared/features/${ctx.tableName}/contract`
  const updateOwnerCheck =
    ctx.kind === 'workspace'
      ? "appIdentity.role === 'owner' || appIdentity.role === 'admin' || appIdentity.userId === loaded.ownerId"
      : `appIdentity.userId === loaded.${ctx.ownerField}`
  const listQuery = ctx.tenantField
    ? `.withIndex('by_workspace', (q) => q.eq('${ctx.tenantField}', appIdentity.workspaceId!))`
    : `.withIndex('by_${ctx.ownerField === 'authorId' ? 'author' : 'owner'}', (q) => q.eq('${ctx.ownerField}', appIdentity.userId))`
  const createFields = [
    `${ctx.ownerField}: appIdentity.userId`,
    `name: args.name`,
    ...(ctx.tenantField ? [`${ctx.tenantField}: appIdentity.workspaceId!`] : []),
    'createdAt: now',
    ...(ctx.hasUpdatedAt ? ['updatedAt: now'] : []),
  ].join(',\n      ')
  const patchFields = [
    `name: args.name`,
    ...(ctx.hasUpdatedAt ? ['updatedAt: Date.now()'] : []),
  ].join(',\n      ')
  const removeExport = ctx.hasMcp
    ? `export const remove = mutation.protected(remove${ctx.singularPascal}Op)\n`
    : `export const remove = mutation.protected({
  args: delete${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}DeletePermission,
  load: async (ctx, args) => {
    const ${ctx.singularCamel} = await ctx.db.get(args.id)
    requireRecord(${ctx.singularCamel}, '${ctx.singularPascal}')
    return ${ctx.singularCamel}
  },
  authorize: {
    check: async (appIdentity, loaded) => ${updateOwnerCheck},
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
`

  return `
import { requireRecord } from '@lupinum/trellis/auth'
import {
  create${ctx.singularPascal},
  delete${ctx.singularPascal},
  get${ctx.singularPascal},
  list${ctx.pluralPascal},
  update${ctx.singularPascal},
} from '${contractImport}'
import {
  ${ctx.singularCamel}CreatePermission,
  ${ctx.singularCamel}DeletePermission,
  ${ctx.singularCamel}ReadPermission,
} from './permissions'
import { mutation, query } from '../../functions'
${ctx.hasMcp ? `import { remove${ctx.singularPascal}Op } from './operations'\n` : ''}

export const list = query.protected({
  args: list${ctx.pluralPascal}.args,
  guard: ${ctx.singularCamel}ReadPermission,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    return await ctx.db
      .query('${ctx.tableName}')
      ${listQuery}
      .order('desc')
      .collect()
  },
})

export const get = query.protected({
  args: get${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}ReadPermission,
  load: async (ctx, args) => {
    const loaded = await ctx.db.get(args.id)
    requireRecord(loaded, '${ctx.singularPascal}')
    return loaded
  },
  authorize: {
    check: async (appIdentity, loaded) => ${ctx.tenantField ? `loaded.${ctx.tenantField} === appIdentity.workspaceId` : `loaded.${ctx.ownerField} === appIdentity.userId`},
  },
  handler: async (_ctx, _args, loaded) => loaded,
})

export const create = mutation.protected({
  args: create${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}CreatePermission,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    return await ctx.db.insert('${ctx.tableName}', {
      ${createFields}
    })
  },
})

export const update = mutation.protected({
  args: update${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}ReadPermission,
  load: async (ctx, args) => {
    const loaded = await ctx.db.get(args.id)
    requireRecord(loaded, '${ctx.singularPascal}')
    return loaded
  },
  authorize: {
    check: async (appIdentity, loaded) => ${updateOwnerCheck},
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      ${patchFields}
    })
  },
})

${removeExport}`.trimStart()
}

function resourceTestTemplate(ctx: ResourceGeneratorContext): string {
  if (ctx.kind === 'workspace') {
    return `
import { describe, expect, it } from 'vitest'

import { createTestContext } from '@lupinum/trellis/testing'

import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

function createCtx() {
  return createTestContext({ schema, modules })
}

describe('${ctx.tableName}', () => {
  it('allows a workspace member to create and update their own ${ctx.singularCamel}', async () => {
    const ctx = createCtx()
    const tenant = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' as const },
        member: { role: 'member' as const },
      },
    })

    const id = await tenant.users.member.mutation(api.features.${ctx.tableName}.domain.create, { name: 'Draft' })
    await tenant.users.member.mutation(api.features.${ctx.tableName}.domain.update, { id, name: 'Renamed' })

    const rows = await ctx.readAll('${ctx.tableName}')
    expect(rows.find((row) => row._id === id)?.name).toBe('Renamed')
  })

  it('denies a member updating another member\\'s ${ctx.singularCamel}', async () => {
    const ctx = createCtx()
    const tenant = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' as const },
        member: { role: 'member' as const },
        other: { role: 'member' as const },
      },
    })

    const id = await tenant.users.member.mutation(api.features.${ctx.tableName}.domain.create, { name: 'Draft' })

    await expect(
      tenant.users.other.mutation(api.features.${ctx.tableName}.domain.update, { id, name: 'Denied' }),
    ).rejects.toThrow(/Forbidden/)
  })
})
`.trimStart()
  }

  return `
import { describe, expect, it } from 'vitest'

import { createTestContext } from '@lupinum/trellis/testing'

import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

function createCtx() {
  return createTestContext({ schema, modules })
}

async function seedUser(ctx: ReturnType<typeof createCtx>, authKey: string) {
  await ctx.seed('users', {
    authKey,
    email: \`\${authKey}@example.test\`,
    displayName: authKey,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

describe('${ctx.tableName}', () => {
  it('allows the owner to update their own ${ctx.singularCamel}', async () => {
    const ctx = createCtx()
    await seedUser(ctx, 'owner-1')
    const owner = ctx.raw.withIdentity({ subject: 'owner-1', tokenIdentifier: 'owner-1' })
    const id = await owner.mutation(api.features.${ctx.tableName}.domain.create, { name: 'Draft' })

    await owner.mutation(api.features.${ctx.tableName}.domain.update, { id, name: 'Renamed' })

    const rows = await ctx.readAll('${ctx.tableName}')
    expect(rows.find((row) => row._id === id)?.name).toBe('Renamed')
  })

  it('denies another user from updating the owner\\'s ${ctx.singularCamel}', async () => {
    const ctx = createCtx()
    await seedUser(ctx, 'owner-1')
    await seedUser(ctx, 'other-1')
    const owner = ctx.raw.withIdentity({ subject: 'owner-1', tokenIdentifier: 'owner-1' })
    const other = ctx.raw.withIdentity({ subject: 'other-1', tokenIdentifier: 'other-1' })
    const id = await owner.mutation(api.features.${ctx.tableName}.domain.create, { name: 'Draft' })

    await expect(
      other.mutation(api.features.${ctx.tableName}.domain.update, { id, name: 'Denied' }),
    ).rejects.toThrow(/Forbidden/)
  })
})
`.trimStart()
}

function resourceMcpListTemplate(ctx: ResourceGeneratorContext): string {
  return `
import { api } from '#trellis/api'
import { ${ctx.singularCamel}ReadPermission } from '~~/convex/features/${ctx.tableName}'
import { list${ctx.pluralPascal} } from '~~/shared/features/${ctx.tableName}/contract'

import { tool } from '../runtime'

export default tool.query({
  schema: list${ctx.pluralPascal},
  call: api.features.${ctx.tableName}.domain.list,
  permission: ${ctx.singularCamel}ReadPermission,
  meta: {
    name: 'list-${ctx.fileStem}',
  },
})
`.trimStart()
}

function resourceMcpCreateTemplate(ctx: ResourceGeneratorContext): string {
  return `
import { api } from '#trellis/api'
import { stampMcpToolSafety } from '@lupinum/trellis/mcp'
import { ${ctx.singularCamel}CreatePermission } from '~~/convex/features/${ctx.tableName}'
import { create${ctx.singularPascal} } from '~~/shared/features/${ctx.tableName}/contract'

import { tool } from '../runtime'

const create${ctx.singularPascal}Safety = {
  kind: 'bounded-write',
  reason: 'Creates one ${ctx.singularCamel} named by args.',
} as const

export default tool.mutation({
  schema: create${ctx.singularPascal},
  call: stampMcpToolSafety(api.features.${ctx.tableName}.domain.create, create${ctx.singularPascal}Safety),
  permission: ${ctx.singularCamel}CreatePermission,
  safety: create${ctx.singularPascal}Safety,
  meta: {
    name: 'create-${ctx.fileStem}',
  },
})
`.trimStart()
}

function resourceMcpDeleteTemplate(ctx: ResourceGeneratorContext): string {
  return `
import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/backend'
import { api } from '#trellis/api'
import { remove${ctx.singularPascal}Descriptor } from '~~/shared/features/${ctx.tableName}/contract'

import { tool } from '../runtime'

export default tool.operation(remove${ctx.singularPascal}Descriptor, {
  execute: executeOperationRef(
    remove${ctx.singularPascal}Descriptor,
    api.features.${ctx.tableName}.domain.remove,
  ),
  preview: previewOperationRef(
    remove${ctx.singularPascal}Descriptor,
    api.features.${ctx.tableName}.operations.previewRemove${ctx.singularPascal},
  ),
  previewOperation: 'mutation',
  meta: {
    name: 'delete-${ctx.fileStem}',
  },
})
`.trimStart()
}

function schemaTableBlock(ctx: ResourceGeneratorContext): string {
  const lines = [
    `  ${ctx.tableName}: defineTable({`,
    `    ${ctx.ownerField}: v.string(),`,
    ...(ctx.tenantField ? [`    ${ctx.tenantField}: v.id('workspaces'),`] : []),
    '    name: v.string(),',
    '    createdAt: v.number(),',
    ...(ctx.hasUpdatedAt ? ['    updatedAt: v.number(),'] : []),
    `  })`,
    `    .index('by_${ctx.ownerField === 'authorId' ? 'author' : 'owner'}', ['${ctx.ownerField}'])`,
    ...(ctx.tenantField ? [`    .index('by_workspace', ['${ctx.tenantField}'])`] : []),
  ]

  return `${lines.join('\n')},\n`
}

function resourceSchemaTemplate(ctx: ResourceGeneratorContext): string {
  return `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const ${ctx.tableName}Tables = {
${schemaTableBlock(ctx).trimEnd()}
}
`.trimStart()
}

function resourceFeatureTemplate(ctx: ResourceGeneratorContext): string {
  const permissionsLine = `  permissions: ${ctx.singularCamel}Permissions,\n`
  const operationsImport = ctx.hasMcp
    ? `import { remove${ctx.singularPascal}Descriptor } from '../../../shared/features/${ctx.tableName}/contract'\n`
    : ''
  const operationsLine = ctx.hasMcp
    ? `  operations: [remove${ctx.singularPascal}Descriptor],\n`
    : ''

  return `
import { defineFeature } from '@lupinum/trellis/workspace'

${operationsImport}
import { ${ctx.singularCamel}Permissions } from './permissions'
import { ${ctx.tableName}Tables } from './schema'

export const ${ctx.tableName}Feature = defineFeature({
  name: '${ctx.tableName}',
  schema: ${ctx.tableName}Tables,
${permissionsLine}${operationsLine}})
`.trimStart()
}

function resourceIndexTemplate(ctx: ResourceGeneratorContext): string {
  return `
export { ${ctx.tableName}Feature } from './feature'
export {
  ${ctx.singularCamel}CreatePermission,
  ${ctx.singularCamel}DeletePermission,
  ${ctx.singularCamel}Permissions,
  ${ctx.singularCamel}ReadPermission,
} from './permissions'
export { ${ctx.tableName}Tables } from './schema'
${ctx.hasMcp ? `export { previewRemove${ctx.singularPascal}, remove${ctx.singularPascal}Op } from './operations'\n` : ''}`.trimStart()
}

async function patchSchema(cwd: string, ctx: ResourceGeneratorContext): Promise<void> {
  const path = resolve(cwd, 'convex/schema.ts')
  const source = await readFile(path, 'utf8')
  if (
    source.includes(`${ctx.tableName}: defineTable`) ||
    source.includes(`${ctx.tableName}Tables`) ||
    source.includes(`./features/${ctx.tableName}'`)
  ) {
    throw new Error(`[trellis] Entity "${ctx.tableName}" already exists in convex/schema.ts.`)
  }
  const importBlock = `import { ${ctx.tableName}Tables } from './features/${ctx.tableName}'\n`
  const importAnchor = source.indexOf('export default defineSchema')
  if (importAnchor === -1) {
    throw new Error(
      '[trellis] Could not patch convex/schema.ts. Expected a canonical defineSchema(...) layout.',
    )
  }
  const withImport = `${source.slice(0, importAnchor)}${importBlock}${source.slice(importAnchor)}`
  const next = withImport.replace(/\n\}\)\s*$/, `\n  ...${ctx.tableName}Tables,\n})\n`)
  if (next === source || next === withImport) {
    throw new Error(
      '[trellis] Could not patch convex/schema.ts. Expected a canonical defineSchema(...) layout.',
    )
  }

  await writeFile(path, next)
}

async function patchFeatureManifest(cwd: string, ctx: ResourceGeneratorContext): Promise<void> {
  if (!ctx.hasFeatureManifest) return

  const path = resolve(cwd, 'convex/features/index.ts')
  const source = await readFile(path, 'utf8')
  const featureName = `${ctx.tableName}Feature`
  const featureImport = `import { ${featureName} } from './${ctx.tableName}/feature'`

  if (source.includes(featureImport)) {
    return
  }

  const importMatches = [...source.matchAll(/^import .*$/gm)]
  const lastImport = importMatches.at(-1)
  if (!lastImport || lastImport.index === undefined) {
    throw new Error(
      '[trellis] Could not patch convex/features/index.ts. Expected a canonical import block.',
    )
  }

  const importInsertionIndex = lastImport.index + lastImport[0].length
  const withImport = `${source.slice(0, importInsertionIndex)}\n${featureImport}${source.slice(importInsertionIndex)}`
  const next = withImport.replace(
    /composeFeatures\(\[([^\]]+)\]\)/,
    (_match, items) => `composeFeatures([${items.trimEnd()}, ${featureName}])`,
  )

  if (next === source || next === withImport) {
    throw new Error(
      '[trellis] Could not patch convex/features/index.ts. Expected a canonical composed manifest.',
    )
  }

  await writeFile(path, next)
}

async function patchMcpRuntime(cwd: string, ctx: ResourceGeneratorContext): Promise<void> {
  if (!ctx.hasMcp) return

  const path = resolve(cwd, 'server/mcp/runtime.ts')
  const source = await readFile(path, 'utf8')
  if (source.includes('api.permissions.context.getAccessContext')) {
    return
  }
  if (source.includes(`'${ctx.permissionPrefix}.read'`)) {
    return
  }

  const canWriteExpr =
    ctx.kind === 'workspace'
      ? `caller.kind === 'agent' && !!caller.workspaceId && canWrite(caller.role)`
      : "caller.kind !== 'anonymous'"
  const readExpr =
    ctx.kind === 'workspace'
      ? `caller.kind === 'agent' && !!caller.workspaceId`
      : "caller.kind !== 'anonymous'"

  const insertion = [
    `    '${ctx.permissionPrefix}.read': ${readExpr},`,
    `    '${ctx.permissionPrefix}.create': ${canWriteExpr},`,
    `    '${ctx.permissionPrefix}.delete': ${canWriteExpr},`,
  ].join('\n')

  const blockStart = source.indexOf('resolveAccess: async ({')
  if (blockStart === -1) {
    throw new Error(
      '[trellis] Could not patch server/mcp/runtime.ts. Expected a canonical resolveAccess block.',
    )
  }
  const returnStart = source.indexOf('=> ({', blockStart)
  const blockEnd = source.indexOf('\n  }),', returnStart)
  if (returnStart === -1 || blockEnd === -1) {
    throw new Error(
      '[trellis] Could not patch server/mcp/runtime.ts. Expected a canonical resolveAccess block.',
    )
  }
  const next = `${source.slice(0, blockEnd)}\n${insertion}${source.slice(blockEnd)}`

  if (next === source) {
    throw new Error(
      '[trellis] Could not patch server/mcp/runtime.ts. Expected a canonical resolveAccess block.',
    )
  }

  await writeFile(path, next)
}

export async function buildResourceTemplateSet(
  cwd: string,
  resourceName: string,
): Promise<InitTemplateSet> {
  const ctx = await inferResourceContext(cwd, resourceName)
  const files: TemplateFile[] = [
    {
      path: `shared/features/${ctx.tableName}/contract.ts`,
      content: resourceContractTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/features/${ctx.tableName}/schema.ts`,
      content: resourceSchemaTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/features/${ctx.tableName}/permissions.ts`,
      content: resourcePermissionsTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/features/${ctx.tableName}/domain.ts`,
      content: resourceDomainTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/features/${ctx.tableName}/feature.ts`,
      content: resourceFeatureTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/features/${ctx.tableName}/index.ts`,
      content: resourceIndexTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/features/${ctx.tableName}/tests.ts`,
      content: resourceTestTemplate(ctx),
      ownership: 'authored',
    },
  ]

  if (ctx.hasMcp) {
    files.push(
      {
        path: `convex/features/${ctx.tableName}/operations.ts`,
        content: resourceOperationTemplate(ctx),
        ownership: 'authored',
      },
      {
        path: `server/mcp/tools/list-${ctx.fileStem}.ts`,
        content: resourceMcpListTemplate(ctx),
        ownership: 'authored',
      },
      {
        path: `server/mcp/tools/create-${ctx.fileStem}.ts`,
        content: resourceMcpCreateTemplate(ctx),
        ownership: 'authored',
      },
      {
        path: `server/mcp/tools/delete-${ctx.fileStem}.ts`,
        content: resourceMcpDeleteTemplate(ctx),
        ownership: 'authored',
      },
    )
  }

  return {
    label: `add:entity:${ctx.fileStem}`,
    description: `Add a canonical ${ctx.singularCamel} entity slice`,
    files,
    afterWrite: async (targetCwd) => {
      await patchSchema(targetCwd, ctx)
      await patchFeatureManifest(targetCwd, ctx)
      await patchMcpRuntime(targetCwd, ctx)
    },
  }
}
