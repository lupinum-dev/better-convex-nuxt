/* eslint-disable @typescript-eslint/no-explicit-any -- test harness adds sessionTokenForTest outside public Convex args. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { startDelegatedRunAfterPermissionCheck } from './agentRuns'
import { createAuth } from './auth'
import schema from './schema'
import { initConvexTest, modules } from './test.setup'

const publicApi = api as any
const internalApi = internal as any
type AgentCapability = 'project:read' | 'project:draft' | 'project:delete'

function readConvexSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function readStarterJson<T>(path: string): T {
  return JSON.parse(readConvexSource(path)) as T
}

function listConvexSourceFiles(path = '.'): string[] {
  const files: string[] = []

  for (const entry of readdirSync(new URL(path, import.meta.url), {
    withFileTypes: true,
  })) {
    const entryPath = `${path}/${entry.name}`
    if (
      entry.name === '_generated' ||
      entry.name === 'betterAuth' ||
      entry.name.endsWith('.test.ts') ||
      entry.name === 'test.setup.ts'
    ) {
      continue
    }
    if (entry.isDirectory()) {
      files.push(...listConvexSourceFiles(entryPath))
      continue
    }
    if (entry.name.endsWith('.ts')) {
      files.push(entryPath)
    }
  }

  return files
}

function extractExportArgsBlock(source: string, exportName: string) {
  const exportStart = source.indexOf(`export const ${exportName} = `)
  expect(exportStart).toBeGreaterThanOrEqual(0)

  const argsStart = source.indexOf('args: {', exportStart)
  expect(argsStart).toBeGreaterThanOrEqual(exportStart)

  const blockStart = source.indexOf('{', argsStart)
  let depth = 0
  for (let index = blockStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      depth += 1
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(blockStart, index + 1)
      }
    }
  }

  throw new Error(`Could not extract args block for ${exportName}`)
}

async function startRun(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    organizationId: string
    agentName: string
    capabilities: AgentCapability[]
    expiresAt: number
    maxTotalTokens: number
    maxOrganizationTotalTokens: number
    maxUserTotalTokens: number
  }> = {},
) {
  return await t.run(async (ctx) => {
    return await startDelegatedRunAfterPermissionCheck(
      ctx,
      {
        organizationId: overrides.organizationId ?? 'better-auth-org-id',
        agentName: overrides.agentName ?? 'project-assistant',
        startedByAuthUserId: 'better-auth-user-id',
        capabilities: overrides.capabilities ?? ['project:draft'],
        ...(overrides.expiresAt === undefined ? {} : { expiresAt: overrides.expiresAt }),
        ...(overrides.maxTotalTokens === undefined
          ? {}
          : { maxTotalTokens: overrides.maxTotalTokens }),
        ...(overrides.maxOrganizationTotalTokens === undefined
          ? {}
          : { maxOrganizationTotalTokens: overrides.maxOrganizationTotalTokens }),
        ...(overrides.maxUserTotalTokens === undefined
          ? {}
          : { maxUserTotalTokens: overrides.maxUserTotalTokens }),
      },
      async () => ({ authUserId: 'better-auth-user-id' }),
    )
  })
}

async function markRunRunning(t: ReturnType<typeof convexTest>, agentRunId: Id<'agentRuns'>) {
  await t.run(async (ctx) => {
    await ctx.db.patch(agentRunId, {
      status: 'running',
      updatedAt: Date.now(),
    })
  })
}

async function markRunRunningWithThread(
  t: ReturnType<typeof convexTest>,
  agentRunId: Id<'agentRuns'>,
  threadId = `agent-thread-${agentRunId}`,
) {
  await markRunRunning(t, agentRunId)
  await t.mutation(internalApi.agentRuns.attachThread, {
    agentRunId,
    threadId,
  })
}

async function createApprovedRecord(
  t: ReturnType<typeof convexTest>,
  args: {
    organizationId: string
    sessionTokenForTest: string
  },
) {
  const agentRunId = await startRun(t, { organizationId: args.organizationId })
  await markRunRunningWithThread(t, agentRunId)
  const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
    agentRunId,
    title: 'Approved launch plan',
    body: 'Canonical project record',
  })

  return await t.mutation(publicApi.projectDrafts.approve, {
    draftId,
    sessionTokenForTest: args.sessionTokenForTest,
  })
}

async function startBetterAuthRun(
  t: ReturnType<typeof convexTest>,
  args: {
    organizationId: string
    sessionTokenForTest: string
    capabilities: AgentCapability[]
    maxTotalTokens?: number
    maxOrganizationTotalTokens?: number
    maxUserTotalTokens?: number
  },
) {
  return (await t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
    organizationId: args.organizationId,
    agentName: 'project-assistant',
    sessionTokenForTest: args.sessionTokenForTest,
    capabilities: args.capabilities,
    ...(args.maxTotalTokens === undefined ? {} : { maxTotalTokens: args.maxTotalTokens }),
    ...(args.maxOrganizationTotalTokens === undefined
      ? {}
      : { maxOrganizationTotalTokens: args.maxOrganizationTotalTokens }),
    ...(args.maxUserTotalTokens === undefined ? {} : { maxUserTotalTokens: args.maxUserTotalTokens }),
  })) as Id<'agentRuns'>
}

async function createBetterAuthUser(t: ReturnType<typeof convexTest>, email: string) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password: 'password123',
        name: email.split('@')[0],
      },
    })
    if (!result.token) {
      throw new Error('Better Auth signup did not return a session token')
    }

    return {
      email,
      token: result.token,
      userId: result.user.id,
    }
  })
}

async function createBetterAuthOrganization(t: ReturnType<typeof convexTest>) {
  const owner = await createBetterAuthUser(t, 'agent-owner@example.com')

  const organization = await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    return await auth.api.createOrganization({
      headers: new Headers({ authorization: `Bearer ${owner.token}` }),
      body: {
        name: 'Agent Org',
        slug: `agent-org-${Math.random().toString(36).slice(2)}`,
      },
    })
  })

  return {
    owner,
    organizationId: organization.id,
  }
}

async function createBetterAuthOrganizationWithAdmin(t: ReturnType<typeof convexTest>) {
  const { owner, organizationId } = await createBetterAuthOrganization(t)
  const admin = await createBetterAuthUser(t, 'agent-admin@example.com')

  const adminMember = await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    return await auth.api.addMember({
      headers: new Headers({ authorization: `Bearer ${owner.token}` }),
      body: {
        organizationId,
        userId: admin.userId,
        role: 'admin',
      },
    })
  })

  return {
    owner,
    admin,
    adminMember,
    organizationId,
  }
}

describe('agentic-saas proof invariants', () => {
  it('does not introduce app-owned organization or membership tables', async () => {
    const tables = (schema as { tables: Record<string, unknown> }).tables

    expect(Object.keys(tables)).not.toContain('organizations')
    expect(Object.keys(tables)).not.toContain('memberships')
  })

  it('keeps app-owned schema limited to canonical proof tables', async () => {
    const tables = (schema as { tables: Record<string, unknown> }).tables

    expect(Object.keys(tables).sort()).toEqual([
      'agentAuditEvents',
      'agentRuns',
      'agentUsageEvents',
      'productAuditEvents',
      'productRecords',
      'projectDeletionRequests',
      'projectDrafts',
    ])
  })

  it('keeps agentic audit actors limited to proven user and agent kinds', async () => {
    const schemaSource = readConvexSource('./schema.ts')
    const runtimeSources = [
      './agentRuns.ts',
      './productRecords.ts',
      './projectDeletionRequests.ts',
      './projectDrafts.ts',
    ].map((path) => readConvexSource(path))
    const futureActorKinds = [
      "kind: 'apiKey'",
      "kind: 'service'",
      "kind: 'system'",
      'apiKeyId',
      'serviceActorId',
    ]

    expect(schemaSource).toContain("kind: v.literal('user')")
    expect(schemaSource).toContain("kind: v.literal('agent')")
    for (const source of [schemaSource, ...runtimeSources]) {
      for (const marker of futureActorKinds) {
        expect(source).not.toContain(marker)
      }
    }
  })

  it('keeps agent run lifecycle status writes centralized', () => {
    const lifecycleStatusPattern =
      /status:\s*'(?:active|running|completed|revoked|failed)'(?!\s+as const)/g
    const filesWithLifecycleWrites = listConvexSourceFiles()
      .filter((path) => path !== './schema.ts')
      .flatMap((path) => {
        const matches = [...readConvexSource(path).matchAll(lifecycleStatusPattern)]
        return matches.map((match) => `${path}:${match[0]}`)
      })

    expect(filesWithLifecycleWrites).toEqual([
      "./agentRuns.ts:status: 'active'",
      "./agentRuns.ts:status: 'running'",
      "./agentRuns.ts:status: 'revoked'",
      "./agentRuns.ts:status: 'failed'",
      "./agentRuns.ts:status: 'completed'",
    ])
  })

  it('keeps agent-created review helpers internal-only', async () => {
    const draftSource = readConvexSource('./projectDrafts.ts')
    const deletionRequestSource = readConvexSource('./projectDeletionRequests.ts')

    expect(draftSource).toContain('export const createFromAgent = internalMutation({')
    expect(deletionRequestSource).toContain('export const createFromAgent = internalMutation({')
    expect(draftSource).not.toContain('export const createFromAgent = mutation({')
    expect(deletionRequestSource).not.toContain('export const createFromAgent = mutation({')
  })

  it('keeps real provider wiring out until provider execution is proven', async () => {
    const packageJson = readStarterJson<{
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>('../package.json')
    const dependencyNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ])
    const providerPackages = [
      '@ai-sdk/anthropic',
      '@ai-sdk/gateway',
      '@ai-sdk/google',
      '@ai-sdk/openai',
      '@anthropic-ai/sdk',
      '@google/generative-ai',
      'openai',
    ]
    const agentToolsSource = readConvexSource('./agentTools.ts')
    const runtimeSources = [
      './agentRuns.ts',
      './agentThreads.ts',
      './agentTools.ts',
      './agentUsage.ts',
      './auth.ts',
      './http.ts',
      './productRecords.ts',
      './projectDeletionRequests.ts',
      './projectDrafts.ts',
      './schema.ts',
      '../app/pages/index.vue',
      '../nuxt.config.ts',
    ].map((path) => readConvexSource(path))
    const providerEnvPattern = /(?:OPENAI|ANTHROPIC|GOOGLE_GENERATIVE_AI|AI_GATEWAY)_API_KEY/

    expect(providerPackages.filter((name) => dependencyNames.has(name))).toEqual([])
    expect(agentToolsSource).toContain('mockModel(')
    expect(agentToolsSource).not.toContain('process.env')
    for (const source of runtimeSources) {
      expect(source).not.toMatch(providerEnvPattern)
      for (const providerPackage of providerPackages) {
        expect(source).not.toContain(providerPackage)
      }
    }
  })

  it('keeps MCP and public OAuth transport out of the in-product agent starter', async () => {
    const packageJson = readStarterJson<{
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>('../package.json')
    const dependencyNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ])
    const forbiddenDependencies = [
      '@better-auth/oauth-provider',
      '@modelcontextprotocol/sdk',
      '@nuxtjs/mcp-toolkit',
    ]
    const runtimeSources = [
      './agentRuns.ts',
      './agentThreads.ts',
      './agentTools.ts',
      './agentUsage.ts',
      './auth.ts',
      './http.ts',
      './productRecords.ts',
      './projectDeletionRequests.ts',
      './projectDrafts.ts',
      './schema.ts',
      '../nuxt.config.ts',
    ].map((path) => readConvexSource(path))
    const forbiddenRuntimePatterns = [
      '@better-auth/oauth-provider',
      '@modelcontextprotocol/sdk',
      '@nuxtjs/mcp-toolkit',
      'mcpHandler',
      'oauthProviderResourceClient',
      'oauth-protected-resource',
      'server/mcp',
    ]

    expect(forbiddenDependencies.filter((name) => dependencyNames.has(name))).toEqual([])
    expect(existsSync(new URL('../server/mcp', import.meta.url))).toBe(false)
    for (const source of runtimeSources) {
      for (const pattern of forbiddenRuntimePatterns) {
        expect(source).not.toContain(pattern)
      }
    }
  })

  it('keeps proof-token auth out of production Convex source', async () => {
    const productionSources = [
      './agentRuns.ts',
      './agentThreads.ts',
      './agentTools.ts',
      './agentUsage.ts',
      './auth.ts',
      './betterAuthPermissions.ts',
      './http.ts',
      './productRecords.ts',
      './projectDeletionRequests.ts',
      './projectDrafts.ts',
      './schema.ts',
    ]
    const forbiddenMarkers = [
      'sessionTokenForTest',
      'ALLOW_AGENTIC_SAAS_PROOF_TOKENS',
      'sourceToken',
    ]

    for (const path of productionSources) {
      const source = readConvexSource(path)
      for (const marker of forbiddenMarkers) {
        expect(source, `${path} must not contain ${marker}`).not.toContain(marker)
      }
    }
  })

  it('keeps proof-token auth and caller identity out of the Nuxt app surface', () => {
    const appSource = readConvexSource('../app/pages/index.vue')
    const forbiddenAppMarkers = [
      'sessionTokenForTest',
      'sourceToken',
      'authorization:',
      'Bearer ',
      'authUserId',
      'startedByAuthUserId',
      'threadId',
    ]

    for (const marker of forbiddenAppMarkers) {
      expect(appSource, `app page must not contain ${marker}`).not.toContain(marker)
    }
  })

  it('keeps Agent component thread user derived from the run', async () => {
    const agentToolsSource = readConvexSource('./agentTools.ts')

    expect(agentToolsSource.match(/userId: run\.startedByAuthUserId/g)).toHaveLength(2)
    expect(agentToolsSource).not.toContain('userId: args.')
    expect(agentToolsSource).not.toContain('userId: input.')
  })

  it('keeps public existing-run agent surfaces keyed by run id', async () => {
    const agentRunsSource = readConvexSource('./agentRuns.ts')
    const agentThreadsSource = readConvexSource('./agentThreads.ts')
    const agentToolsSource = readConvexSource('./agentTools.ts')
    const publicExistingRunSurfaces = [
      { source: agentRunsSource, exportName: 'revokeRun', allowedArgs: ['agentRunId'] },
      { source: agentThreadsSource, exportName: 'listAccessibleMessages', allowedArgs: ['agentRunId'] },
      {
        source: agentThreadsSource,
        exportName: 'syncAccessibleStreams',
        allowedArgs: ['agentRunId', 'streamArgs'],
      },
      { source: agentToolsSource, exportName: 'generateDraftWithTool', allowedArgs: ['agentRunId'] },
      { source: agentToolsSource, exportName: 'streamProjectSummary', allowedArgs: ['agentRunId'] },
      {
        source: agentToolsSource,
        exportName: 'deleteThreadForRetention',
        allowedArgs: ['agentRunId'],
      },
    ]
    const forbiddenCallerIdentityArgs = [
      'organizationId',
      'threadId',
      'userId',
      'authUserId',
      'startedByAuthUserId',
      'sessionTokenForTest',
      'sourceToken',
    ]

    for (const surface of publicExistingRunSurfaces) {
      const argsBlock = extractExportArgsBlock(surface.source, surface.exportName)
      expect(argsBlock).toContain("agentRunId: v.id('agentRuns')")
      for (const allowedArg of surface.allowedArgs) {
        expect(argsBlock).toContain(`${allowedArg}:`)
      }
      for (const forbiddenArg of forbiddenCallerIdentityArgs) {
        expect(argsBlock).not.toContain(`${forbiddenArg}:`)
      }
    }
  })

  it('keeps canonical product writes inside product-domain helpers', async () => {
    const productRecordsSource = readConvexSource('./productRecords.ts')
    const projectDraftsSource = readConvexSource('./projectDrafts.ts')
    const deletionRequestsSource = readConvexSource('./projectDeletionRequests.ts')

    expect(productRecordsSource).toContain('export async function createProductRecordFromDraft(')
    expect(productRecordsSource).toContain('export async function deleteProductRecordForApproval(')
    expect(productRecordsSource).toContain("ctx.db.insert('productRecords'")
    expect(productRecordsSource).toContain('ctx.db.delete(request.productRecordId)')
    expect(projectDraftsSource).toContain('createProductRecordFromDraft(ctx, {')
    expect(deletionRequestsSource).toContain('deleteProductRecordForApproval(ctx, {')
    expect(projectDraftsSource).not.toContain("ctx.db.insert('productRecords'")
    expect(projectDraftsSource).not.toContain("ctx.db.delete(")
    expect(deletionRequestsSource).not.toContain("ctx.db.insert('productRecords'")
    expect(deletionRequestsSource).not.toContain('ctx.db.delete(request.productRecordId)')
  })

  it('keeps human decision mutations keyed by review row id', async () => {
    const projectDraftsSource = readConvexSource('./projectDrafts.ts')
    const deletionRequestsSource = readConvexSource('./projectDeletionRequests.ts')

    expect(projectDraftsSource).toContain(`export const approve = mutation({
  args: {
    draftId: v.id('projectDrafts'),
  },`)
    expect(projectDraftsSource).toContain(`export const reject = mutation({
  args: {
    draftId: v.id('projectDrafts'),
  },`)
    expect(deletionRequestsSource).toContain(`export const approve = mutation({
  args: {
    deletionRequestId: v.id('projectDeletionRequests'),
  },`)
    expect(deletionRequestsSource).toContain(`export const reject = mutation({
  args: {
    deletionRequestId: v.id('projectDeletionRequests'),
  },`)
  })

  it('keeps audit actions and resource types schema-bounded', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert('productAuditEvents', {
          organizationId: 'better-auth-org-id',
          actor: {
            kind: 'user',
            authUserId: 'better-auth-user-id',
          },
          action: 'unexpected.audit.action' as never,
          resourceType: 'productRecord',
          resourceId: 'invalid-resource',
          createdAt: Date.now(),
        })
      }),
    ).rejects.toThrow('unexpected.audit.action')

    await expect(
      t.run(async (ctx) => {
        const agentRunId = await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:draft'],
          },
          async () => ({ authUserId: 'better-auth-user-id' }),
        )

        await ctx.db.insert('agentAuditEvents', {
          organizationId: 'better-auth-org-id',
          actor: {
            kind: 'agent',
            agentRunId,
            delegatedByAuthUserId: 'better-auth-user-id',
          },
          action: 'projectDrafts.create',
          capability: 'project:draft',
          resourceType: 'unexpectedResource' as never,
          resourceId: 'invalid-resource',
          createdAt: Date.now(),
        })
      }),
    ).rejects.toThrow('unexpectedResource')
  })

  it('requires resource identity for retained audit rows', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert(
          'productAuditEvents',
          {
            organizationId: 'better-auth-org-id',
            actor: {
              kind: 'user',
              authUserId: 'better-auth-user-id',
            },
            action: 'projectDrafts.reject',
            resourceType: 'projectDraft',
            createdAt: Date.now(),
          } as never,
        )
      }),
    ).rejects.toThrow('resourceId')

    await expect(
      t.run(async (ctx) => {
        const agentRunId = await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:draft'],
          },
          async () => ({ authUserId: 'better-auth-user-id' }),
        )

        await ctx.db.insert(
          'agentAuditEvents',
          {
            organizationId: 'better-auth-org-id',
            actor: {
              kind: 'agent',
              agentRunId,
              delegatedByAuthUserId: 'better-auth-user-id',
            },
            action: 'projectDrafts.create',
            capability: 'project:draft',
            resourceType: 'projectDraft',
            createdAt: Date.now(),
          } as never,
        )
      }),
    ).rejects.toThrow('resourceId')
  })

  it('stores agent runs as bounded app-owned delegation keyed by Better Auth ids', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, { capabilities: ['project:read', 'project:draft'] })

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      _id: agentRunId,
      organizationId: 'better-auth-org-id',
      agentName: 'project-assistant',
      status: 'active',
      startedByAuthUserId: 'better-auth-user-id',
      capabilities: ['project:read', 'project:draft'],
    })
    expect(runs[0].threadId).toBeUndefined()
  })

  it('attaches the Agent component thread id exactly once', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)
    await markRunRunning(t, agentRunId)

    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId,
        threadId: '',
      }),
    ).rejects.toThrow('Agent thread id is required')

    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: '  thread_component_1  ',
    })

    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId,
        threadId: 'thread_component_2',
      }),
    ).rejects.toThrow('Agent run already has a thread')

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))
    expect(run?.threadId).toBe('thread_component_1')
  })

  it('does not attach an Agent component thread after delegation expiry', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, { expiresAt: Date.now() + 60_000 })
    await markRunRunning(t, agentRunId)
    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, { expiresAt: Date.now() - 1 })
    })

    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId,
        threadId: 'thread_component_after_expiry',
      }),
    ).rejects.toThrow('Agent run is expired')

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))
    expect(run?.threadId).toBeUndefined()
  })

  it('claims agent run execution exactly once before thread creation', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    const claimedRun = await t.mutation(internalApi.agentRuns.claimRunExecutionByDelegatingUser, {
      agentRunId,
      capability: 'project:draft',
      sessionTokenForTest: owner.token,
    })

    expect(claimedRun).toMatchObject({
      _id: agentRunId,
      status: 'running',
      organizationId,
      startedByAuthUserId: owner.userId,
    })

    await expect(
      t.mutation(internalApi.agentRuns.claimRunExecutionByDelegatingUser, {
        agentRunId,
        capability: 'project:draft',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'running',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('re-checks draft permission before claiming agent run execution', async () => {
    const t = initConvexTest()
    const { owner, admin, adminMember, organizationId } =
      await createBetterAuthOrganizationWithAdmin(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:draft'],
    })

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      await auth.api.updateMemberRole({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          memberId: adminMember.id,
          role: 'viewer',
        },
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: admin.token,
      }),
    ).rejects.toThrow('Agent run execution denied')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'active',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      await auth.api.updateMemberRole({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          memberId: adminMember.id,
          role: 'admin',
        },
      })
    })

    const removedMemberRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:draft'],
    })

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      await auth.api.removeMember({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          memberIdOrEmail: adminMember.id,
        },
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: removedMemberRunId,
        sessionTokenForTest: admin.token,
      }),
    ).rejects.toThrow(/Agent run execution denied|User is not a member of the organization/)

    const afterRemovalRows = await t.run(async (ctx) => ({
      run: await ctx.db.get(removedMemberRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(afterRemovalRows.run).toMatchObject({
      status: 'active',
    })
    expect(afterRemovalRows.run?.threadId).toBeUndefined()
    expect(afterRemovalRows.drafts).toHaveLength(0)
    expect(afterRemovalRows.audit).toHaveLength(0)
    expect(afterRemovalRows.usage).toHaveLength(0)
  })

  it('rejects expired active runs before Agent side effects', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, {
        expiresAt: Date.now() - 1,
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is expired')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'active',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('does not create agent review rows before a claimed run has a thread', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        title: 'Unclaimed draft',
        body: 'Should not be created before claim',
      }),
    ).rejects.toThrow('Agent run is not running')

    await markRunRunning(t, agentRunId)

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        title: 'Threadless draft',
        body: 'Should not be created before thread attach',
      }),
    ).rejects.toThrow('Agent run has no thread')

    const rows = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
  })

  it('does not mark successful runs completed before a thread exists', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)
    await markRunRunning(t, agentRunId)

    await expect(
      t.mutation(internalApi.agentRuns.completeRun, {
        agentRunId,
      }),
    ).rejects.toThrow('Agent run has no thread')

    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'thread_component_1',
    })
    await t.mutation(internalApi.agentRuns.completeRun, {
      agentRunId,
    })

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))
    expect(run).toMatchObject({
      status: 'completed',
      threadId: 'thread_component_1',
    })
  })

  it('does not reclassify terminal agent run states through lifecycle helpers', async () => {
    const t = convexTest(schema, modules)
    const failedRunId = await startRun(t)
    await markRunRunningWithThread(t, failedRunId, 'failed_run_thread')
    await t.mutation(internalApi.agentRuns.failRun, {
      agentRunId: failedRunId,
    })

    await expect(
      t.mutation(internalApi.agentRuns.completeRun, {
        agentRunId: failedRunId,
      }),
    ).rejects.toThrow('Agent run is not running')
    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId: failedRunId,
        threadId: 'failed_run_new_thread',
      }),
    ).rejects.toThrow('Agent run is not running')
    await expect(
      t.mutation(internalApi.agentRuns.failRun, {
        agentRunId: failedRunId,
      }),
    ).rejects.toThrow('Agent run is not active')

    const completedRunId = await startRun(t)
    await markRunRunningWithThread(t, completedRunId, 'completed_run_thread')
    await t.mutation(internalApi.agentRuns.completeRun, {
      agentRunId: completedRunId,
    })

    await expect(
      t.mutation(internalApi.agentRuns.failRun, {
        agentRunId: completedRunId,
      }),
    ).rejects.toThrow('Agent run is not active')
    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId: completedRunId,
        threadId: 'completed_run_new_thread',
      }),
    ).rejects.toThrow('Agent run is not running')

    const revokedRunId = await startRun(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(revokedRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.mutation(internalApi.agentRuns.failRun, {
        agentRunId: revokedRunId,
      }),
    ).rejects.toThrow('Agent run is not active')
    await expect(
      t.mutation(internalApi.agentRuns.completeRun, {
        agentRunId: revokedRunId,
      }),
    ).rejects.toThrow('Agent run is not running')

    const rows = await t.run(async (ctx) => ({
      failed: await ctx.db.get(failedRunId),
      completed: await ctx.db.get(completedRunId),
      revoked: await ctx.db.get(revokedRunId),
    }))

    expect(rows.failed).toMatchObject({
      status: 'failed',
      threadId: 'failed_run_thread',
    })
    expect(rows.completed).toMatchObject({
      status: 'completed',
      threadId: 'completed_run_thread',
    })
    expect(rows.revoked).toMatchObject({
      status: 'revoked',
    })
    expect(rows.revoked?.threadId).toBeUndefined()
  })

  it('records usage only for the canonical Agent component thread id', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)
    await markRunRunning(t, agentRunId)

    const usageArgs = {
      agentRunId,
      threadId: 'thread_component_1',
      model: 'mock-model',
      provider: 'mock-provider',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    }

    await expect(t.mutation(internalApi.agentUsage.recordUsage, usageArgs)).rejects.toThrow(
      'Agent run has no thread',
    )

    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'thread_component_1',
    })

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        organizationId: 'ignored-usage-org',
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        startedByAuthUserId: 'spoofed-usage-user',
      }),
    ).rejects.toThrow('Unexpected field `startedByAuthUserId`')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        agentName: 'duplicated-display-name',
      }),
    ).rejects.toThrow('Unexpected field `agentName`')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        threadId: 'thread_component_2',
      }),
    ).rejects.toThrow('Agent usage thread mismatch')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        totalTokens: -1,
      }),
    ).rejects.toThrow('Agent usage totalTokens must be a non-negative integer')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        totalTokens: 2,
      }),
    ).rejects.toThrow('Agent usage totalTokens must cover prompt and completion tokens')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        cachedInputTokens: 2,
      }),
    ).rejects.toThrow('Agent usage cachedInputTokens cannot exceed promptTokens')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        model: '   ',
      }),
    ).rejects.toThrow('Agent usage model is required')

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        ...usageArgs,
        provider: '   ',
      }),
    ).rejects.toThrow('Agent usage provider is required')

    const usageId = await t.mutation(internalApi.agentUsage.recordUsage, {
      ...usageArgs,
      model: '  mock-model  ',
      provider: '  mock-provider  ',
    })
    const usage = await t.run(async (ctx) => await ctx.db.query('agentUsageEvents').take(10))

    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({
      _id: usageId,
      threadId: 'thread_component_1',
      agentRunId,
      organizationId: 'better-auth-org-id',
      startedByAuthUserId: 'better-auth-user-id',
      model: 'mock-model',
      provider: 'mock-provider',
      totalTokens: 3,
    })
  })

  it('does not record usage for expired running runs', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, { expiresAt: Date.now() + 60_000 })
    await markRunRunning(t, agentRunId)
    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'agent-thread-id',
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, { expiresAt: Date.now() - 1 })
    })

    await expect(
      t.mutation(internalApi.agentUsage.recordUsage, {
        agentRunId,
        threadId: 'agent-thread-id',
        model: 'gpt-test',
        provider: 'openai',
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      }),
    ).rejects.toThrow('Agent run is expired')

    const usage = await t.run(async (ctx) => await ctx.db.query('agentUsageEvents').take(10))
    expect(usage).toHaveLength(0)
  })

  it('rejects invalid delegated run bounds before inserting a run', async () => {
    const t = convexTest(schema, modules)

    await expect(startRun(t, { agentName: '   ' })).rejects.toThrow(
      'Agent run agentName is required',
    )
    await expect(startRun(t, { expiresAt: Date.now() - 1 })).rejects.toThrow(
      'Agent run expiry must be in the future',
    )
    await expect(startRun(t, { maxTotalTokens: 0 })).rejects.toThrow(
      'Agent run maxTotalTokens must be a positive integer',
    )
    await expect(startRun(t, { maxOrganizationTotalTokens: -1 })).rejects.toThrow(
      'Agent run maxOrganizationTotalTokens must be a positive integer',
    )
    await expect(startRun(t, { maxUserTotalTokens: 1.5 })).rejects.toThrow(
      'Agent run maxUserTotalTokens must be a positive integer',
    )

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('normalizes delegated run names and capabilities before storing', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, {
      agentName: '  project-assistant  ',
      capabilities: ['project:draft', 'project:read', 'project:read'],
    })

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))

    expect(run).toMatchObject({
      agentName: 'project-assistant',
      capabilities: ['project:read', 'project:draft'],
    })
  })

  it('checks Better Auth-style permissions before inserting a delegated run', async () => {
    const t = convexTest(schema, modules)
    const events: string[] = []

    const agentRunId = await t.run(async (ctx) => {
      return await startDelegatedRunAfterPermissionCheck(
        ctx,
        {
          organizationId: 'better-auth-org-id',
          agentName: 'project-assistant',
          startedByAuthUserId: 'better-auth-user-id',
          capabilities: ['project:read', 'project:draft', 'project:delete'],
        },
        async (permissionCtx, args) => {
          events.push(JSON.stringify(args))
          const runsBeforeInsert = await permissionCtx.db.query('agentRuns').take(10)
          expect(runsBeforeInsert).toHaveLength(0)

          return { authUserId: 'better-auth-user-id' }
        },
      )
    })

    expect(events).toEqual([
      JSON.stringify({
        organizationId: 'better-auth-org-id',
        permissions: {
          project: ['read', 'create', 'delete'],
        },
      }),
    ])

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      _id: agentRunId,
      organizationId: 'better-auth-org-id',
      startedByAuthUserId: 'better-auth-user-id',
      capabilities: ['project:read', 'project:draft', 'project:delete'],
    })
  })

  it('does not start a delegated run when the Better Auth-style permission check fails', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        return await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:delete'],
          },
          async () => {
            throw new Error('Missing project:delete permission')
          },
        )
      }),
    ).rejects.toThrow('Missing project:delete permission')

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('does not start a delegated run for a different user than the permission check returned', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        return await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:draft'],
          },
          async () => ({ authUserId: 'other-better-auth-user-id' }),
        )
      }),
    ).rejects.toThrow('Permission check returned a different user')

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('starts a delegated run only after live Better Auth organization permission succeeds', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)

    await expect(
      t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
        organizationId,
        agentName: 'project-assistant',
        startedByAuthUserId: 'spoofed-delegating-user',
        sessionTokenForTest: owner.token,
        capabilities: ['project:draft'],
      }),
    ).rejects.toThrow('Unexpected field `startedByAuthUserId`')

    expect(await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))).toHaveLength(0)

    const agentRunId = await t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
      organizationId,
      agentName: '  project-assistant  ',
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete', 'project:draft', 'project:delete'],
    })

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      _id: agentRunId,
      organizationId,
      agentName: 'project-assistant',
      startedByAuthUserId: owner.userId,
      capabilities: ['project:draft', 'project:delete'],
    })
  })

  it('does not start a delegated run when live Better Auth organization permission fails', async () => {
    const t = initConvexTest()
    const { organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'agent-outsider@example.com')

    await expect(
      t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
        organizationId,
        agentName: 'project-assistant',
        sessionTokenForTest: outsider.token,
        capabilities: ['project:draft'],
      }),
    ).rejects.toThrow(/Agent run permission denied|User is not a member of the organization/)

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('creates draft state and agent audit for delegated tool use', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t)
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Draft launch plan',
      body: 'Reviewable project proposal',
    })

    const rows = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(rows.drafts).toHaveLength(1)
    expect(rows.drafts[0]).toMatchObject({
      _id: draftId,
      organizationId: 'better-auth-org-id',
      status: 'pending',
      sourceAgentRunId: agentRunId,
    })
    expect(rows.audit).toHaveLength(1)
    expect(rows.audit[0]).toMatchObject({
      organizationId: 'better-auth-org-id',
      actor: {
        kind: 'agent',
        agentRunId,
        delegatedByAuthUserId: 'better-auth-user-id',
      },
      action: 'projectDrafts.create',
      capability: 'project:draft',
      resourceType: 'projectDraft',
      resourceId: draftId,
    })
  })

  it('runs a real Convex Agent tool without trusting model-controlled authority fields', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        organizationId: 'ignored-public-org',
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(result).toMatchObject({
      text: 'Draft created for review.',
    })
    expect(result.threadId).toBeTypeOf('string')
    expect(result.messageCount).toBeGreaterThanOrEqual(3)
    expect(result.toolMessageCount).toBeGreaterThanOrEqual(2)
    expect(result.persistedMessagesContainRedaction).toBe(true)
    expect(result.persistedMessagesContainRawSecret).toBe(false)
    expect(rows.run).toMatchObject({
      status: 'completed',
      threadId: result.threadId,
    })
    expect(rows.drafts).toHaveLength(1)
    expect(rows.drafts[0]).toMatchObject({
      organizationId,
      title: 'Agent tool draft',
      body: 'Created through a real Convex Agent tool call',
      status: 'pending',
      sourceAgentRunId: agentRunId,
    })
    expect(rows.audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'agent',
          agentRunId,
          delegatedByAuthUserId: owner.userId,
        },
        action: 'projectDrafts.create',
        capability: 'project:draft',
        resourceType: 'projectDraft',
        resourceId: rows.drafts[0]._id,
      }),
    )
    expect(rows.usage).toHaveLength(2)
    expect(rows.usage).toEqual([
      expect.objectContaining({
        organizationId,
        agentRunId,
        threadId: result.threadId,
        startedByAuthUserId: owner.userId,
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      }),
      expect.objectContaining({
        organizationId,
        agentRunId,
        threadId: result.threadId,
        startedByAuthUserId: owner.userId,
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      }),
    ])
    expect(rows.usage[0].model).toBeTypeOf('string')
    expect(rows.usage[0].provider).toBeTypeOf('string')
  })

  it('does not let a non-delegating member execute another user agent run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const member = await createBetterAuthUser(t, 'agent-run-member@example.com')

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      return await auth.api.addMember({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          userId: member.userId,
          role: 'member',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: member.token,
      }),
    ).rejects.toThrow('Only the delegating user can execute an agent run')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'active',
      startedByAuthUserId: owner.userId,
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('streams Agent text deltas only through an accessible delegated run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-stream-viewer@example.com')

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      return await auth.api.addMember({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:read'],
    })

    await expect(
      t.action(publicApi.agentTools.streamProjectSummary, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Only the delegating user can execute an agent run')

    const beforeOwnerStream = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(beforeOwnerStream.run).toMatchObject({
      status: 'active',
      startedByAuthUserId: owner.userId,
    })
    expect(beforeOwnerStream.run?.threadId).toBeUndefined()
    expect(beforeOwnerStream.usage).toHaveLength(0)

    const result = await t.action(publicApi.agentTools.streamProjectSummary, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    expect(result).toMatchObject({
      text: 'Streamed draft summary for human review.',
    })
    expect(result.streamMessageCount).toBeGreaterThan(0)
    expect(result.deltaCount).toBeGreaterThan(0)

    const streams = await t.query(publicApi.agentThreads.syncAccessibleStreams, {
      agentRunId,
      sessionTokenForTest: owner.token,
      streamArgs: { kind: 'list' },
    })

    expect(streams).toMatchObject({
      agentRunId,
      organizationId,
      threadId: result.threadId,
      streams: {
        kind: 'list',
      },
    })
    expect(streams.streams.messages).toHaveLength(result.streamMessageCount)

    const streamMessages = streams.streams.messages as Array<{ streamId: string }>
    const deltas = await t.query(publicApi.agentThreads.syncAccessibleStreams, {
      agentRunId,
      sessionTokenForTest: owner.token,
      streamArgs: {
        kind: 'deltas',
        cursors: streamMessages.map((message) => ({
          streamId: message.streamId,
          cursor: 0,
        })),
      },
    })

    expect(deltas.streams.kind).toBe('deltas')
    expect(deltas.streams.deltas.length).toBe(result.deltaCount)

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, { expiresAt: Date.now() - 1 })
    })

    const streamsAfterExpiry = await t.query(publicApi.agentThreads.syncAccessibleStreams, {
      agentRunId,
      sessionTokenForTest: owner.token,
      streamArgs: { kind: 'list' },
    })
    expect(streamsAfterExpiry.streams.messages).toHaveLength(result.streamMessageCount)

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      records: await ctx.db.query('productRecords').take(10),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(rows.run).toMatchObject({
      status: 'completed',
      threadId: result.threadId,
    })
    expect(rows.records).toHaveLength(0)
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(1)
    expect(rows.usage[0]).toMatchObject({
      organizationId,
      agentRunId,
      threadId: result.threadId,
      startedByAuthUserId: owner.userId,
    })

    await expect(
      t.query(publicApi.agentThreads.syncAccessibleStreams, {
        agentRunId,
        sessionTokenForTest: viewer.token,
        streamArgs: { kind: 'list' },
      }),
    ).rejects.toThrow('Agent thread belongs to a different delegating user')
  })

  it('lists Agent thread messages only through an accessible delegated run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-thread-viewer@example.com')

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      return await auth.api.addMember({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run has no thread')

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const messages = await t.query(publicApi.agentThreads.listAccessibleMessages, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    expect(messages).toMatchObject({
      agentRunId,
      organizationId,
      threadId: result.threadId,
      messageCount: result.messageCount,
    })
    expect(messages.messages).toHaveLength(result.messageCount)

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        title: 'Late draft',
        body: 'Should not be accepted after completion',
      }),
    ).rejects.toThrow('Agent run is not running')

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Agent thread belongs to a different delegating user')

    const otherOwner = await createBetterAuthUser(t, 'other-agent-owner@example.com')
    const otherOrganization = await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      return await auth.api.createOrganization({
        headers: new Headers({ authorization: `Bearer ${otherOwner.token}` }),
        body: {
          name: 'Other Agent Org',
          slug: `other-agent-org-${Math.random().toString(36).slice(2)}`,
        },
      })
    })

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        organizationId: otherOrganization.id,
        agentRunId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Agent thread permission denied|User is not a member of the organization/)

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.query(publicApi.agentThreads.listAccessibleMessages, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not readable')
  })

  it('allows only the delegating Better Auth user to revoke an agent run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-revoke-viewer@example.com')
    const outsider = await createBetterAuthUser(t, 'agent-revoke-outsider@example.com')

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      return await auth.api.addMember({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        organizationId: 'ignored-public-org',
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        agentRunId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Agent run revocation denied|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Only the delegating user can revoke an agent run')

    await t.mutation(publicApi.agentRuns.revokeRun, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(rows.run).toMatchObject({
      status: 'revoked',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('does not revoke completed agent runs because they are readable history', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not revocable')

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, {
        expiresAt: Date.now() - 1,
      })
    })

    const messages = await t.query(publicApi.agentThreads.listAccessibleMessages, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })
    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))

    expect(run).toMatchObject({
      status: 'completed',
      threadId: result.threadId,
    })
    expect((run as { expiresAt?: number } | null)?.expiresAt).toBeLessThanOrEqual(Date.now())
    expect(messages.messageCount).toBe(result.messageCount)
  })

  it('does not overwrite terminal agent run states from failed action attempts', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const completedRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId: completedRunId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: completedRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const revokedRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(revokedRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: revokedRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const rows = await t.run(async (ctx) => ({
      completed: await ctx.db.get(completedRunId),
      revoked: await ctx.db.get(revokedRunId),
    }))

    expect(rows.completed).toMatchObject({
      status: 'completed',
    })
    expect(rows.revoked).toMatchObject({
      status: 'revoked',
    })
  })

  it('fails an agent run before recording usage beyond its token budget', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
      maxTotalTokens: 30,
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run token budget exceeded')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      records: await ctx.db.query('productRecords').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'failed',
      maxTotalTokens: 30,
    })
    expect(rows.drafts).toHaveLength(1)
    expect(rows.drafts[0]).toMatchObject({
      organizationId,
      sourceAgentRunId: agentRunId,
      status: 'rejected',
    })
    expect(rows.drafts[0].decidedAt).toBeTypeOf('number')
    expect(rows.records).toHaveLength(0)
    expect(rows.usage).toHaveLength(1)
    expect(rows.usage[0]).toMatchObject({
      organizationId,
      agentRunId,
      startedByAuthUserId: owner.userId,
      totalTokens: 20,
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: rows.drafts[0]._id,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be approved')

    const deletion = await t.action(publicApi.agentTools.deleteThreadForRetention, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })
    const afterRetention = await t.run(async (ctx) => ({
      draft: await ctx.db.get(rows.drafts[0]._id),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(deletion).toMatchObject({
      afterMessageCount: 0,
      deletedUsageEvents: 1,
    })
    expect(deletion.beforeMessageCount).toBeGreaterThan(0)
    expect(afterRetention.draft).toMatchObject({
      status: 'rejected',
    })
    expect(afterRetention.usage).toHaveLength(0)
  })

  it('rejects pending review rows when an agent run fails', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const alreadyRejectedRecordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft', 'project:delete'],
    })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Failed run draft',
      body: 'This review row should not stay pending',
    })
    const deletionRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId,
        productRecordId: recordId,
        reason: 'Failed run deletion request',
      },
    )
    const alreadyRejectedDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Already rejected failed run draft',
      body: 'This row is already decided before the run fails',
    })
    const alreadyRejectedDeletionRequestId = await t.mutation(
      internalApi.projectDeletionRequests.createFromAgent,
      {
        agentRunId,
        productRecordId: alreadyRejectedRecordId,
        reason: 'Already rejected failed run deletion request',
      },
    )

    await t.mutation(publicApi.projectDrafts.reject, {
      draftId: alreadyRejectedDraftId,
      sessionTokenForTest: owner.token,
    })
    await t.mutation(publicApi.projectDeletionRequests.reject, {
      deletionRequestId: alreadyRejectedDeletionRequestId,
      sessionTokenForTest: owner.token,
    })
    const alreadyRejectedBeforeFailure = await t.run(async (ctx) => ({
      draft: await ctx.db.get(alreadyRejectedDraftId),
      deletionRequest: await ctx.db.get(alreadyRejectedDeletionRequestId),
    }))

    await t.mutation(internalApi.agentRuns.failRun, {
      agentRunId,
    })

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      draft: await ctx.db.get(draftId),
      alreadyRejectedDraft: await ctx.db.get(alreadyRejectedDraftId),
      deletionRequest: await ctx.db.get(deletionRequestId),
      alreadyRejectedDeletionRequest: await ctx.db.get(alreadyRejectedDeletionRequestId),
      record: await ctx.db.get(recordId),
      alreadyRejectedRecord: await ctx.db.get(alreadyRejectedRecordId),
    }))
    const pendingDrafts = await t.query(publicApi.projectDrafts.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const pendingDeletionRequests = await t.query(publicApi.projectDeletionRequests.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })

    expect(rows.run).toMatchObject({
      status: 'failed',
    })
    expect(rows.draft).toMatchObject({
      status: 'rejected',
    })
    expect((rows.draft as Doc<'projectDrafts'> | null)?.decidedAt).toBeTypeOf('number')
    expect(rows.alreadyRejectedDraft).toMatchObject({
      status: 'rejected',
      decidedAt: (alreadyRejectedBeforeFailure.draft as Doc<'projectDrafts'> | null)?.decidedAt,
    })
    expect(rows.deletionRequest).toMatchObject({
      status: 'rejected',
    })
    expect((rows.deletionRequest as Doc<'projectDeletionRequests'> | null)?.decidedAt).toBeTypeOf(
      'number',
    )
    expect(rows.alreadyRejectedDeletionRequest).toMatchObject({
      status: 'rejected',
      decidedAt: (
        alreadyRejectedBeforeFailure.deletionRequest as Doc<'projectDeletionRequests'> | null
      )?.decidedAt,
    })
    expect(rows.record).not.toBeNull()
    expect(rows.alreadyRejectedRecord).not.toBeNull()
    expect(pendingDrafts).toHaveLength(0)
    expect(pendingDeletionRequests).toHaveLength(0)

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be approved')
  })

  it('fails before agent side effects when the organization token budget is exhausted', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const firstRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
      maxOrganizationTotalTokens: 40,
    })

    await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId: firstRunId,
      sessionTokenForTest: owner.token,
    })

    const secondRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
      maxOrganizationTotalTokens: 40,
    })
    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: secondRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Organization agent token budget exceeded')

    const rows = await t.run(async (ctx) => ({
      secondRun: await ctx.db.get(secondRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.secondRun).toMatchObject({
      status: 'failed',
      maxOrganizationTotalTokens: 40,
    })
    expect(rows.secondRun?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(1)
    expect(rows.audit.every((event) => event.actor.agentRunId === firstRunId)).toBe(true)
    expect(rows.usage).toHaveLength(2)
    expect(rows.usage.every((event) => event.agentRunId === firstRunId)).toBe(true)
  })

  it('fails before agent side effects when the delegating user token budget is exhausted', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const firstRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
      maxUserTotalTokens: 40,
    })

    await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId: firstRunId,
      sessionTokenForTest: owner.token,
    })

    const secondRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
      maxUserTotalTokens: 40,
    })
    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: secondRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('User agent token budget exceeded')

    const rows = await t.run(async (ctx) => ({
      secondRun: await ctx.db.get(secondRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.secondRun).toMatchObject({
      status: 'failed',
      maxUserTotalTokens: 40,
    })
    expect(rows.secondRun?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(1)
    expect(rows.audit.every((event) => event.actor.agentRunId === firstRunId)).toBe(true)
    expect(rows.usage).toHaveLength(2)
    expect(rows.usage.every((event) => event.agentRunId === firstRunId)).toBe(true)
  })

  it('deletes Agent thread history and usage events without deleting product history', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-retention-viewer@example.com')
    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      await auth.api.addMember({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const beforeRetention = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(beforeRetention.drafts).toHaveLength(1)
    expect(beforeRetention.audit).toHaveLength(1)
    expect(beforeRetention.usage).toHaveLength(2)

    await expect(
      t.action(publicApi.agentTools.deleteThreadForRetention, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Only the delegating user can retention-delete an agent run')
    const afterViewerRetentionAttempt = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(afterViewerRetentionAttempt.drafts).toHaveLength(1)
    expect(afterViewerRetentionAttempt.audit).toHaveLength(1)
    expect(afterViewerRetentionAttempt.usage).toHaveLength(2)

    await expect(
      t.mutation(internalApi.agentUsage.deleteForRun, {
        agentRunId,
        threadId: result.threadId,
      }),
    ).rejects.toThrow('Unexpected field `threadId`')

    const deletion = await t.action(publicApi.agentTools.deleteThreadForRetention, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    const afterRetention = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(deletion).toMatchObject({
      beforeMessageCount: result.messageCount,
      afterMessageCount: 0,
      deletedUsageEvents: 2,
    })
    expect(afterRetention.drafts).toHaveLength(1)
    expect(afterRetention.audit).toHaveLength(1)
    expect(afterRetention.usage).toHaveLength(0)

    const retriedDeletion = await t.action(publicApi.agentTools.deleteThreadForRetention, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })
    const afterRetry = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(retriedDeletion).toMatchObject({
      beforeMessageCount: 0,
      afterMessageCount: 0,
      deletedUsageEvents: 0,
    })
    expect(afterRetry.drafts).toHaveLength(1)
    expect(afterRetry.audit).toHaveLength(1)
    expect(afterRetry.usage).toHaveLength(0)
  })

  it('does not retention-delete active or running agent runs', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.action(publicApi.agentTools.deleteThreadForRetention, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Active agent runs are not retention eligible')

    await expect(
      t.mutation(internalApi.agentUsage.deleteForRun, {
        agentRunId,
      }),
    ).rejects.toThrow('Active agent runs are not retention eligible')

    await t.mutation(internalApi.agentRuns.claimRunExecutionByDelegatingUser, {
      agentRunId,
      capability: 'project:draft',
      sessionTokenForTest: owner.token,
    })
    await t.mutation(internalApi.agentRuns.attachThread, {
      agentRunId,
      threadId: 'agent-thread-id',
    })
    await t.mutation(internalApi.agentUsage.recordUsage, {
      agentRunId,
      threadId: 'agent-thread-id',
      model: 'mock-model',
      provider: 'mock-provider',
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    })

    await expect(
      t.mutation(internalApi.agentUsage.deleteForRun, {
        agentRunId,
      }),
    ).rejects.toThrow('Active agent runs are not retention eligible')

    const usage = await t.run(async (ctx) => await ctx.db.query('agentUsageEvents').take(10))
    expect(usage).toHaveLength(1)
  })

  it('keeps agent output out of canonical product state until human approval', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startRun(t, { organizationId })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Draft launch plan',
      body: 'Reviewable project proposal',
    })

    const records = await t.run(async (ctx) => await ctx.db.query('productRecords').take(10))
    expect(records).toHaveLength(0)

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId,
        approvedByAuthUserId: 'spoofed-approver',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `approvedByAuthUserId`')

    const beforeApprovalAfterSpoof = await t.run(async (ctx) => ({
      draft: await ctx.db.get(draftId),
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeApprovalAfterSpoof.draft).toMatchObject({
      status: 'pending',
    })
    expect(beforeApprovalAfterSpoof.records).toHaveLength(0)
    expect(beforeApprovalAfterSpoof.audit).toHaveLength(0)

    const recordId = await t.mutation(publicApi.projectDrafts.approve, {
      draftId,
      sessionTokenForTest: owner.token,
    })

    const rows = await t.run(async (ctx) => ({
      draft: await ctx.db.get(draftId),
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))

    expect(rows.draft).toMatchObject({
      status: 'approved',
    })
    expect(rows.records).toHaveLength(1)
    expect(rows.records[0]).toMatchObject({
      _id: recordId,
      organizationId,
      sourceDraftId: draftId,
      approvedByAuthUserId: owner.userId,
    })
    expect(rows.audit).toHaveLength(1)
    expect(rows.audit[0]).toMatchObject({
      organizationId,
      actor: {
        kind: 'user',
        authUserId: owner.userId,
      },
      action: 'projectDrafts.approve',
      resourceType: 'productRecord',
      resourceId: recordId,
      sourceDraftId: draftId,
    })
  })

  it('rejects blank agent-created review state before inserting rows', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const draftRunId = await startRun(t, { organizationId })

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: draftRunId,
        title: '   ',
        body: 'Reviewable body',
      }),
    ).rejects.toThrow('Draft title and body are required')
    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: draftRunId,
        title: 'Reviewable title',
        body: '   ',
      }),
    ).rejects.toThrow('Draft title and body are required')

    const afterInvalidDrafts = await t.run(async (ctx) => ({
      drafts: await ctx.db.query('projectDrafts').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))
    expect(afterInvalidDrafts.drafts).toHaveLength(0)
    expect(afterInvalidDrafts.agentAudit).toHaveLength(0)

    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: '   ',
      }),
    ).rejects.toThrow('Deletion reason is required')

    const afterInvalidDeletion = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      deletionRequests: await ctx.db.query('projectDeletionRequests').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))
    expect(afterInvalidDeletion.record).not.toBeNull()
    expect(afterInvalidDeletion.deletionRequests).toHaveLength(0)
    expect(
      afterInvalidDeletion.agentAudit.filter(
        (event) => event.action === 'projectDeletionRequests.create',
      ),
    ).toHaveLength(0)
  })

  it('rejects draft approval when Better Auth organization permission fails', async () => {
    const t = initConvexTest()
    const { organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'draft-outsider@example.com')
    const agentRunId = await startRun(t, { organizationId })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Unauthorized approval',
      body: 'This should stay pending',
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Missing project:create permission|User is not a member of the organization/)

    const rows = await t.run(async (ctx) => ({
      draft: await ctx.db.get(draftId),
      records: await ctx.db.query('productRecords').take(10),
    }))

    expect(rows.draft).toMatchObject({
      status: 'pending',
    })
    expect(rows.records).toHaveLength(0)
  })

  it('does not decide cross-organization draft or deletion request ids', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const otherOwner = await createBetterAuthUser(t, 'other-approval-owner@example.com')
    const otherOrganization = await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      return await auth.api.createOrganization({
        headers: new Headers({ authorization: `Bearer ${otherOwner.token}` }),
        body: {
          name: 'Other Approval Org',
          slug: `other-approval-org-${Math.random().toString(36).slice(2)}`,
        },
      })
    })
    const agentRunId = await startRun(t, { organizationId })
    await markRunRunningWithThread(t, agentRunId)
    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Tenant-bound draft',
      body: 'Only the owning organization can approve this draft',
    })
    const recordId = await t.mutation(publicApi.projectDrafts.approve, {
      draftId,
      sessionTokenForTest: owner.token,
    })
    const pendingDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Pending tenant-bound draft',
      body: 'Wrong organization id must not approve this draft',
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)
    const deletionRequestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Tenant-bound deletion request',
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        organizationId: otherOrganization.id,
        draftId: pendingDraftId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow()

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        organizationId: otherOrganization.id,
        deletionRequestId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow()

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: pendingDraftId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:create permission|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:delete permission|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: pendingDraftId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:create permission|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId,
        sessionTokenForTest: otherOwner.token,
      }),
    ).rejects.toThrow(/Missing project:delete permission|User is not a member of the organization/)

    const rows = await t.run(async (ctx) => ({
      draft: await ctx.db.get(pendingDraftId),
      record: await ctx.db.get(recordId),
      deletionRequest: await ctx.db.get(deletionRequestId),
      otherRecords: await ctx.db
        .query('productRecords')
        .withIndex('by_org', (q) => q.eq('organizationId', otherOrganization.id))
        .collect(),
    }))

    expect(rows.draft).toMatchObject({
      organizationId,
      status: 'pending',
    })
    expect(rows.record).not.toBeNull()
    expect(rows.deletionRequest).toMatchObject({
      organizationId,
      status: 'pending',
    })
    expect(rows.otherRecords).toHaveLength(0)
  })

  it('gates approval queue reads with Better Auth organization permissions', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'approval-queue-outsider@example.com')
    const agentRunId = await startRun(t, { organizationId })
    await markRunRunningWithThread(t, agentRunId)

    const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Reviewable draft',
      body: 'Visible only to organization readers',
    })
    const recordId = await t.mutation(publicApi.projectDrafts.approve, {
      draftId,
      sessionTokenForTest: owner.token,
    })
    const pendingDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Pending draft',
      body: 'Still awaiting review',
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)
    const deletionRequestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Review deletion',
    })

    const drafts = await t.query(publicApi.projectDrafts.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deletionRequests = await t.query(publicApi.projectDeletionRequests.listPending, {
      organizationId,
      sessionTokenForTest: owner.token,
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      _id: pendingDraftId,
      organizationId,
      status: 'pending',
    })
    expect(deletionRequests).toHaveLength(1)
    expect(deletionRequests[0]).toMatchObject({
      _id: deletionRequestId,
      organizationId,
      status: 'pending',
      productRecordId: recordId,
    })

    await expect(
      t.query(publicApi.projectDrafts.listPending, {
        organizationId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Missing project:read permission|User is not a member of the organization/)
    await expect(
      t.query(publicApi.projectDeletionRequests.listPending, {
        organizationId: 'other-better-auth-org-id',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow(/Missing project:read permission|User is not a member of the organization/)
  })

  it('does not promote or reject already-decided drafts', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startRun(t, { organizationId })
    await markRunRunningWithThread(t, agentRunId)

    const rejectedDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Reject me',
      body: 'Rejected proposal',
    })

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: rejectedDraftId,
        rejectedByAuthUserId: 'spoofed-rejecter',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `rejectedByAuthUserId`')

    const beforeDraftRejectionAfterSpoof = await t.run(async (ctx) => ({
      draft: await ctx.db.get(rejectedDraftId),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeDraftRejectionAfterSpoof.draft).toMatchObject({
      status: 'pending',
    })
    expect(beforeDraftRejectionAfterSpoof.audit).toHaveLength(0)

    await t.mutation(publicApi.projectDrafts.reject, {
      draftId: rejectedDraftId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: rejectedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be approved')

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: rejectedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be rejected')

    const approvedDraftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
      agentRunId,
      title: 'Approve once',
      body: 'Approved proposal',
    })

    await t.mutation(publicApi.projectDrafts.approve, {
      draftId: approvedDraftId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDrafts.approve, {
        draftId: approvedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be approved')

    await expect(
      t.mutation(publicApi.projectDrafts.reject, {
        draftId: approvedDraftId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending drafts can be rejected')

    const rows = await t.run(async (ctx) => ({
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(rows.records).toHaveLength(1)
    expect(rows.audit).toHaveLength(2)
    expect(rows.audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'user',
          authUserId: owner.userId,
        },
        action: 'projectDrafts.reject',
        resourceType: 'projectDraft',
        resourceId: rejectedDraftId,
        sourceDraftId: rejectedDraftId,
      }),
    )
  })

  it('keeps destructive agent actions pending until human approval', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        organizationId: 'ignored-internal-org',
        productRecordId: recordId,
        reason: 'Old shape',
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await markRunRunningWithThread(t, deleteRunId)

    const requestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Duplicate project record',
    })

    const beforeApproval = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(beforeApproval.record).not.toBeNull()
    expect(beforeApproval.requests).toHaveLength(1)
    expect(beforeApproval.requests[0]).toMatchObject({
      _id: requestId,
      organizationId,
      productRecordId: recordId,
      status: 'pending',
      sourceAgentRunId: deleteRunId,
    })
    expect(beforeApproval.agentAudit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'agent',
          agentRunId: deleteRunId,
          delegatedByAuthUserId: owner.userId,
        },
        action: 'projectDeletionRequests.create',
        capability: 'project:delete',
        resourceType: 'projectDeletionRequest',
        resourceId: requestId,
      }),
    )

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: requestId,
        deletedByAuthUserId: 'spoofed-deleter',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `deletedByAuthUserId`')

    const beforeDestructiveApprovalAfterSpoof = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      request: await ctx.db.get(requestId),
      productAudit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeDestructiveApprovalAfterSpoof.record).not.toBeNull()
    expect(beforeDestructiveApprovalAfterSpoof.request).toMatchObject({
      status: 'pending',
    })
    expect(
      beforeDestructiveApprovalAfterSpoof.productAudit.filter(
        (event) => event.action === 'productRecords.delete',
      ),
    ).toHaveLength(0)

    await t.mutation(publicApi.projectDeletionRequests.approve, {
      deletionRequestId: requestId,
      sessionTokenForTest: owner.token,
    })

    const afterApproval = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
      productAudit: await ctx.db.query('productAuditEvents').take(10),
    }))

    expect(afterApproval.record).toBeNull()
    expect(afterApproval.requests[0]).toMatchObject({
      _id: requestId,
      status: 'approved',
    })
    expect(afterApproval.productAudit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'user',
          authUserId: owner.userId,
        },
        action: 'productRecords.delete',
        resourceType: 'productRecord',
        resourceId: recordId,
        sourceDeletionRequestId: requestId,
      }),
    )
  })

  it('keeps only one pending deletion request per product record', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    const requestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Remove duplicate',
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Second request for same record',
      }),
    ).rejects.toThrow('Deletion request already pending')

    const rows = await t.run(async (ctx) => ({
      requests: await ctx.db.query('projectDeletionRequests').take(10),
      agentAudit: await ctx.db.query('agentAuditEvents').take(10),
    }))

    expect(rows.requests).toHaveLength(1)
    expect(rows.requests[0]).toMatchObject({
      _id: requestId,
      productRecordId: recordId,
      status: 'pending',
    })
    expect(
      rows.agentAudit.filter((event) => event.action === 'projectDeletionRequests.create'),
    ).toHaveLength(1)
  })

  it('rejects destructive approval when Better Auth organization permission fails', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'delete-outsider@example.com')
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    const requestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: recordId,
      reason: 'Unauthorized destructive approval',
    })

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: requestId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Missing project:delete permission|User is not a member of the organization/)

    const rows = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      request: await ctx.db.get(requestId),
    }))

    expect(rows.record).not.toBeNull()
    expect(rows.request).toMatchObject({
      status: 'pending',
    })
  })

  it('blocks destructive agent tools after the delegating member is downgraded', async () => {
    const t = initConvexTest()
    const { owner, admin, adminMember, organizationId } =
      await createBetterAuthOrganizationWithAdmin(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      await auth.api.updateMemberRole({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          memberId: adminMember.id,
          role: 'member',
        },
      })
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Permission changed after delegation',
      }),
    ).rejects.toThrow('Delegating user no longer has project:delete permission')

    const rows = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
    }))

    expect(rows.record).not.toBeNull()
    expect(rows.requests).toHaveLength(0)
  })

  it('blocks destructive agent tools after the delegating member is removed', async () => {
    const t = initConvexTest()
    const { owner, admin, adminMember, organizationId } =
      await createBetterAuthOrganizationWithAdmin(t)
    const recordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: admin.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    await t.run(async (ctx) => {
      const auth = createAuth(ctx)
      await auth.api.removeMember({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
        body: {
          organizationId,
          memberIdOrEmail: adminMember.id,
        },
      })
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId: deleteRunId,
        productRecordId: recordId,
        reason: 'Member removed after delegation',
      }),
    ).rejects.toThrow('Delegating user is not a current organization member')

    const rows = await t.run(async (ctx) => ({
      record: await ctx.db.get(recordId),
      requests: await ctx.db.query('projectDeletionRequests').take(10),
    }))

    expect(rows.record).not.toBeNull()
    expect(rows.requests).toHaveLength(0)
  })

  it('does not apply or reject already-decided deletion requests', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const rejectedRecordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const approvedRecordId = await createApprovedRecord(t, {
      organizationId,
      sessionTokenForTest: owner.token,
    })
    const deleteRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete'],
    })
    await markRunRunningWithThread(t, deleteRunId)

    const rejectedRequestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: rejectedRecordId,
      reason: 'Reject this deletion',
    })

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId: rejectedRequestId,
        rejectedByAuthUserId: 'spoofed-rejecter',
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `rejectedByAuthUserId`')

    const beforeDeletionRejectionAfterSpoof = await t.run(async (ctx) => ({
      request: await ctx.db.get(rejectedRequestId),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(beforeDeletionRejectionAfterSpoof.request).toMatchObject({
      status: 'pending',
    })
    expect(
      beforeDeletionRejectionAfterSpoof.audit.filter(
        (event) => event.action === 'projectDeletionRequests.reject',
      ),
    ).toHaveLength(0)

    await t.mutation(publicApi.projectDeletionRequests.reject, {
      deletionRequestId: rejectedRequestId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: rejectedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be approved')

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId: rejectedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be rejected')

    expect(await t.run(async (ctx) => await ctx.db.get(rejectedRecordId))).not.toBeNull()

    const approvedRequestId = await t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
      agentRunId: deleteRunId,
      productRecordId: approvedRecordId,
      reason: 'Approve once',
    })

    await t.mutation(publicApi.projectDeletionRequests.approve, {
      deletionRequestId: approvedRequestId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.projectDeletionRequests.approve, {
        deletionRequestId: approvedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be approved')

    await expect(
      t.mutation(publicApi.projectDeletionRequests.reject, {
        deletionRequestId: approvedRequestId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Only pending deletion requests can be rejected')

    const rows = await t.run(async (ctx) => ({
      records: await ctx.db.query('productRecords').take(10),
      audit: await ctx.db.query('productAuditEvents').take(10),
    }))
    expect(rows.records).toHaveLength(1)
    expect(rows.records[0]._id).toBe(rejectedRecordId)
    expect(
      rows.audit.filter(
        (event) =>
          event.action === 'productRecords.delete' ||
          event.action === 'projectDeletionRequests.reject',
      ),
    ).toHaveLength(2)
    expect(rows.audit).toContainEqual(
      expect.objectContaining({
        organizationId,
        actor: {
          kind: 'user',
          authUserId: owner.userId,
        },
        action: 'projectDeletionRequests.reject',
        resourceType: 'projectDeletionRequest',
        resourceId: rejectedRequestId,
        sourceDeletionRequestId: rejectedRequestId,
      }),
    )
  })

  it('rejects wrong organization and undelegated capabilities', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, { capabilities: ['project:draft', 'project:delete'] })
    await markRunRunningWithThread(t, agentRunId)
    const otherAgentRunId = await startRun(t, {
      organizationId: 'other-better-auth-org-id',
      capabilities: ['project:draft'],
    })
    const otherRecordId = await t.run(async (ctx) => {
      const otherDraftId = await ctx.db.insert('projectDrafts', {
        organizationId: 'other-better-auth-org-id',
        title: 'Other org draft',
        body: 'Other org body',
        status: 'approved',
        sourceAgentRunId: otherAgentRunId,
        createdAt: Date.now(),
        decidedAt: Date.now(),
      })

      return await ctx.db.insert('productRecords', {
        organizationId: 'other-better-auth-org-id',
        title: 'Other org record',
        body: 'Other org body',
        sourceDraftId: otherDraftId,
        approvedByAuthUserId: 'other-better-auth-user-id',
        createdAt: Date.now(),
      })
    })

    await expect(
      t.mutation(internalApi.projectDeletionRequests.createFromAgent, {
        agentRunId,
        productRecordId: otherRecordId,
        reason: 'Cross-organization delete attempt',
      }),
    ).rejects.toThrow('Agent run organization mismatch')

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId,
        organizationId: 'other-better-auth-org-id',
        title: 'Wrong org',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    const readOnlyRunId = await startRun(t, { capabilities: ['project:read'] })
    await markRunRunningWithThread(t, readOnlyRunId)
    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: readOnlyRunId,
        title: 'Missing capability',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Agent capability was not delegated')
  })

  it('rejects revoked and expired runs', async () => {
    const t = convexTest(schema, modules)
    const revokedRunId = await startRun(t)

    await t.run(async (ctx) => {
      await ctx.db.patch(revokedRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: revokedRunId,
        title: 'Revoked',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Agent run is not running')

    const expiredRunId = await startRun(t, { expiresAt: Date.now() + 60_000 })
    await markRunRunningWithThread(t, expiredRunId)
    await t.run(async (ctx) => {
      await ctx.db.patch(expiredRunId, {
        expiresAt: Date.now() - 1,
      })
    })
    await expect(
      t.mutation(internalApi.projectDrafts.createFromAgent, {
        agentRunId: expiredRunId,
        title: 'Expired',
        body: 'Blocked',
      }),
    ).rejects.toThrow('Agent run is expired')
  })
})
