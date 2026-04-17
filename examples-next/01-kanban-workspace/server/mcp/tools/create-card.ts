import { api } from '#trellis/api'

import { agentCreateCardArgs } from '~/shared/schemas/kanban'

import { tool } from '../runtime'

export default tool({
  schema: agentCreateCardArgs,
  call: api.boards.createCardByAgent,
  capability: 'createCard',
  meta: {
    name: 'create-card',
  },
})
