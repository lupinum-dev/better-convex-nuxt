import { useRuntimeConfig } from '#imports'

import {
  createExecuteDeleteProjectTool,
  createProjectToolClient,
} from '../../utils/mcpProjectTools'

const executeDeleteProject = createExecuteDeleteProjectTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default executeDeleteProject
