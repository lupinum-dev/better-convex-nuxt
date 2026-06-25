import { useRuntimeConfig } from '#imports'

import {
  createPreviewDeleteProjectTool,
  createProjectToolClient,
} from '../../utils/mcpProjectTools'

const previewDeleteProject = createPreviewDeleteProjectTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default previewDeleteProject
