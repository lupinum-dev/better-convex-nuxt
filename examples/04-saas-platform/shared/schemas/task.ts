import * as z from 'zod'

export const taskStatusSchema = z.enum(['backlog', 'in_progress', 'done'])
export const taskPrioritySchema = z.enum(['low', 'medium', 'high'])

export const createTaskInputSchema = z.object({
  projectId: z.string().min(1, 'Project id is required'),
  title: z.string().trim().min(1, 'Task title is required').max(160, 'Keep the title under 160 characters'),
  priority: taskPrioritySchema.optional(),
})

export const moveTaskInputSchema = z.object({
  id: z.string().min(1, 'Task id is required'),
  status: taskStatusSchema,
})

export const assignTaskInputSchema = z.object({
  id: z.string().min(1, 'Task id is required'),
  assigneeId: z.string().min(1).optional(),
})
