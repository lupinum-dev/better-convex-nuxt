import { describe, expect, it } from 'vitest'

import { convexTestConfig } from '../../src/runtime/testing'

describe('convexTestConfig', () => {
  it('defaults vitest to the convex-friendly edge runtime setup', () => {
    const config = convexTestConfig()

    expect(config.test?.environment).toBe('edge-runtime')
    expect(config.test?.server?.deps?.inline).toEqual(expect.arrayContaining([expect.any(RegExp)]))
    expect(config.esbuild?.tsconfigRaw).toMatchObject({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        types: expect.arrayContaining(['node', 'vite/client']),
      },
    })
    expect(config.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'trellis-generated-server-mock',
        }),
      ]),
    )
  })
})
