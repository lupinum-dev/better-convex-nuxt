import { z } from 'zod'

/**
 * Zod schema for task creation input
 * This schema is shared between client-side forms and server-side Convex functions
 */
export const addTaskInputSchema = z.object({
  title: z.string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s.,!?'-]+$/, 'Only letters, numbers, spaces and basic punctuation allowed')
    .trim()
    .refine(val => val.length > 0, 'Title cannot be just whitespace'),
})

/**
 * Zod schema for task updates
 */
export const updateTaskInputSchema = z.object({
  id: z.string(),
  title: z.string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be less than 100 characters')
    .optional(),
  completed: z.boolean().optional(),
})

/**
 * Full task schema matching Convex database structure
 */
export const taskSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  userId: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.number(),
})

// Export TypeScript types inferred from Zod schemas
export type AddTaskInput = z.infer<typeof addTaskInputSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>
export type Task = z.infer<typeof taskSchema>
