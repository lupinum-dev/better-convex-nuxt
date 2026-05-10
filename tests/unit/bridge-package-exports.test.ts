import { beforeAll, describe, expect, it } from 'vitest'

describe('bridge package exports', () => {
  let bridgeApi: typeof import('@lupinum/trellis-bridge')

  beforeAll(async () => {
    bridgeApi = await import('@lupinum/trellis-bridge')
  })

  it('owns component bridge runtime and manifest APIs', () => {
    expect(bridgeApi).toHaveProperty('createComponentBridge')
    expect(bridgeApi).toHaveProperty('callComponentBridgeRegistrar')
    expect(bridgeApi).toHaveProperty('defineComponentBridgeManifest')
    expect(bridgeApi).toHaveProperty('renderComponentBridgeFile')
    expect(bridgeApi).toHaveProperty('renderComponentBridgeFiles')
    expect(bridgeApi).toHaveProperty('renderComponentBridgeManagedEdits')
    expect(bridgeApi).toHaveProperty('loadManifestFromPackage')
    expect(bridgeApi).toHaveProperty('checkBridgeDrift')
    expect(bridgeApi).toHaveProperty('discoverInstalledBridgeComponents')
  })
})
