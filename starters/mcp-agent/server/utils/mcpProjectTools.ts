import { createHash } from 'node:crypto'

import type { McpToolDefinitionListItem } from '@nuxtjs/mcp-toolkit/server'
import { ConvexHttpClient } from 'convex/browser'
import { createError } from 'h3'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import type { Doc, Id, TableNames } from '../../convex/_generated/dataModel'
import { createProjectInputSchema } from '../../shared/inputSchemas'

const listProjectsInputSchema = z.object({})
const previewDeleteProjectInputSchema = z.object({
  projectId: z.string({ error: 'Project id is required' }).trim().min(1, 'Project id is required'),
})
const requestDeleteProjectApprovalInputSchema = z.object({
  projectId: z.string({ error: 'Project id is required' }).trim().min(1, 'Project id is required'),
  reason: z.string().trim().optional(),
  requestKey: z.string().trim().optional(),
})
const deleteProjectInputSchema = z.object({
  projectId: z.string({ error: 'Project id is required' }).trim().min(1, 'Project id is required'),
  approvalId: z
    .string({ error: 'Approval id is required' })
    .trim()
    .min(1, 'Approval id is required'),
})
const getApprovalInputSchema = z.object({
  approvalRequestId: z
    .string({ error: 'Approval request id is required' })
    .trim()
    .min(1, 'Approval request id is required'),
})

type ProjectToolClient = Pick<ConvexHttpClient, 'query' | 'mutation'>
type RequestExtra = {
  requestInfo?: {
    headers?: Headers | Record<string, string | string[] | undefined>
  }
}
type ProjectToolArgs = {
  getClient: () => ProjectToolClient
  getServerSecret: () => string
}
type ProjectToolResponse = {
  content: Array<{ type: 'text'; text: string }>
}
type ProjectDto = {
  id: string
  organizationId: string
  name: string
  createdBy: Doc<'projects'>['createdBy']
  createdAt: number
}
type BearerTokenParseResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'missing' | 'malformed' }
type HeaderReadResult = { ok: true; value: string | undefined } | { ok: false; reason: 'ambiguous' }

export function hashBearerSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

function readBearerToken(value: string | undefined): BearerTokenParseResult {
  const parts = value?.trim().split(/\s+/) ?? []
  const [scheme, token] = parts
  if (parts.length === 2 && scheme?.toLowerCase() === 'bearer' && token) {
    return { ok: true, token }
  }

  return { ok: false, reason: value ? 'malformed' : 'missing' }
}

function getExtraHeader(extra: RequestExtra, name: string): HeaderReadResult {
  const headers = extra.requestInfo?.headers
  if (!headers) return { ok: true, value: undefined }

  if (headers instanceof Headers) {
    return { ok: true, value: headers.get(name) ?? undefined }
  }

  const headerEntry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )
  const value = headerEntry?.[1]
  if (Array.isArray(value)) {
    return { ok: false, reason: 'ambiguous' }
  }

  return { ok: true, value }
}

function logToolBoundaryDenial(event: {
  reason: 'missing_bearer' | 'malformed_bearer' | 'invalid_input'
  toolName: string
  detail?: string
}) {
  console.warn('[mcp-agent] MCP tool request denied at boundary', event)
}

function parseToolInput<TOutput>(
  toolName: string,
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput {
  const result = schema.safeParse(input)
  if (!result.success) {
    logToolBoundaryDenial({
      reason: 'invalid_input',
      toolName,
      detail: result.error.issues[0]?.message ?? 'Invalid tool input',
    })
    throw createError({
      statusCode: 400,
      statusMessage: result.error.issues[0]?.message ?? 'Invalid tool input',
    })
  }

  return result.data
}

function textToolContent(text: string): ProjectToolResponse {
  return {
    content: [{ type: 'text', text }],
  }
}

function jsonToolContent(value: unknown): ProjectToolResponse {
  return textToolContent(JSON.stringify(value, null, 2))
}

function requireBearerToken(extra: RequestExtra, toolName: string) {
  const authorization = getExtraHeader(extra, 'authorization')
  if (!authorization.ok) {
    logToolBoundaryDenial({
      reason: 'malformed_bearer',
      toolName,
    })
    throw createError({ statusCode: 401, statusMessage: 'Bearer token required' })
  }

  const parsed = readBearerToken(authorization.value)
  if (!parsed.ok) {
    logToolBoundaryDenial({
      reason: parsed.reason === 'missing' ? 'missing_bearer' : 'malformed_bearer',
      toolName,
    })
    throw createError({ statusCode: 401, statusMessage: 'Bearer token required' })
  }

  return parsed.token
}

function requireServerSecret(args: ProjectToolArgs) {
  const serverSecret = args.getServerSecret()
  if (!serverSecret) {
    throw createError({ statusCode: 500, statusMessage: 'MCP_SERVER_SECRET is required' })
  }

  return serverSecret
}

function toConvexId<TableName extends TableNames>(value: string) {
  return value as Id<TableName>
}

export function createProjectToolClient(configuredConvexUrl?: string) {
  const convexUrl =
    configuredConvexUrl ??
    process.env.NUXT_PUBLIC_CONVEX_URL ??
    process.env.VITE_CONVEX_URL ??
    process.env.CONVEX_URL
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
    description: 'List projects for the authenticated service actor organization',
    inputSchema: listProjectsInputSchema.shape,
    annotations: {
      readOnlyHint: true,
    },
    handler: async (input, extra) => {
      parseToolInput('projects.list', listProjectsInputSchema, input)
      const bearerToken = requireBearerToken(extra, 'projects.list')
      const client = args.getClient()
      const projects = await client.query(api.projects.listForServiceActor, {
        serverSecret: requireServerSecret(args),
        bearerToken,
      })

      return jsonToolContent(projects.map(toProjectDto))
    },
  }
}

