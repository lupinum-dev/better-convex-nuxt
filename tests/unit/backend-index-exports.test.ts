import { beforeAll, describe, expect, it } from 'vitest'

describe('backend entrypoint exports', () => {
  let backendApi: typeof import('../../src/runtime/backend/index')

  beforeAll(async () => {
    backendApi = await import('../../src/runtime/backend/index')
  })

  it('exports the canonical backend builder and operation APIs', () => {
    expect(backendApi).toHaveProperty('defineTrellis')
    expect(backendApi).toHaveProperty('defineOperation')
    expect(backendApi).toHaveProperty('defineCaller')
    expect(backendApi).toHaveProperty('getIdentityForwarding')
    expect(backendApi).toHaveProperty('trellisBackendLaneMetadataKey')
  })

  it('does not expose bridge package-author APIs', () => {
    expect(backendApi).not.toHaveProperty('createComponentBridge')
    expect(backendApi).not.toHaveProperty('callComponentBridgeRegistrar')
    expect(backendApi).not.toHaveProperty('defineComponentBridgeManifest')
    expect(backendApi).not.toHaveProperty('renderComponentBridgeFiles')
  })
})
