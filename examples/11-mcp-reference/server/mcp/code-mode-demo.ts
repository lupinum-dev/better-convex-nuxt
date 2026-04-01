import createRunbook from './tools/workspace/create-runbook'
import deleteRunbook from './tools/workspace/delete-runbook'
import listWorkspaceRunbooks from './tools/workspace/list-workspace-runbooks'
import searchPublicRunbooks from './tools/public/search-public-runbooks'
import updateRunbook from './tools/workspace/update-runbook'
import workspaceOverview from './tools/workspace/workspace-overview'

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
  ],
})
