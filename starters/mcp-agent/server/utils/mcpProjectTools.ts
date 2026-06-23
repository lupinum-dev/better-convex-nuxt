import { createHash } from 'node:crypto'

import type { McpToolDefinitionListItem } from '@nuxtjs/mcp-toolkit/server'
import { ConvexHttpClient } from 'convex/browser'
import { createError } from 'h3'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

const projectToolInput = {
  organizationId: z.string(),
}

const createProjectInput = {
  ...projectToolInput,
  name: z.string().min(1),
}

type ProjectToolClient = Pick<ConvexHttpClient, 'query' | 'mutation'>
type RequestExtra = {
  requestInfo?: {
    headers?: Headers | Record<string, string | string[] | undefined>
  }
}
type ProjectToolArgs = {
  getCredentialHash?: (extra: RequestExtra) => string
  getClient: () => ProjectToolClient
}
type ProjectDto = {
  id: string
  organizationId: string
  name: string
  createdBy: Doc<'projects'>['createdBy']
  createdAt: number
}

export function hashBearerSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

export function parseBearerToken(value: string | undefined) {
  const parts = value?.split(' ') ?? []
  const [scheme, token] = parts
  if (parts.length !== 2 || scheme !== 'Bearer' || !token) {
    throw createError({ statusCode: 401, statusMessage: 'Bearer token required' })
  }

  return token
}

function getExtraHeader(extra: RequestExtra, name: string) {
  const headers = extra.requestInfo?.headers
  if (!headers) return undefined

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined
  }

  const value = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export function credentialHashFromExtra(extra: RequestExtra) {
  return hashBearerSecret(parseBearerToken(getExtraHeader(extra, 'authorization')))
}

export function createProjectToolClient(configuredConvexUrl?: string) {
  const convexUrl = configuredConvexUrl
    ?? process.env.NUXT_PUBLIC_CONVEX_URL
    ?? process.env.VITE_CONVEX_URL
    ?? process.env.CONVEX_URL
  if (typeof convexUrl !== 'string' || !convexUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_PUBLIC_CONVEX_URL or VITE_CONVEX_URL is required',
    })
  }

  return new ConvexHttpClient(convexUrl)
}

function toProjectDto(project: Doc<'projects'>): ProjectDto {
  return {
    id: project._id,
    organizationId: project.organizationId,
    name: project.name,
    createdBy: project.createdBy,
    createdAt: project.createdAt,
  }
}

export function createListProjectsTool(args: ProjectToolArgs): McpToolDefinitionListItem {
  return {
    name: 'projects.list',
    description: 'List projects for the credential organization',
    inputSchema: projectToolInput,
    annotations: {
      readOnlyHint: true,
    },
    handler: async ({ organizationId }, extra) => {
      const credentialHash = args.getCredentialHash?.(extra) ?? credentialHashFromExtra(extra)
      const projects = await args.getClient().query(api.projects.listForServiceActor, {
        credentialHash,
        organizationId: organizationId as Id<'organizations'>,
      })

      return {
        content: [{ type: 'text', text: JSON.stringify(projects.map(toProjectDto), null, 2) }],
      }
    },
  }
}

export function createCreateProjectTool(args: ProjectToolArgs): McpToolDefinitionListItem {
  return {
    name: 'projects.create',
    description: 'Create a project in the credential organization',
    inputSchema: createProjectInput,
    annotations: {
      destructiveHint: false,
    },
    handler: async ({ organizationId, name }, extra) => {
      const credentialHash = args.getCredentialHash?.(extra) ?? credentialHashFromExtra(extra)
      const projectId = await args.getClient().mutation(api.projects.createFromServiceActor, {
        credentialHash,
        organizationId: organizationId as Id<'organizations'>,
        name,
      })

      return {
        content: [{ type: 'text', text: `Created project ${projectId}` }],
      }
    },
  }
}

export function createProjectMcpTools(args: ProjectToolArgs) {
  return {
    listProjects: createListProjectsTool(args),
    createProject: createCreateProjectTool(args),
  }
}
