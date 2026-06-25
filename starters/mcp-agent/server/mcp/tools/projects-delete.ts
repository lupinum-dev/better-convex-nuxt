import { useRuntimeConfig } from '#imports'

import { createDeleteProjectTool, createProjectToolClient } from '../../utils/mcpProjectTools'

const deleteProject = createDeleteProjectTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default deleteProject
