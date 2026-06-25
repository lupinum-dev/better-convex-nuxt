import { ConvexError, v } from 'convex/values'

import { internalMutation, mutation } from './_generated/server'
import { createAuth } from './auth'

const orgApiKeyConfigId = 'org-keys'
const orgProjectWriterKeyConfigId = 'org-project-writer'
const orgProjectReaderKeyConfigId = 'org-project-reader'
const orgScopedApiKeyConfigIds = [
  orgApiKeyConfigId,
  orgProjectWriterKeyConfigId,
  orgProjectReaderKeyConfigId,
] as const

export const verifyKey = mutation({
  args: {
    key: v.string(),
    configId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = createAuth(ctx)
    const result = await auth.api.verifyApiKey({
      body: {
        key: args.key,
        configId: args.configId,
      },
    })

    return {
      valid: result.valid,
      key: result.key
        ? {
            id: result.key.id,
            configId: result.key.configId,
            referenceId: result.key.referenceId,
            enabled: result.key.enabled,
            start: result.key.start,
            requestCount: result.key.requestCount,
          }
        : null,
      error: result.error,
    }
  },
})

export const createProjectWithApiKey = internalMutation({
  args: {
    key: v.string(),
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const auth = createAuth(ctx)
    const verified = await auth.api.verifyApiKey({
      body: {
        key: args.key,
        configId: orgProjectWriterKeyConfigId,
        permissions: {
          project: ['create'],
        },
      },
    })

    if (!verified.valid || !verified.key) {
      throw new ConvexError(verified.error?.code ?? 'INVALID_API_KEY')
    }

    if (verified.key.referenceId !== args.organizationId) {
      throw new ConvexError('API key organization mismatch')
    }

    const actor = `apiKey:${verified.key.id}`
    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name,
      createdByAuthUserId: actor,
      createdAt: Date.now(),
    })

    await ctx.db.insert('auditEvents', {
      organizationId: args.organizationId,
      actorAuthUserId: actor,
      action: 'projects.createFromApiKey',
      resourceType: 'project',
      resourceId: projectId,
      createdAt: Date.now(),
    })

    return {
      projectId,
      apiKeyId: verified.key.id,
    }
  },
})

export const deleteOrganizationAfterRevokingApiKeysServerSide = mutation({
  args: {
    organizationId: v.string(),
    sessionTokenForExperiment: v.string(),
  },
  handler: async (ctx, args) => {
    if (process.env.ALLOW_TEST_RESET !== 'true') {
      throw new ConvexError('Session token experiment path is disabled')
    }

    const auth = createAuth(ctx)
    const headers = new Headers({
      authorization: `Bearer ${args.sessionTokenForExperiment}`,
    })
    const deletedApiKeyIds: string[] = []

    for (const configId of orgScopedApiKeyConfigIds) {
      const listed = await auth.api.listApiKeys({
        headers,
        query: {
          configId,
          organizationId: args.organizationId,
          limit: 100,
        },
      })

      for (const apiKey of listed.apiKeys ?? []) {
        await auth.api.deleteApiKey({
          headers,
          body: {
            configId,
            keyId: apiKey.id,
          },
        })
        deletedApiKeyIds.push(apiKey.id)
      }
    }

    const deletedOrganization = await auth.api.deleteOrganization({
      headers,
      body: {
        organizationId: args.organizationId,
      },
    })

    return {
      deletedApiKeyIds,
      deletedOrganization,
    }
  },
})
