import type { FunctionReference } from 'convex/server'

import { api } from './convex/_generated/api'

export const PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH = 'private/demo:systemOverview'

export const privateSystemOverview = (
  api as unknown as { 'private/demo': { systemOverview: FunctionReference<'query'> } }
)['private/demo'].systemOverview
