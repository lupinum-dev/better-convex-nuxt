import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { TrellisCliInventory } from '../../src/cli/lib/inventory'
import { collectPermissionInventoryFindings } from '../../src/cli/lib/permission-metadata'
import type { ProjectInspection } from '../../src/cli/lib/project'

function createFixture() {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'trellis-permission-metadata-'))
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

function inventory(cwd: string): TrellisCliInventory {
  return {
    schemaVersion: 1,
    cwd,
    package: {
      hasPackageJson: false,
      hasTrellisDependency: false,
      hasNuxtDependency: false,
      hasConvexDependency: false,
    },
    layers: {
      core: false,
      auth: false,
      workspace: false,
      mcp: false,
      bridge: false,
    },
    bridge: {
      enabled: false,
      packages: [],
    },
    files: {
      nuxtConfig: null,
      convexHttp: null,
      convexAuth: null,
      appInventory: null,
    },
    surfaces: {
      identityForwarding: false,
      permissions: true,
      destructiveOperations: 0,
      unsafeEntrypoints: 0,
      crossTenantEscapes: 0,
      mcpTools: 0,
      customMcpToolsWithAppWrites: 0,
      forwardedCallerMisuses: 0,
      identityForwardingPublicExposures: 0,
      destructiveMcpToolMisuses: 0,
      mcpRateLimit: false,
      mcpRateLimitStore: 'none',
    },
    forwarding: {
      expected: false,
      publicExposures: [],
      forwardedCallerMisuses: [],
    },
    mcp: {
      toolCount: 0,
      destructiveToolMisuses: [],
      customAppWriteMisuses: [],
      rateLimit: {
        expected: false,
        store: 'none',
      },
    },
    backend: {
      unsafeEntrypoints: [],
      crossTenantEscapes: [],
      destructiveOperations: [],
    },
    appInventory: {
      file: null,
      detected: false,
      featureBindings: [],
      warnings: [],
    },
    features: [],
    permissions: {
      definitions: [
        {
          exportName: 'taskRead',
          file: 'convex/auth/permissions.ts',
          source: {
            path: 'convex/auth/permissions.ts',
            line: 3,
          },
          key: 'task.read',
          roles: ['owner'],
          projected: true,
        },
        {
          exportName: 'taskCreate',
          file: 'convex/auth/permissions.ts',
          source: {
            path: 'convex/auth/permissions.ts',
            line: 8,
          },
          key: 'task.create',
          roles: ['owner'],
          projected: true,
        },
      ],
      inventories: [
        {
          exportName: 'appPermissions',
          file: 'convex/auth/permissions.ts',
          source: {
            path: 'convex/auth/permissions.ts',
            line: 12,
          },
          permissions: ['taskRead'],
          unknown: ['missingPermission'],
        },
      ],
    },
    publicSurface: {
      operations: [],
      projections: [],
      tools: [],
    },
    findings: [],
  }
}

describe('permission metadata doctor findings', () => {
  it('warns on orphaned definitions, unused projected permissions, and inventory drift', () => {
    const cwd = createFixture()

    const findings = collectPermissionInventoryFindings(
      inventory(cwd),
      projectInspection(cwd, [
        {
          path: resolve(cwd, 'pages/index.vue'),
          text: '<script setup lang="ts">const canRead = can(taskRead)</script>',
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
    expect(
      findings.find((finding) => finding.id === 'permissions-definition-orphan:taskCreate')
        ?.sources,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'inventory',
          inventoryPath: 'permissions.definitions',
          locations: [{ path: 'convex/auth/permissions.ts', line: 8 }],
        }),
      ]),
    )
    expect(
      findings.find(
        (finding) =>
          finding.id === 'permissions-inventory-unknown:appPermissions:missingPermission',
      )?.sources,
    ).toEqual([
      expect.objectContaining({
        kind: 'inventory',
        inventoryPath: 'permissions.inventories',
        locations: [{ path: 'convex/auth/permissions.ts', line: 12 }],
      }),
    ])
  })
})
