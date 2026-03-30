/**
 * Why this file exists:
 * Convex functions run on Convex's servers, outside Nuxt's auto-import system.
 * This file is the small app-local bridge for that runtime boundary: create the builders once,
 * then let every Convex function file import the specific builders it needs.
 */
import { createFunctions } from 'better-convex-nuxt/convex'

export const {
  publicQuery,
  publicMutation,
} = createFunctions()
