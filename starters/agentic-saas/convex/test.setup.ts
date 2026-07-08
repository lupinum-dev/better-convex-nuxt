/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any -- this harness wraps convex-test calls to inject Better Auth identity. */

import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'

import { components } from './_generated/api'
import betterAuthSchema from './betterAuth/schema'
import schema from './schema'

export const modules = import.meta.glob('./**/*.ts', {
  eager: false,
})

const betterAuthModules = import.meta.glob('./betterAuth/**/*.ts')

type HarnessArgs = Record<string, unknown>
type HarnessFunctionReference = any
type ConvexTestHarness = ReturnType<typeof convexTest> & {
  action: (functionReference: HarnessFunctionReference, args?: HarnessArgs) => Promise<unknown>
  query: (functionReference: HarnessFunctionReference, args?: HarnessArgs) => Promise<unknown>
  mutation: (functionReference: HarnessFunctionReference, args?: HarnessArgs) => Promise<unknown>
}

function hasSessionTokenForTest(args: unknown): args is HarnessArgs & {
  sessionTokenForTest: string
} {
  return (
    args !== null &&
    typeof args === 'object' &&
    Object.prototype.hasOwnProperty.call(args, 'sessionTokenForTest') &&
    typeof (args as Record<string, unknown>).sessionTokenForTest === 'string'
  )
}

function assertBetterAuthSessionRecord(
  session: unknown,
): asserts session is { _id: string; userId: string } {
  if (
    session === null ||
    typeof session !== 'object' ||
    typeof (session as Record<string, unknown>)._id !== 'string' ||
    typeof (session as Record<string, unknown>).userId !== 'string'
  ) {
    throw new Error('Better Auth session token not found in test harness')
  }
}

export function initConvexTest() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  t.registerComponent('betterAuth', betterAuthSchema, betterAuthModules)
  const originalAction = t.action.bind(t)
  const originalQuery = t.query.bind(t)
  const originalMutation = t.mutation.bind(t)

  async function callWithOptionalBetterAuthSession(
    kind: 'action' | 'query' | 'mutation',
    functionReference: HarnessFunctionReference,
    args: HarnessArgs = {},
  ) {
    if (!hasSessionTokenForTest(args)) {
      if (kind === 'action') {
        return await originalAction(functionReference, args)
      }

      return kind === 'query'
        ? await originalQuery(functionReference, args)
        : await originalMutation(functionReference, args)
    }

    const { sessionTokenForTest, ...publicArgs } = args
    const session = await t.run(async (ctx) => {
      return await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'session',
        where: [{ field: 'token', value: sessionTokenForTest }],
      })
    })
    assertBetterAuthSessionRecord(session)

    const authenticated = t.withIdentity({
      issuer: 'convex-test-better-auth',
      subject: session.userId,
      sessionId: session._id,
    })

    if (kind === 'action') {
      return await authenticated.action(functionReference, publicArgs)
    }

    return kind === 'query'
      ? await authenticated.query(functionReference, publicArgs)
      : await authenticated.mutation(functionReference, publicArgs)
  }

  const harness = t as ConvexTestHarness
  harness.action = async (functionReference: HarnessFunctionReference, args: HarnessArgs = {}) => {
    return await callWithOptionalBetterAuthSession('action', functionReference, args)
  }
  harness.query = async (functionReference: HarnessFunctionReference, args: HarnessArgs = {}) => {
    return await callWithOptionalBetterAuthSession('query', functionReference, args)
  }
  harness.mutation = async (
    functionReference: HarnessFunctionReference,
    args: HarnessArgs = {},
  ) => {
    return await callWithOptionalBetterAuthSession('mutation', functionReference, args)
  }

  return t
}
