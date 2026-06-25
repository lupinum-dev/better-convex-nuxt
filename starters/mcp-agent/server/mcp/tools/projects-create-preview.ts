import { useRuntimeConfig } from '#imports'

import {
  createPreviewCreateProjectTool,
  createProjectToolClient,
} from '../../utils/mcpProjectTools'

const previewCreateProject = createPreviewCreateProjectTool({
  getClient: () => {
    const config = useRuntimeConfig()
    const convex = config.public.convex as { url?: string } | undefined
    return createProjectToolClient(convex?.url)
  },
  getServerSecret: () => useRuntimeConfig().mcpServerSecret,
})

export default previewCreateProject
