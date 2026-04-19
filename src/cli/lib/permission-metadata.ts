import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { PermissionCodegenMetadata } from '../../module-internals/permissions-codegen.js'
import type { DoctorFinding } from './findings.js'
import type { ProjectInspection } from './project.js'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function readPermissionMetadata(cwd: string): PermissionCodegenMetadata | null {
  const path = resolve(cwd, '.nuxt/trellis/permissions.json')
  if (!existsSync(path)) return null

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PermissionCodegenMetadata
  } catch {
    return null
  }
}

export function collectPermissionMetadataFindings(project: ProjectInspection): DoctorFinding[] {
  const metadata = readPermissionMetadata(project.cwd)
  if (!metadata) return []

  const findings: DoctorFinding[] = []
  const includedPermissions = new Set(metadata.inventories.flatMap((inventory) => inventory.permissions))
  const definitionsByName = new Map(
    metadata.permissions.map((permission) => [permission.exportName, permission] as const),
  )

  for (const permission of metadata.permissions) {
    if (!includedPermissions.has(permission.exportName)) {
      findings.push({
        id: `permissions-definition-orphan:${permission.exportName}`,
        category: 'core',
        title: 'Permission inventory membership',
        status: 'warn',
        message: `Permission "${permission.exportName}" is defined in ${permission.file} but is not included in any exported permissions array.`,
        fixHint:
          'Add the permission handle to the app’s exported permissions inventory or delete the unused definition.',
      })
    }

    if (!permission.projected) continue

    const usagePattern = new RegExp(`\\b${escapeRegExp(permission.exportName)}\\b`)
    const usedOutsideDefinitionFile = project.sourceFiles.some(
      (sourceFile) => sourceFile.path !== resolve(project.cwd, permission.file) && usagePattern.test(sourceFile.text),
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
      })
    }
  }

  for (const inventory of metadata.inventories) {
    for (const unknown of inventory.unknown) {
      findings.push({
        id: `permissions-inventory-unknown:${inventory.exportName}:${unknown}`,
        category: 'core',
        title: 'Permission inventory drift',
        status: 'warn',
        message: `Permissions array "${inventory.exportName}" in ${inventory.file} references "${unknown}", but no exported definePermission() definition with that name was found in the file.`,
        fixHint:
          'Fix the inventory entry name or restore the missing exported permission definition.',
      })
    }
  }

  return findings
}
