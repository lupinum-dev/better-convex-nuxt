import { createHash } from 'node:crypto'

import type { ConvexHttpClient } from 'convex/browser'
import { createError } from 'h3'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const createProjectSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
})

const listProjectsSchema = z.object({
  organizationId: z.string(),
})

export function hashBearerSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

export function parseBearerToken(value: string | undefined) {
  const [scheme, token] = value?.split(' ') ?? []
  if (scheme !== 'Bearer' || !token) {
    throw createError({ statusCode: 401, statusMessage: 'Bearer token required' })
  }

  return token
}

export function createMcpHandlers(client: ConvexHttpClient, credentialHash: string) {
  return {
    listTools() {
      return {
        tools: [
          {
            name: 'projects.list',
            description: 'List projects for the credential organization',
            inputSchema: {
              type: 'object',
              properties: { organizationId: { type: 'string' } },
              required: ['organizationId'],
            },
          },
          {
            name: 'projects.create',
            description: 'Create a project in the credential organization',
            inputSchema: {
              type: 'object',
              properties: {
                organizationId: { type: 'string' },
                name: { type: 'string' },
              },
              required: ['organizationId', 'name'],
            },
          },
        ],
      }
    },

    async callTool(name: string, rawArgs: unknown) {
      if (name === 'projects.list') {
        const args = listProjectsSchema.parse(rawArgs)
        const projects = await client.query(api.projects.listForServiceActor, {
          credentialHash,
          organizationId: args.organizationId as Id<'organizations'>,
        })

        return {
          content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
        }
      }

      if (name === 'projects.create') {
        const args = createProjectSchema.parse(rawArgs)
        const projectId = await client.mutation(api.projects.createFromServiceActor, {
          credentialHash,
          organizationId: args.organizationId as Id<'organizations'>,
          name: args.name,
        })

        return {
          content: [{ type: 'text', text: `Created project ${projectId}` }],
        }
      }

      throw createError({ statusCode: 404, statusMessage: `Unknown tool: ${name}` })
    },
  }
}
