import {
  loadTenantResource as _loadTenantResource,
  ensureTenant as _ensureTenant,
  requireAuth,
  requireRecord,
} from '@lupinum/trellis/auth'

export { requireAuth, requireRecord }

// Test harness uses organizationId instead of workspaceId
export function ensureTenant<T extends { organizationId?: string | null }>(
  actor: { tenantId?: string | null },
  resource: T,
  label = 'Resource',
): T {
  return _ensureTenant(actor, resource, label, 'organizationId')
}

export function loadResource<T extends { organizationId?: string | null }>(
  actor: { tenantId?: string | null },
  doc: T | null | undefined,
  label = 'Resource',
): T {
  return _loadTenantResource(actor, doc, label, 'organizationId')
}
