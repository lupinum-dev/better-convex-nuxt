export type KanbanCapabilityRole = 'owner' | 'admin' | 'member' | 'viewer'

export type KanbanCapabilities = {
  listWorkspaces: boolean
  listBoards: boolean
  createCard: boolean
  moveCard: boolean
  archiveBoard: boolean
}

export function deriveKanbanCapabilities(roles: KanbanCapabilityRole[]): KanbanCapabilities {
  return {
    listWorkspaces: roles.length > 0,
    listBoards: roles.length > 0,
    createCard: roles.some((role) => ['owner', 'admin', 'member'].includes(role)),
    moveCard: roles.some((role) => ['owner', 'admin', 'member'].includes(role)),
    archiveBoard: roles.some((role) => ['owner', 'admin'].includes(role)),
  }
}
