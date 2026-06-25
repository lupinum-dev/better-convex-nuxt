import { useRuntimeConfig } from '#imports'

import { createGetApprovalTool, createProjectToolClient } from '../../utils/mcpProjectTools'

const getApproval = createGetApprovalTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default getApproval
