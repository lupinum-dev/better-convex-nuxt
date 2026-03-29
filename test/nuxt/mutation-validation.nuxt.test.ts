import { describe, expect, it, vi } from 'vitest'
import { v } from 'convex/values'

import { useConvexMutation } from '../../src/runtime/composables/useConvexMutation'
import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { ConvexCallError } from '../../src/runtime/utils/call-result'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

function hasStringName(value: unknown): value is { name: string } {
  return typeof value === 'object'
    && value !== null
    && 'name' in value
    && typeof (value as { name?: unknown }).name === 'string'
}

describe('mutation pre-validation (Nuxt runtime)', () => {
  it('passes validation and executes mutation normally', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:validated-ok')
    convex.setMutationHandler('testing:validated-ok', async (args) => ({ saved: true, ...(args as Record<string, unknown>) }))

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, {
        validate: v.object({ title: v.string() }),
      }),
      { convex },
    )

    await expect(result({ title: 'Hello' } as never)).resolves.toEqual({ saved: true, title: 'Hello' })
    expect(result.status.value).toBe('success')
  })

  it('rejects invalid args without making a network call', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:validated-fail')
    const handler = vi.fn(async () => ({ ok: true }))
    convex.setMutationHandler('testing:validated-fail', handler)

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, {
        validate: v.object({ title: v.string() }),
      }),
      { convex },
    )

    await expect(result({ title: 42 } as never)).rejects.toThrow('Validation failed')
    expect(handler).not.toHaveBeenCalled()
    expect(result.status.value).toBe('error')
  })

  it('sets error.value to ConvexCallError with category validation', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:val-error-shape')
    convex.setMutationHandler('testing:val-error-shape', async () => ({ ok: true }))

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, {
        validate: v.object({ name: v.string(), age: v.float64() }),
      }),
      { convex },
    )

    await expect(result({} as never)).rejects.toThrow()

    const err = result.error.value
    expect(err).toBeInstanceOf(ConvexCallError)
    expect((err as ConvexCallError).category).toBe('validation')
    expect((err as ConvexCallError).code).toBe('VALIDATION_ERROR')
    expect((err as ConvexCallError).functionPath).toBe('testing:val-error-shape')
  })

  it('collects multiple validation issues in one pass', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:multi-issue')
    convex.setMutationHandler('testing:multi-issue', async () => ({ ok: true }))

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, {
        validate: v.object({
          name: v.string(),
          email: v.string(),
          age: v.float64(),
        }),
      }),
      { convex },
    )

    await expect(result({} as never)).rejects.toThrow()

    const err = result.error.value as ConvexCallError
    expect(err.issues).toHaveLength(3)
    expect(err.issues!.map(i => i.path)).toEqual(['name', 'email', 'age'])
  })

  it('fires onError callback on validation failure', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:val-callback')
    convex.setMutationHandler('testing:val-callback', async () => ({ ok: true }))
    const onError = vi.fn()

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, {
        validate: v.object({ name: v.string() }),
        onError,
      }),
      { convex },
    )

    const badArgs = { name: 123 }
    await expect(result(badArgs as never)).rejects.toThrow()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(ConvexCallError)
    expect(onError.mock.calls[0]![1]).toEqual(badArgs)
  })

  it('transitions status: idle → pending → error', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:val-status')
    convex.setMutationHandler('testing:val-status', async () => ({ ok: true }))

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, {
        validate: v.object({ name: v.string() }),
      }),
      { convex },
    )

    expect(result.status.value).toBe('idle')
    await expect(result({} as never)).rejects.toThrow()
    expect(result.status.value).toBe('error')
  })

  it('accepts a Standard Schema object as validate option', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('testing:val-ss')
    convex.setMutationHandler('testing:val-ss', async (args) => args)

    // Build a Standard Schema manually (simulates Zod/Valibot)
    const ssSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) => {
          if (hasStringName(value)) {
            return { value }
          }
          return { issues: [{ message: 'Expected object with string name', path: ['name'] }] }
        },
      },
    }

    const { result } = await captureInNuxt(
      () => useConvexMutation(mutation, { validate: ssSchema }),
      { convex },
    )

    // Valid: passes through
    await expect(result({ name: 'Alice' } as never)).resolves.toEqual({ name: 'Alice' })

    // Invalid: fails with validation error
    await expect(result({ name: 42 } as never)).rejects.toThrow('Validation failed')
    expect((result.error.value as ConvexCallError).category).toBe('validation')
  })
})

describe('action pre-validation (Nuxt runtime)', () => {
  it('rejects invalid args on action without network call', async () => {
    const convex = new MockConvexClient()
    const action = mockFnRef<'action'>('testing:val-action')
    const handler = vi.fn(async () => ({ ok: true }))
    convex.setActionHandler('testing:val-action', handler)

    const { result } = await captureInNuxt(
      () => useConvexAction(action, {
        validate: v.object({ url: v.string() }),
      }),
      { convex },
    )

    await expect(result({ url: 123 } as never)).rejects.toThrow('Validation failed')
    expect(handler).not.toHaveBeenCalled()
    expect(result.status.value).toBe('error')
    expect((result.error.value as ConvexCallError).category).toBe('validation')
  })
})
