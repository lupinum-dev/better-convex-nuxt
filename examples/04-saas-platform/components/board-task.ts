import type { FunctionReturnType } from 'convex/server'

import { api } from '../convex/_generated/api'

export type BoardTask = FunctionReturnType<typeof api.domain.tasks.listByProject>[number]
