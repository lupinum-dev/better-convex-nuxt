import { toValue, type MaybeRefOrGetter } from 'vue'

import { deepUnref } from './deep-unref'

export type ConvexSkipArg = 'skip'
export type ConvexMaybeArgs<Args> = Args | ConvexSkipArg | null | undefined

export function normalizeConvexArgs<Args>(
  args: MaybeRefOrGetter<ConvexMaybeArgs<Args>> | undefined,
): ConvexMaybeArgs<Args> {
  const rawArgs = args === undefined ? ({} as Args) : toValue(args)
  if (rawArgs === null || rawArgs === undefined || rawArgs === 'skip') {
    return rawArgs
  }

  return deepUnref(rawArgs) as Args
}

export function isConvexArgsSkipped(args: unknown): boolean {
  return args === null || args === undefined || args === 'skip'
}
