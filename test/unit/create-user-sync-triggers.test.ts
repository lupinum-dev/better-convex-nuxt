import { describe, expect, it, vi } from 'vitest'

import { createUserSyncTriggers } from '../../src/runtime/server/createUserSyncTriggers'

describe('createUserSyncTriggers', () => {
  it('inserts, patches, and deletes synced user records', async () => {
    const insert = vi.fn(async () => 'new-id')
    const patch = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    const first = vi.fn()
    const withIndex = vi.fn(() => ({ first }))
    const query = vi.fn(() => ({ withIndex }))

    const ctx = {
      db: {
        insert,
        patch,
        delete: remove,
        query,
      },
    }

    const triggers = createUserSyncTriggers({
      table: 'users',
      index: 'by_auth_id',
      createDoc: ({ user, now }) => ({
        authId: user._id,
        email: user.email,
        createdAt: now,
        updatedAt: now,
      }),
      patchDoc: ({ user, previousUser, now }) => {
        if (user.email === previousUser.email) return null
        return { email: user.email, updatedAt: now }
      },
    })

    await triggers.user.onCreate(ctx, { _id: 'auth-1', email: 'a@example.com' })
    expect(insert).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({ authId: 'auth-1', email: 'a@example.com' }),
    )

    first.mockResolvedValueOnce({ _id: 'user-1' })
    await triggers.user.onUpdate(
      ctx,
      { _id: 'auth-1', email: 'b@example.com' },
      { _id: 'auth-1', email: 'a@example.com' },
    )
    expect(query).toHaveBeenCalledWith('users')
    expect(withIndex).toHaveBeenCalled()
    expect(patch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ email: 'b@example.com' }),
    )

    first.mockResolvedValueOnce({ _id: 'user-1' })
    await triggers.user.onDelete(ctx, { _id: 'auth-1' })
    expect(remove).toHaveBeenCalledWith('user-1')
  })
})
