import type { AppIdentity } from '../../auth/app-identity'
import type { Role } from '../../auth/caller'

export function canIssueKeyRole(appIdentity: AppIdentity, role: Role): boolean {
  if (!appIdentity) return false
  if (appIdentity.role === 'owner') return ['owner', 'admin', 'member', 'viewer'].includes(role)
  if (appIdentity.role === 'admin') return ['member', 'viewer'].includes(role)
  return false
}
