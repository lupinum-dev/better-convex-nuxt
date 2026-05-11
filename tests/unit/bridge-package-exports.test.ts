import { beforeAll, describe, expect, it } from 'vitest'

describe('bridge package exports', () => {
  let bridgeApi: typeof import('@lupinum/trellis-bridge')
  let componentApi: typeof import('../../packages/trellis-bridge/src/component')
  let manifestApi: typeof import('../../packages/trellis-bridge/src/manifest')

  beforeAll(async () => {
    bridgeApi = await import('@lupinum/trellis-bridge')
    componentApi = await import('../../packages/trellis-bridge/src/component')
    manifestApi = await import('../../packages/trellis-bridge/src/manifest')
  })

  it('keeps the package root focused on installed bridge drift checks', () => {
    expect(bridgeApi).toHaveProperty('loadManifestFromPackage')
    expect(bridgeApi).toHaveProperty('checkBridgeDrift')
    expect(bridgeApi).toHaveProperty('discoverInstalledBridgeComponents')
    expect(bridgeApi).not.toHaveProperty('defineComponentBridgeManifest')
    expect(bridgeApi).not.toHaveProperty('renderComponentBridgeFile')
  })

  it('keeps package-author manifest helpers on the manifest subpath', () => {
    expect(manifestApi).toHaveProperty('defineComponentBridgeManifest')
    expect(manifestApi).toHaveProperty('renderComponentBridgeFile')
    expect(manifestApi).toHaveProperty('renderComponentBridgeFiles')
    expect(manifestApi).toHaveProperty('renderComponentBridgeManagedEdits')
  })

  it('keeps Convex component runtime APIs on a runtime-safe subpath', () => {
    expect(componentApi).toHaveProperty('createComponentBridge')
    expect(componentApi).toHaveProperty('callComponentBridgeRegistrar')
  })
})
