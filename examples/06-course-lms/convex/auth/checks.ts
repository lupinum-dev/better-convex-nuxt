/**
 * Check style:
 * This example mostly uses direct actor predicates. Lesson-specific rules live in separate
 * relationship helpers because they depend on enrollment and prerequisite state.
 */
import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const canReadLesson = hasRole('owner', 'admin', 'instructor', 'student')
