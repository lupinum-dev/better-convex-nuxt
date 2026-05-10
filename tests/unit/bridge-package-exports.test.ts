import { beforeAll, describe, expect, it } from 'vitest'

describe('bridge package exports', () => {
  let bridgeApi: typeof import('@lupinum/trellis-bridge')
  let componentApi: typeof import('../../packages/trellis-bridge/src/component')

  beforeAll(async () => {
    bridgeApi = await import('@lupinum/trellis-bridge')
    componentApi = await import('../../packages/trellis-bridge/src/component')
  })

  it('owns manifest APIs at the package root', () => {
    expect(bridgeApi).toHaveProperty('defineComponentBridgeManifest')
    expect(bridgeApi).toHaveProperty('renderComponentBridgeFile')
    expect(bridgeApi).toHaveProperty('renderComponentBridgeFiles')
    expect(bridgeApi).toHaveProperty('renderComponentBridgeManagedEdits')
    expect(bridgeApi).toHaveProperty('loadManifestFromPackage')
    expect(bridgeApi).toHaveProperty('checkBridgeDrift')
    expect(bridgeApi).toHaveProperty('discoverInstalledBridgeComponents')
  })

  it('keeps Convex component runtime APIs on a runtime-safe subpath', () => {
    expect(componentApi).toHaveProperty('createComponentBridge')
    expect(componentApi).toHaveProperty('callComponentBridgeRegistrar')
  })
})
