import { describe, expect, it } from 'vitest'

import { selectMcpBoundUser } from '../shared/features/mcpKeys/bound-user'

const users = [
  {
    userId: 'users_alice',
    authKey: 'user_alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    role: 'member',
  },
  {
    userId: 'users_bob',
    authKey: 'user_bob',
    displayName: 'Bob',
    email: 'bob@example.com',
    role: 'admin',
  },
]

describe('selectMcpBoundUser', () => {
  it('returns null when boundUserId is empty', () => {
    expect(selectMcpBoundUser(users, '')).toBeNull()
  })

  it('does not fall back to the first user when boundUserId is stale', () => {
    expect(selectMcpBoundUser(users, 'user_missing')).toBeNull()
  })

  it('returns the matched bound user when boundUserId is valid', () => {
    expect(selectMcpBoundUser(users, 'users_bob')).toEqual(users[1])
  })
})
