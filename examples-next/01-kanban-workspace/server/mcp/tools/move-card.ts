import { api } from '#trellis/api'

import { agentMoveCardArgs } from '~/shared/schemas/kanban'

import { tool } from '../runtime'

export default tool({
  schema: agentMoveCardArgs,
  call: api.boards.moveCardByAgent,
  capability: 'moveCard',
  meta: {
    name: 'move-card',
  },
})
