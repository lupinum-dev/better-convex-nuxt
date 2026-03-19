import { defineEventHandler } from 'h3'

import { PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH } from '../../../private-function-references'
import { getPrivateBridgeReferenceState } from '../../utils/private-convex'

export default defineEventHandler(() => ({
  executedOn: 'server',
  source: 'privileged',
  functionPath: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
  ...getPrivateBridgeReferenceState(),
}))
