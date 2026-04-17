import type { Doc } from '../convex/_generated/dataModel'

export type KanbanRole = Doc<'memberships'>['role']

export type KanbanPermissions = {
  readWorkspace: boolean
  manageMembers: boolean
  manageBoards: boolean
  manageBoardStructure: boolean
  writeCards: boolean
  archiveBoard: boolean
}

type PermissionKey = keyof KanbanPermissions

const ROLE_PERMISSIONS: Record<KanbanRole, KanbanPermissions> = {
  owner: {
    readWorkspace: true,
    manageMembers: true,
    manageBoards: true,
    manageBoardStructure: true,
    writeCards: true,
    archiveBoard: true,
  },
  admin: {
    readWorkspace: true,
    manageMembers: true,
    manageBoards: true,
    manageBoardStructure: true,
    writeCards: true,
    archiveBoard: true,
  },
  member: {
    readWorkspace: true,
    manageMembers: false,
    manageBoards: false,
    manageBoardStructure: false,
    writeCards: true,
    archiveBoard: false,
  },
  viewer: {
    readWorkspace: true,
    manageMembers: false,
    manageBoards: false,
    manageBoardStructure: false,
    writeCards: false,
    archiveBoard: false,
  },
}

const NO_PERMISSIONS: KanbanPermissions = {
  readWorkspace: false,
  manageMembers: false,
  manageBoards: false,
  manageBoardStructure: false,
  writeCards: false,
  archiveBoard: false,
}

export function getKanbanPermissions(role: KanbanRole | null): KanbanPermissions {
  return role ? ROLE_PERMISSIONS[role] : NO_PERMISSIONS
}

export function roleHasPermission(role: KanbanRole | null, permission: PermissionKey): boolean {
  return getKanbanPermissions(role)[permission]
}

export function deriveKanbanCapabilities(roles: KanbanRole[]) {
  return {
    listWorkspaces: roles.length > 0,
    listBoards: roles.some((role) => roleHasPermission(role, 'readWorkspace')),
    createCard: roles.some((role) => roleHasPermission(role, 'writeCards')),
    moveCard: roles.some((role) => roleHasPermission(role, 'writeCards')),
    archiveBoard: roles.some((role) => roleHasPermission(role, 'archiveBoard')),
  }
}
