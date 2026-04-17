import type { deriveKanbanCapabilities } from './permissions'

export type { KanbanRole as KanbanCapabilityRole } from './permissions'
export { deriveKanbanCapabilities } from './permissions'

export type KanbanCapabilities = ReturnType<typeof deriveKanbanCapabilities>
