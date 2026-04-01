import { describe, expect, it } from 'vitest'

import { selectMcpBoundUser } from '../shared/mcp-bound-user'

const users = [
  {
    authId: 'user_alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    role: 'member',
  },
  {
    authId: 'user_bob',
    displayName: 'Bob',
    email: 'bob@example.com',
    role: 'admin',
  },
]

describe('selectMcpBoundUser', () => {
  it('returns null when boundAuthId is empty', () => {
    expect(selectMcpBoundUser(users, '')).toBeNull()
  })

  it('does not fall back to the first user when boundAuthId is stale', () => {
    expect(selectMcpBoundUser(users, 'user_missing')).toBeNull()
  })

  it('returns the matched bound user when boundAuthId is valid', () => {
    expect(selectMcpBoundUser(users, 'user_bob')).toEqual(users[1])
  })
})
