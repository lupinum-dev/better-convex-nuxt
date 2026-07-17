/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema } from 'convex/server'
import { describe, expect, it } from 'vitest'

import type { ComponentApi } from '../../src/runtime/convex-auth/component/_generated/component'
import authSchema from '../../src/runtime/convex-auth/component/schema'
import { requireAttackDenied, SECURITY_MUTANT_SURVIVED } from './contract'
import manifest from './reviewed-mutants.json'

const rootModules = import.meta.glob('../fixtures/jwks-rotation/convex/**/*.ts')
const authModules = import.meta.glob('../../src/runtime/convex-auth/component/**/*.ts')
const rootSchema = defineSchema({})
const components = componentsGeneric() as unknown as {
  authMutations: ComponentApi<'authMutations'>
}
const auth = components.authMutations.adapter

function initTest() {
  const test = convexTest(rootSchema, rootModules)
  test.registerComponent('authMutations', authSchema, authModules)
  return test
}

async function productionAllowsBulkUpdate(update: Record<string, unknown>): Promise<boolean> {
  try {
    await initTest().mutation(auth.updateMany, {
      model: 'user',
      update,
      where: [],
    })
    return true
  } catch (error) {
    const expected =
      'id' in update
        ? 'AUTH_FIELD_IMMUTABLE:user.id'
        : 'AUTH_BULK_UNIQUE_UPDATE_FORBIDDEN:user.email'
    if (!(error instanceof Error) || !error.message.includes(expected)) throw error
    return false
  }
}

function mutantAllowsBulkUpdate(
  update: Record<string, unknown>,
  enforcement: { immutableId: boolean; uniqueFields: boolean },
): boolean {
  if (enforcement.immutableId && 'id' in update) return false
  if (enforcement.uniqueFields && 'email' in update) return false
  return Object.keys(update).length > 0
}

const convexPairs: Record<
  string,
  { mutant: () => boolean | Promise<boolean>; production: () => boolean | Promise<boolean> }
> = {
  'adapter-update-many-id-allowed': {
    production: () => productionAllowsBulkUpdate({ id: 'attacker-chosen-id' }),
    mutant: () =>
      mutantAllowsBulkUpdate(
        { id: 'attacker-chosen-id' },
        { immutableId: false, uniqueFields: true },
      ),
  },
  'adapter-update-many-unique-allowed': {
    production: () => productionAllowsBulkUpdate({ email: 'shared@example.test' }),
    mutant: () =>
      mutantAllowsBulkUpdate(
        { email: 'shared@example.test' },
        { immutableId: true, uniqueFields: false },
      ),
  },
}

const convexManifest = manifest.mutants.filter((entry) => entry.project === 'convex')
const convexIds = new Set(convexManifest.map((entry) => entry.id))
if (
  Object.keys(convexPairs).length !== convexIds.size ||
  Object.keys(convexPairs).some((id) => !convexIds.has(id))
) {
  throw new Error('Reviewed Convex mutant manifest and implementations differ')
}

describe('fixed reviewed Convex auth security mutants', () => {
  for (const entry of convexManifest) {
    it(`MUTANT::${entry.id}`, async () => {
      const pair = convexPairs[entry.id]
      if (!pair) throw new Error(`Missing reviewed mutant implementation: ${entry.id}`)

      await expect(requireAttackDenied(pair.production), entry.invariant).resolves.toBeUndefined()
      await expect(requireAttackDenied(pair.mutant), entry.invariant).rejects.toThrow(
        SECURITY_MUTANT_SURVIVED,
      )
    })
  }
})
