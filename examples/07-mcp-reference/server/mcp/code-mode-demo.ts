import createRunbook from './tools/runbooks/create'
import deleteRunbook from './tools/runbooks/delete'
import listWorkspaceRunbooks from './tools/runbooks/list-workspace'
import searchPublicRunbooks from './tools/runbooks/search-public'
import updateRunbook from './tools/runbooks/update'
import workspaceOverview from './tools/runbooks/workspace-overview'

export default defineMcpHandler({
  name: 'runbook-agent',
  route: '/mcp/runbook-agent',
  browserRedirect: '/',
  experimental_codeMode: true,
  tools: [
    searchPublicRunbooks,
    listWorkspaceRunbooks,
    workspaceOverview,
    createRunbook,
    updateRunbook,
    deleteRunbook,
  ] as any,
})
