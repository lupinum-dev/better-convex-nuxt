export const teamWorkspacePermissionKeys = {
  todoRead: 'todo.read',
  todoCreate: 'todo.create',
} as const

export type TeamWorkspacePermissionKey =
  (typeof teamWorkspacePermissionKeys)[keyof typeof teamWorkspacePermissionKeys]

export type TeamWorkspacePermissionMap = Record<TeamWorkspacePermissionKey, boolean>
