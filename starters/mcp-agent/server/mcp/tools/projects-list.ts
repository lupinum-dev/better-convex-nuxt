import { useRuntimeConfig } from '#imports'

import { createListProjectsTool, createProjectToolClient } from '../../utils/mcpProjectTools'

const listProjects = createListProjectsTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default listProjects
