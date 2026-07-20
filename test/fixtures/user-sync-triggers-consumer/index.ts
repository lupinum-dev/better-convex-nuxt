/**
 * Standalone packed-probe consumer (architecture invariant) for
 * `better-convex-nuxt/server/createUserSyncTriggers`.
 *
 * Imports ONLY this subpath — no Nuxt, no Vue, no H3, no live Convex — and
 * exercises the projection triggers against an in-memory fake `ctx.db` from a
 * real node_modules-resident install of the packed tarball. Runnable
 * standalone:
 *
 *   pnpm install && pnpm run build && pnpm run start
 *
 * or driven end-to-end by `scripts/check-package-exports.mjs`'s packed probe.
 */
import { createUserSyncTriggers } from 'better-convex-nuxt/server/createUserSyncTriggers'

function fail(message: string): never {
  console.error(`user-sync-triggers-consumer FAILED: ${message}`)
  process.exit(1)
}

interface AppUser {
  _id: string
  [key: string]: unknown
}

const rows = new Map<string, AppUser>()
let nextId = 1

const db = {
  async insert(_table: string, value: Record<string, unknown>) {
    const _id = `row_${nextId++}`
    rows.set(_id, { _id, ...value } as AppUser)
    return _id
  },
  query(_table: string) {
    return {
      withIndex(
        _indexName: string,
        cb: (q: { eq: (field: string, value: unknown) => boolean }) => unknown,
      ) {
        let matchField = ''
        let matchValue: unknown
        cb({
          eq(field, value) {
            matchField = field
            matchValue = value
            return true
          },
        })
        return {
          async collect() {
            const matches: AppUser[] = []
            for (const row of rows.values()) {
              if ((row as Record<string, unknown>)[matchField] === matchValue) matches.push(row)
            }
            return matches
          },
        }
      },
    }
  },
  async patch(id: string, value: Record<string, unknown>) {
    const existing = rows.get(id)
    if (existing) rows.set(id, { ...existing, ...value } as AppUser)
  },
  async delete(id: string) {
    rows.delete(id)
  },
}

const ctx = { db }

const triggers = createUserSyncTriggers<{ id: string; name?: string | null }, AppUser>({
  table: 'appUsers',
  index: 'by_auth_id',
  createDoc: ({ user }) => ({ authId: user.id, name: user.name ?? null }),
  patchDoc: ({ user }) => ({ name: user.name ?? null }),
})

function rowCount(): number {
  return rows.size
}

async function main() {
  await triggers.user.onCreate(ctx, { id: 'auth_1', name: 'Ada' })
  const afterCreate = rowCount()
  if (afterCreate !== 1)
    fail(`expected exactly one projected row after onCreate, got ${afterCreate}`)

  // onCreate is idempotent: a second delivery for the same auth id must not insert twice.
  await triggers.user.onCreate(ctx, { id: 'auth_1', name: 'Ada' })
  const afterDuplicateCreate = rowCount()
  if (afterDuplicateCreate !== 1) fail(`onCreate must not duplicate an existing projection row`)

  await triggers.user.onUpdate(
    ctx,
    { id: 'auth_1', name: 'Ada Lovelace' },
    { id: 'auth_1', name: 'Ada' },
  )
  const updated = [...rows.values()][0]
  if (updated?.name !== 'Ada Lovelace') fail(`onUpdate did not apply patchDoc`)

  await triggers.user.onDelete(ctx, { id: 'auth_1', name: 'Ada Lovelace' })
  const afterDelete = rowCount()
  if (afterDelete !== 0) fail(`onDelete did not remove the projected row`)

  const rebuildResult = await triggers.user.rebuild(ctx, [{ id: 'auth_2', name: 'Grace' }])
  const afterRebuild = rowCount()
  if (rebuildResult.inserted !== 1 || afterRebuild !== 1) {
    fail(`rebuild did not insert the missing projection row`)
  }

  console.log('user-sync-triggers-consumer OK')
}

void main()
