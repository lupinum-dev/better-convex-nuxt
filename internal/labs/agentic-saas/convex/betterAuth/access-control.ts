import { createAccessControl } from 'better-auth/plugins'

export const projectAccessControl = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'delete'],
})

export const ownerRole = projectAccessControl.newRole({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'delete'],
})

export const memberRole = projectAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  project: ['create', 'read'],
})

export const viewerRole = projectAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  project: ['read'],
})

export const organizationPermissionOptions = {
  ac: projectAccessControl,
  roles: {
    owner: ownerRole,
    admin: ownerRole,
    member: memberRole,
    viewer: viewerRole,
  },
}

export type ProjectPermission = 'create' | 'read' | 'delete'

export function roleAllowsProjectPermissions(
  role: string,
  permissions: ProjectPermission[],
): boolean {
  const roles = organizationPermissionOptions.roles
  const definition = roles[role as keyof typeof roles]
  return definition?.authorize({ project: permissions }).success === true
}
