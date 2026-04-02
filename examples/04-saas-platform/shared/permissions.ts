export const saasPermissionKeys = {
  projectCreate: 'project.create',
  projectRead: 'project.read',
  projectArchive: 'project.archive',
  projectExport: 'project.export',
  taskCreate: 'task.create',
  taskAssign: 'task.assign',
  commentCreate: 'comment.create',
  workspaceMembers: 'workspace.members',
  workspaceAudit: 'workspace.audit',
  workspaceExports: 'workspace.exports',
} as const

export type SaasPermissionKey = (typeof saasPermissionKeys)[keyof typeof saasPermissionKeys]

export type SaasPermissionMap = Record<SaasPermissionKey, boolean>
