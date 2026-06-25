import { useRuntimeConfig } from '#imports'

import {
  createProjectToolClient,
  createRequestDeleteProjectApprovalTool,
} from '../../utils/mcpProjectTools'

const requestDeleteProjectApproval = createRequestDeleteProjectApprovalTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default requestDeleteProjectApproval
