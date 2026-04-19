import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectPermissionMetadataFindings } from '../../src/cli/lib/permission-metadata'
import type { ProjectInspection } from '../../src/cli/lib/project'

function createFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'trellis-permission-metadata-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return rootDir
}

function projectInspection(
  cwd: string,
  sourceFiles: Array<{ path: string; text: string }>,
): ProjectInspection {
  return {
    cwd,
    packageJsonPath: null,
    packageJson: null,
    dependencyNames: new Set<string>(),
    nuxtConfigPath: null,
    nuxtConfigText: '',
    envSources: [],
    sourceFiles,
  }
}

describe('permission metadata doctor findings', () => {
  it('warns on orphaned definitions, unused projected permissions, and inventory drift', () => {
    const cwd = createFixture({
      '.nuxt/trellis/permissions.json': JSON.stringify(
        {
          generatedAt: '2026-04-19T00:00:00.000Z',
          include: ['convex/auth/permissions.ts'],
          permissions: [
            {
              exportName: 'taskRead',
              file: 'convex/auth/permissions.ts',
              line: 3,
              key: 'task.read',
              roles: ['owner'],
              projected: true,
            },
            {
              exportName: 'taskCreate',
              file: 'convex/auth/permissions.ts',
              line: 8,
              key: 'task.create',
              roles: ['owner'],
              projected: true,
            },
          ],
          inventories: [
            {
              exportName: 'appPermissions',
              file: 'convex/auth/permissions.ts',
              line: 12,
              entries: [
                { kind: 'permission', name: 'taskRead' },
                { kind: 'permission', name: 'missingPermission' },
              ],
              permissions: ['taskRead'],
              unknown: ['missingPermission'],
            },
          ],
        },
        null,
        2,
      ),
      'pages/index.vue': '<script setup lang="ts">const canRead = allows(taskRead)</script>',
    })

    const findings = collectPermissionMetadataFindings(
      projectInspection(cwd, [
        {
          path: resolve(cwd, 'pages/index.vue'),
          text: '<script setup lang="ts">const canRead = allows(taskRead)</script>',
        },
      ]),
    )

    expect(findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        'permissions-definition-orphan:taskCreate',
        'permissions-unused-projection:taskCreate',
        'permissions-inventory-unknown:appPermissions:missingPermission',
      ]),
    )
    expect(findings.every((finding) => finding.status === 'warn')).toBe(true)
  })
})
