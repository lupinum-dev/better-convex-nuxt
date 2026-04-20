import * as z from 'zod'

const todoTitleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(160, 'Keep the title under 160 characters')

export const createTodoInputSchema = z.object({
  title: todoTitleSchema,
})
