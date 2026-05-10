import { resolve } from 'node:path'

import type { DoctorFinding } from './findings.js'
import { findingInventorySource } from './findings.js'
import type { TrellisCliInventory } from './inventory.js'
import type { ProjectInspection } from './project.js'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isRuntimeSource(path: string): boolean {
  if (/[/\\](?:test|tests)[/\\]/.test(path)) return false
  if (path.endsWith('.md')) return false
  return /\.(?:vue|[cm]?[jt]s|tsx?)$/.test(path)
}

function buildPermissionUsagePattern(exportName: string): RegExp {
  const escaped = escapeRegExp(exportName)
  return new RegExp(
    [
      `\\bguard\\s*:\\s*${escaped}\\b`,
      `\\bpermission\\s*:\\s*${escaped}\\b`,
      `\\ballows\\s*\\(\\s*${escaped}\\b`,
      `\\buseAuthGuard\\s*\\(\\s*\\{[\\s\\S]{0,240}?\\bpermission\\s*:\\s*${escaped}\\b`,
    ].join('|'),
  )
}

export function collectPermissionInventoryFindings(
  inventory: TrellisCliInventory,
  project: ProjectInspection,
): DoctorFinding[] {
  const findings: DoctorFinding[] = []
  const includedPermissions = new Set(
    inventory.permissions.inventories.flatMap((entry) => entry.permissions),
  )

  for (const permission of inventory.permissions.definitions) {
    if (!includedPermissions.has(permission.exportName)) {
      findings.push({
        id: `permissions-definition-orphan:${permission.exportName}`,
        category: 'core',
        title: 'Permission inventory membership',
        status: 'warn',
        message: `Permission "${permission.exportName}" is defined in ${permission.file} but is not included in any exported permissions array.`,
        fixHint:
          'Add the permission handle to the app’s exported permissions inventory or delete the unused definition.',
        sources: [
          findingInventorySource('permissions.definitions', [permission.source]),
          findingInventorySource(
            'permissions.inventories',
            inventory.permissions.inventories.map((entry) => entry.source),
          ),
        ],
      })
    }

    if (!permission.projected) continue

    const usagePattern = buildPermissionUsagePattern(permission.exportName)
    const usedOutsideDefinitionFile = project.sourceFiles.some(
      (sourceFile) =>
        sourceFile.path !== resolve(project.cwd, permission.file) &&
        isRuntimeSource(sourceFile.path) &&
        usagePattern.test(sourceFile.text),
    )

    if (!usedOutsideDefinitionFile) {
      findings.push({
        id: `permissions-unused-projection:${permission.exportName}`,
        category: 'core',
        title: 'Projected permission usage',
        status: 'warn',
        message: `Projected permission "${permission.exportName}" is defined and exported but was not referenced by frontend, MCP, or handler code.`,
        fixHint:
          'Use the permission handle from handlers/UI/MCP, mark it `project: false`, or delete the unused definition.',
        sources: [findingInventorySource('permissions.definitions', [permission.source])],
      })
    }
  }

  for (const permissionInventory of inventory.permissions.inventories) {
    for (const unknown of permissionInventory.unknown) {
      findings.push({
        id: `permissions-inventory-unknown:${permissionInventory.exportName}:${unknown}`,
        category: 'core',
        title: 'Permission inventory drift',
        status: 'warn',
        message: `Permissions array "${permissionInventory.exportName}" in ${permissionInventory.file} references "${unknown}", but no exported definePermission() definition with that name was found in the file.`,
        fixHint:
          'Fix the inventory entry name or restore the missing exported permission definition.',
        sources: [findingInventorySource('permissions.inventories', [permissionInventory.source])],
      })
    }
  }

  return findings
}
