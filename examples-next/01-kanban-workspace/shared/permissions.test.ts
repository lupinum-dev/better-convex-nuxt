import { describe, expect, it } from 'vitest'

import {
  deriveKanbanCapabilities,
  getKanbanPermissions,
  roleHasPermission,
} from './permissions'

describe('permissions', () => {
  it('projects one canonical role model into UI permissions', () => {
    expect(getKanbanPermissions('owner')).toMatchObject({
      manageMembers: true,
      manageBoards: true,
      manageBoardStructure: true,
      writeCards: true,
      archiveBoard: true,
    })

    expect(getKanbanPermissions('viewer')).toMatchObject({
      manageMembers: false,
      manageBoards: false,
      manageBoardStructure: false,
      writeCards: false,
      archiveBoard: false,
    })
  })

  it('derives MCP capabilities from the same permission truth', () => {
    expect(deriveKanbanCapabilities(['viewer'])).toEqual({
      listWorkspaces: true,
      listBoards: true,
      createCard: false,
      moveCard: false,
      archiveBoard: false,
    })

    expect(deriveKanbanCapabilities(['viewer', 'admin'])).toEqual({
      listWorkspaces: true,
      listBoards: true,
      createCard: true,
      moveCard: true,
      archiveBoard: true,
    })

    expect(roleHasPermission('admin', 'archiveBoard')).toBe(true)
    expect(roleHasPermission('member', 'archiveBoard')).toBe(false)
  })
})
