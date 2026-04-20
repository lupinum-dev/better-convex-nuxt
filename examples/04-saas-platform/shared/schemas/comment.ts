import * as z from 'zod'

export const createCommentInputSchema = z.object({
  taskId: z.string().min(1, 'Task id is required'),
  body: z.string().trim().min(1, 'Comment body is required'),
  attachmentStorageId: z.string().min(1).optional(),
})