export function createCreateProjectTool(args: ProjectToolArgs): McpToolDefinitionListItem {
  return {
    name: 'projects.create',
    description: 'Create a project in the authenticated service actor organization',
    inputSchema: createProjectInputSchema.shape,
    annotations: {
      destructiveHint: false,
    },
    handler: async (input, extra) => {
      const parsedInput = parseToolInput('projects.create', createProjectInputSchema, input)
      const bearerToken = requireBearerToken(extra, 'projects.create')
      const client = args.getClient()
      const projectId = await client.mutation(api.projects.createFromServiceActor, {
        serverSecret: requireServerSecret(args),
        bearerToken,
        name: parsedInput.name,
      })

      return textToolContent(`Created project ${projectId}`)
    },
  }
}

export function createPreviewCreateProjectTool(args: ProjectToolArgs): McpToolDefinitionListItem {
  return {
    name: 'projects.create.preview',
    description:
      'Preview normalized project creation input for the authenticated service actor organization',
    inputSchema: createProjectInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: async (input, extra) => {
      const parsedInput = parseToolInput('projects.create.preview', createProjectInputSchema, input)
      const bearerToken = requireBearerToken(extra, 'projects.create.preview')
      const client = args.getClient()
      const preview = await client.query(api.projects.previewCreateFromServiceActor, {
        serverSecret: requireServerSecret(args),
        bearerToken,
        name: parsedInput.name,
      })

      return jsonToolContent(preview)
    },
  }
}

export function createPreviewDeleteProjectTool(args: ProjectToolArgs): McpToolDefinitionListItem {
  return {
    name: 'projects.delete.preview',
    description:
      'Preview project deletion effects for the authenticated service actor organization',
    inputSchema: previewDeleteProjectInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: async (input, extra) => {
      const parsedInput = parseToolInput(
        'projects.delete.preview',
        previewDeleteProjectInputSchema,
        input,
      )
      const bearerToken = requireBearerToken(extra, 'projects.delete.preview')
      const client = args.getClient()
      const preview = await client.query(api.projects.previewDeleteFromServiceActor, {
        serverSecret: requireServerSecret(args),
        bearerToken,
        projectId: toConvexId<'projects'>(parsedInput.projectId),
      })

      return jsonToolContent(preview)
    },
  }
}

export function createRequestDeleteProjectApprovalTool(
  args: ProjectToolArgs,
): McpToolDefinitionListItem {
  return {
    name: 'projects.delete.requestApproval',
    description: 'Request app-owned human approval before deleting an organization project',
    inputSchema: requestDeleteProjectApprovalInputSchema.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
    handler: async (input, extra) => {
      const parsedInput = parseToolInput(
        'projects.delete.requestApproval',
        requestDeleteProjectApprovalInputSchema,
        input,
      )
      const bearerToken = requireBearerToken(extra, 'projects.delete.requestApproval')
      const client = args.getClient()
      const request = await client.mutation(api.projects.requestDeleteApprovalFromServiceActor, {
        serverSecret: requireServerSecret(args),
        bearerToken,
        projectId: toConvexId<'projects'>(parsedInput.projectId),
        reason: parsedInput.reason,
        requestKey: parsedInput.requestKey,
      })

      return jsonToolContent(request)
    },
  }
}

export function createExecuteDeleteProjectTool(args: ProjectToolArgs): McpToolDefinitionListItem {
  return {
    name: 'projects.delete.execute',
    description: 'Execute project deletion after an app-owned human approval was granted',
    inputSchema: deleteProjectInputSchema.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
    handler: async (input, extra) => {
      const parsedInput = parseToolInput('projects.delete.execute', deleteProjectInputSchema, input)
      const bearerToken = requireBearerToken(extra, 'projects.delete.execute')
      const client = args.getClient()
      const result = await client.mutation(api.projects.deleteWithApproval, {
        serverSecret: requireServerSecret(args),
        bearerToken,
        projectId: toConvexId<'projects'>(parsedInput.projectId),
        approvalId: toConvexId<'approvals'>(parsedInput.approvalId),
      })

      return jsonToolContent(result)
    },
  }
}

export function createGetApprovalTool(args: ProjectToolArgs): McpToolDefinitionListItem {
  return {
    name: 'approvals.get',
    description: 'Read an app-owned approval request status for the authenticated service actor',
    inputSchema: getApprovalInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    handler: async (input, extra) => {
      const parsedInput = parseToolInput('approvals.get', getApprovalInputSchema, input)
      const bearerToken = requireBearerToken(extra, 'approvals.get')
      const client = args.getClient()
      const approval = await client.query(api.approvals.getForServiceActor, {
        serverSecret: requireServerSecret(args),
        bearerToken,
        approvalRequestId: toConvexId<'approvals'>(parsedInput.approvalRequestId),
      })

      return jsonToolContent(approval)
    },
  }
}

export function createProjectMcpTools(args: ProjectToolArgs) {
  return {
    listProjects: createListProjectsTool(args),
    previewCreateProject: createPreviewCreateProjectTool(args),
    createProject: createCreateProjectTool(args),
    previewDeleteProject: createPreviewDeleteProjectTool(args),
    requestDeleteProjectApproval: createRequestDeleteProjectApprovalTool(args),
    executeDeleteProject: createExecuteDeleteProjectTool(args),
    getApproval: createGetApprovalTool(args),
  }
}
