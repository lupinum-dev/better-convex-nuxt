import { defineTool } from '../../../../../../src/runtime/mcp'
import { createTask } from '../../../shared/task'

export default defineTool({
  name: 'create-task',
  schema: createTask,
  handler: async (args: { title: string }) => args.title,
})
