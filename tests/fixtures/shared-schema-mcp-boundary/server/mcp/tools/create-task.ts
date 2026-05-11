import { defineTool } from '../../../../../../src/runtime/mcp/advanced'
import { createTask } from '../../../shared/task'

export default defineTool({
  name: 'create-task',
  schema: createTask,
  effect: 'read',
  handler: async (args) => args.title,
})
