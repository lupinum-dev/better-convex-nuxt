import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { InitTemplateSet, TemplateFile } from './init.js'

type ResourceAppKind = 'personal' | 'workspace' | 'cms'

type ResourceGeneratorContext = {
  kind: ResourceAppKind
  hasMcp: boolean
  ownerField: 'ownerId' | 'authorId'
  tenantField: 'workspaceId' | null
  hasUpdatedAt: boolean
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
  const hasWorkspacePrincipal = await exists(resolve(cwd, 'convex/auth/principal.ts'))
  const hasCmsPages = await exists(resolve(cwd, 'convex/domain/pages.ts'))
  const kind: ResourceAppKind = hasWorkspacePrincipal
    ? 'workspace'
    : hasCmsPages
      ? 'cms'
      : 'personal'

  const singularCamel = camelCase(name)
  const singularPascal = pascalCase(name)
  const pluralCamel = pluralize(singularCamel)
  const pluralPascal = pascalCase(pluralCamel)
  const ownerField = /authorId\s*:/.test(schemaSource) ? 'authorId' : 'ownerId'
  const tenantField = /workspaceId\s*:/.test(schemaSource) ? 'workspaceId' : null
  const hasUpdatedAt = /updatedAt\s*:/.test(schemaSource)
  const hasMcp =
    (await exists(resolve(cwd, 'server/mcp/runtime.ts'))) ||
    (await exists(resolve(cwd, 'server/mcp/index.ts')))

  return {
    kind,
    hasMcp,
    ownerField,
    tenantField,
    hasUpdatedAt,
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

function resourceSchemaTemplate(ctx: ResourceGeneratorContext): string {
  const createName = `create${ctx.singularPascal}`
  const updateName = `update${ctx.singularPascal}`
  const deleteName = `delete${ctx.singularPascal}`
  const getName = `get${ctx.singularPascal}`
  const listName = `list${ctx.pluralPascal}`

  return `
import { defineArgs } from '@lupinum/trellis/args'
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
      ? "import { hasMinimumRole, hasWorkspace } from './checks'\n"
      : "import { isAuthenticated } from './checks'\n"

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
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { delete${ctx.singularPascal} } from '../../shared/schemas/${ctx.fileStem}'
import { ${ctx.singularCamel}DeletePermission } from '../auth/permissions'
import { query } from '../functions'

export const remove${ctx.singularPascal}Op = defineOperation({
  id: '${ctx.tableName}.remove',
  name: 'remove${ctx.singularPascal}',
  kind: 'destructive',
  args: delete${ctx.singularPascal}.args,
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        ${ctx.tableName}: v.number(),
      }),
    }),
    confirm: v.object({
      operation: v.literal('${ctx.tableName}.remove'),
      targetId: v.id('${ctx.tableName}'),
      affectedCounts: v.object({
        ${ctx.tableName}: v.number(),
      }),
    }),
  }),
  guard: ${ctx.singularCamel}DeletePermission,
  load: async (ctx, args) => {
    const ${ctx.singularCamel} = await ctx.db.get(args.id)
    requireRecord(${ctx.singularCamel}, '${ctx.singularPascal}')
    return { ${ctx.singularCamel} }
  },
  preview: async (_ctx, _args, { ${ctx.singularCamel} }) => ({
    display: {
      summary: \`Will permanently delete "\${${ctx.singularCamel}.name}"\`,
      warn: 'This cannot be undone',
      affects: { ${ctx.tableName}: 1 },
    },
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

export const previewRemove${ctx.singularPascal} = query(previewOf(remove${ctx.singularPascal}Op))
`.trimStart()
}

function resourceDomainTemplate(ctx: ResourceGeneratorContext): string {
  const schemaImport = `../../shared/schemas/${ctx.fileStem}`
  const permissionImport = `../auth/permissions`
  const updateOwnerCheck =
    ctx.kind === 'workspace'
      ? "actor.role === 'owner' || actor.role === 'admin' || actor.userId === loaded.ownerId"
      : `actor.userId === loaded.${ctx.ownerField}`
  const listQuery = ctx.tenantField
    ? `.withIndex('by_workspace', (q) => q.eq('${ctx.tenantField}', actor.tenantId!))`
    : `.withIndex('by_${ctx.ownerField === 'authorId' ? 'author' : 'owner'}', (q) => q.eq('${ctx.ownerField}', actor.userId))`
  const createFields = [
    `${ctx.ownerField}: actor.userId`,
    `name: args.name`,
    ...(ctx.tenantField ? [`${ctx.tenantField}: actor.tenantId!`] : []),
    'createdAt: now',
    ...(ctx.hasUpdatedAt ? ['updatedAt: now'] : []),
  ].join(',\n      ')
  const patchFields = [
    `name: args.name`,
    ...(ctx.hasUpdatedAt ? ['updatedAt: Date.now()'] : []),
  ].join(',\n      ')
  const removeExport = ctx.hasMcp
    ? `export const remove = mutation(remove${ctx.singularPascal}Op)\n`
    : `export const remove = mutation({
  args: delete${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}DeletePermission,
  load: async (ctx, args) => {
    const ${ctx.singularCamel} = await ctx.db.get(args.id)
    requireRecord(${ctx.singularCamel}, '${ctx.singularPascal}')
    return ${ctx.singularCamel}
  },
  authorize: {
    check: async (actor, loaded) => ${updateOwnerCheck},
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
} from '${schemaImport}'
import {
  ${ctx.singularCamel}CreatePermission,
  ${ctx.singularCamel}DeletePermission,
  ${ctx.singularCamel}ReadPermission,
} from '${permissionImport}'
import { mutation, query } from '../functions'
${ctx.hasMcp ? `import { remove${ctx.singularPascal}Op } from '../operations/${ctx.fileStem}'\n` : ''}

export const list = query({
  args: list${ctx.pluralPascal}.args,
  guard: ${ctx.singularCamel}ReadPermission,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    return await ctx.db
      .query('${ctx.tableName}')
      ${listQuery}
      .order('desc')
      .collect()
  },
})

export const get = query({
  args: get${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}ReadPermission,
  load: async (ctx, args) => {
    const loaded = await ctx.db.get(args.id)
    requireRecord(loaded, '${ctx.singularPascal}')
    return loaded
  },
  authorize: {
    check: async (actor, loaded) => ${ctx.tenantField ? `loaded.${ctx.tenantField} === actor.tenantId` : `loaded.${ctx.ownerField} === actor.userId`},
  },
  handler: async (_ctx, _args, loaded) => loaded,
})

export const create = mutation({
  args: create${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}CreatePermission,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const now = Date.now()
    return await ctx.db.insert('${ctx.tableName}', {
      ${createFields}
    })
  },
})

export const update = mutation({
  args: update${ctx.singularPascal}.args,
  guard: ${ctx.singularCamel}ReadPermission,
  load: async (ctx, args) => {
    const loaded = await ctx.db.get(args.id)
    requireRecord(loaded, '${ctx.singularPascal}')
    return loaded
  },
  authorize: {
    check: async (actor, loaded) => ${updateOwnerCheck},
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

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

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

    const id = await tenant.users.member.mutation(api.domain.${ctx.fileStem}.create, { name: 'Draft' })
    await tenant.users.member.mutation(api.domain.${ctx.fileStem}.update, { id, name: 'Renamed' })

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

    const id = await tenant.users.member.mutation(api.domain.${ctx.fileStem}.create, { name: 'Draft' })

    await expect(
      tenant.users.other.mutation(api.domain.${ctx.fileStem}.update, { id, name: 'Denied' }),
    ).rejects.toThrow(/Forbidden/)
  })
})
`.trimStart()
  }

  return `
import { describe, expect, it } from 'vitest'

import { createTestContext } from '@lupinum/trellis/testing'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

function createCtx() {
  return createTestContext({ schema, modules })
}

async function seedUser(ctx: ReturnType<typeof createCtx>, authId: string) {
  await ctx.seed('users', {
    authId,
    email: \`\${authId}@example.test\`,
    displayName: authId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

describe('${ctx.tableName}', () => {
  it('allows the owner to update their own ${ctx.singularCamel}', async () => {
    const ctx = createCtx()
    await seedUser(ctx, 'owner-1')
    const owner = ctx.raw.withIdentity({ subject: 'owner-1' })
    const id = await owner.mutation(api.domain.${ctx.fileStem}.create, { name: 'Draft' })

    await owner.mutation(api.domain.${ctx.fileStem}.update, { id, name: 'Renamed' })

    const rows = await ctx.readAll('${ctx.tableName}')
    expect(rows.find((row) => row._id === id)?.name).toBe('Renamed')
  })

  it('denies another user from updating the owner\\'s ${ctx.singularCamel}', async () => {
    const ctx = createCtx()
    await seedUser(ctx, 'owner-1')
    await seedUser(ctx, 'other-1')
    const owner = ctx.raw.withIdentity({ subject: 'owner-1' })
    const other = ctx.raw.withIdentity({ subject: 'other-1' })
    const id = await owner.mutation(api.domain.${ctx.fileStem}.create, { name: 'Draft' })

    await expect(
      other.mutation(api.domain.${ctx.fileStem}.update, { id, name: 'Denied' }),
    ).rejects.toThrow(/Forbidden/)
  })
})
`.trimStart()
}

function resourceMcpListTemplate(ctx: ResourceGeneratorContext): string {
  return `
import { api } from '#trellis/api'
import { ${ctx.singularCamel}ReadPermission } from '~/convex/auth/permissions'
import { list${ctx.pluralPascal} } from '~/shared/schemas/${ctx.fileStem}'

import { tool } from '../runtime'

export default tool({
  schema: list${ctx.pluralPascal},
  call: api.domain.${ctx.fileStem}.list,
  operation: 'query',
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
import { ${ctx.singularCamel}CreatePermission } from '~/convex/auth/permissions'
import { create${ctx.singularPascal} } from '~/shared/schemas/${ctx.fileStem}'

import { tool } from '../runtime'

export default tool({
  schema: create${ctx.singularPascal},
  call: api.domain.${ctx.fileStem}.create,
  permission: ${ctx.singularCamel}CreatePermission,
  meta: {
    name: 'create-${ctx.fileStem}',
  },
})
`.trimStart()
}

function resourceMcpDeleteTemplate(ctx: ResourceGeneratorContext): string {
  return `
import { ${ctx.singularCamel}DeletePermission } from '~/convex/auth/permissions'
import { api } from '~/convex/_generated/api'
import { remove${ctx.singularPascal}Op } from '~/convex/operations/${ctx.fileStem}'

import { tool } from '../runtime'

export default tool.fromOperation(remove${ctx.singularPascal}Op, {
  execute: api.domain.${ctx.fileStem}.remove,
  preview: api.operations.${ctx.fileStem}.previewRemove${ctx.singularPascal},
  permission: ${ctx.singularCamel}DeletePermission,
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

async function patchSchema(cwd: string, ctx: ResourceGeneratorContext): Promise<void> {
  const path = resolve(cwd, 'convex/schema.ts')
  const source = await readFile(path, 'utf8')
  if (source.includes(`${ctx.tableName}: defineTable`)) {
    throw new Error(`[trellis] Resource "${ctx.tableName}" already exists in convex/schema.ts.`)
  }

  const next = source.replace(/\n\}\)\s*$/, `\n${schemaTableBlock(ctx)}})\n`)
  if (next === source) {
    throw new Error(
      '[trellis] Could not patch convex/schema.ts. Expected a canonical defineSchema(...) layout.',
    )
  }

  await writeFile(path, next)
}

async function patchPermissionAuthoring(cwd: string, ctx: ResourceGeneratorContext): Promise<void> {
  const authoredPermissionsPath = resolve(cwd, 'convex/auth/permissions.ts')
  if (!(await exists(authoredPermissionsPath))) {
    throw new Error(
      '[trellis] Missing convex/auth/permissions.ts. Expected the canonical authored permissions file.',
    )
  }

  const source = await readFile(authoredPermissionsPath, 'utf8')
  const block = resourcePermissionsTemplate(ctx).trimEnd()
  const withBlock = source.includes(
    `export const ${ctx.singularCamel}ReadPermission = definePermission(`,
  )
    ? source
    : `${source.trimEnd()}\n\n${block}\n`
  const next = withBlock.replace(
    /\]\s+as const/,
    `,\n  ...${ctx.singularCamel}Permissions,\n] as const`,
  )

  if (next === withBlock) {
    throw new Error(
      '[trellis] Could not patch convex/auth/permissions.ts. Expected a canonical exported permissions array.',
    )
  }

  await writeFile(authoredPermissionsPath, next)
}

async function patchMcpRuntime(cwd: string, ctx: ResourceGeneratorContext): Promise<void> {
  if (!ctx.hasMcp) return

  const path = resolve(cwd, 'server/mcp/runtime.ts')
  const source = await readFile(path, 'utf8')
  if (source.includes('api.permissions.context.getPermissionContext')) {
    return
  }
  if (source.includes(`'${ctx.permissionPrefix}.read'`)) {
    return
  }

  const canWriteExpr =
    ctx.kind === 'workspace'
      ? `principal.kind === 'agent' && !!principal.tenantId && canWrite(principal.role)`
      : "principal.kind !== 'anonymous'"
  const readExpr =
    ctx.kind === 'workspace'
      ? `principal.kind === 'agent' && !!principal.tenantId`
      : "principal.kind !== 'anonymous'"

  const insertion = [
    `    '${ctx.permissionPrefix}.read': ${readExpr},`,
    `    '${ctx.permissionPrefix}.create': ${canWriteExpr},`,
    `    '${ctx.permissionPrefix}.delete': ${canWriteExpr},`,
  ].join('\n')

  const blockStart = source.indexOf('resolveCapabilities: async ({')
  if (blockStart === -1) {
    throw new Error(
      '[trellis] Could not patch server/mcp/runtime.ts. Expected a canonical resolveCapabilities block.',
    )
  }
  const returnStart = source.indexOf('=> ({', blockStart)
  const blockEnd = source.indexOf('\n  }),', returnStart)
  if (returnStart === -1 || blockEnd === -1) {
    throw new Error(
      '[trellis] Could not patch server/mcp/runtime.ts. Expected a canonical resolveCapabilities block.',
    )
  }
  const next = `${source.slice(0, blockEnd)}\n${insertion}${source.slice(blockEnd)}`

  if (next === source) {
    throw new Error(
      '[trellis] Could not patch server/mcp/runtime.ts. Expected a canonical resolveCapabilities block.',
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
      path: `shared/schemas/${ctx.fileStem}.ts`,
      content: resourceSchemaTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/domain/${ctx.fileStem}.ts`,
      content: resourceDomainTemplate(ctx),
      ownership: 'authored',
    },
    {
      path: `convex/${ctx.fileStem}.test.ts`,
      content: resourceTestTemplate(ctx),
      ownership: 'authored',
    },
  ]

  if (ctx.hasMcp) {
    files.push(
      {
        path: `convex/operations/${ctx.fileStem}.ts`,
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
    label: `add:resource:${ctx.fileStem}`,
    description: `Add a canonical ${ctx.singularCamel} resource slice`,
    files,
    afterWrite: async (targetCwd) => {
      await patchSchema(targetCwd, ctx)
      await patchPermissionAuthoring(targetCwd, ctx)
      await patchMcpRuntime(targetCwd, ctx)
    },
  }
}
