import { z } from 'zod'

const organizationNameSchema = z
  .string()
  .trim()
  .min(1, 'Organization name is required')
  .max(120, 'Organization name is too long')

const personNameSchema = z.string().trim().min(1, 'Name is required').max(120, 'Name is too long')

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('A valid email is required')
  .transform((value) => value.toLowerCase())

const passwordSchema = z.string().min(15, 'Password must be at least 15 characters')

const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'Project name is required')
  .max(120, 'Project name is too long')

const serviceActorRoleSchema = z.enum(['viewer', 'member', 'admin'])

const serviceActorNameSchema = z
  .string()
  .trim()
  .min(1, 'Service actor name is required')
  .max(120, 'Service actor name is too long')

export const createOrganizationInputSchema = z.object({
  name: organizationNameSchema,
})

export const createProjectInputSchema = z.object({
  name: projectNameSchema,
})

export const createServiceActorInputSchema = z.object({
  name: serviceActorNameSchema,
  role: serviceActorRoleSchema,
})

export const createMcpProjectRequestSchema = z.object({
  bearerToken: z.string().min(1, 'Bearer token is required').max(256, 'Bearer token is too long'),
  name: projectNameSchema,
})

export const signInInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const signUpInputSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
})
