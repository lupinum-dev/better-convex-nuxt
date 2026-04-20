import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../../convex/_generated/api'

export type BoardTask = FunctionReturnType<typeof api.features.tasks.domain.listByProject>[number]
