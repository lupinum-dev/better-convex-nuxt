import type { McpToolDefinitionListItem } from '@nuxtjs/mcp-toolkit/server'

import createRunbook from './tools/runbooks/create'
import deleteRunbook from './tools/runbooks/delete'
import listWorkspaceRunbooks from './tools/runbooks/list-workspace'
import searchPublicRunbooks from './tools/runbooks/search-public'
import updateRunbook from './tools/runbooks/update'
import workspaceOverview from './tools/runbooks/workspace-overview'

function toToolListItem(tool: unknown): McpToolDefinitionListItem {
  return tool as McpToolDefinitionListItem
}

export default defineMcpHandler({
  name: 'runbook-agent',
  route: '/mcp/runbook-agent',
  browserRedirect: '/',
  experimental_codeMode: true,
  tools: [
    toToolListItem(searchPublicRunbooks),
    toToolListItem(listWorkspaceRunbooks),
    toToolListItem(workspaceOverview),
    toToolListItem(createRunbook),
    toToolListItem(updateRunbook),
    toToolListItem(deleteRunbook),
  ],
})
