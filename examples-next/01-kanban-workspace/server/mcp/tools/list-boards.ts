import { api } from '#trellis/api'

import { listBoardsForWorkspaceArgs } from '~/shared/schemas/kanban'

import { tool } from '../runtime'

export default tool({
  schema: listBoardsForWorkspaceArgs,
  call: api.boards.listBoardsForWorkspace,
  operation: 'query',
  capability: 'listBoards',
  meta: {
    name: 'list-boards',
  },
})
