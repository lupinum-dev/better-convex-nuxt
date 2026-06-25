import { useRuntimeConfig } from '#imports'

import { createCreateProjectTool, createProjectToolClient } from '../../utils/mcpProjectTools'

const createProject = createCreateProjectTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default createProject
