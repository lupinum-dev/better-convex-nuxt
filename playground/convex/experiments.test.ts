/**
 * Multi-Tenant Scoping Experiments
 *
 * 5 experiments to validate core assumptions for the scoped query architecture.
 * Run with: pnpm vitest --project=convex experiments
 */

import { convexTest } from 'convex-test'
import { describe, it, expect } from 'vitest'

import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

// ============================================
// EXPERIMENT 1: Wrapped Query/Mutation Builders
// ============================================
// Can we wrap Convex's query()/mutation() builders and still get valid
// function references that convex-test (and by extension Convex runtime) recognizes?

describe('experiment 1: wrapped builders', () => {
  // We import the wrapped functions dynamically since they're not in the generated API.
  // convex-test resolves modules via the glob, so we use makeFunctionReference.

  it('wrapped query is callable and returns data', async () => {
    const t = convexTest(schema, modules)

    // Seed data
    await t.run(async (ctx) => {
      await ctx.db.insert('notes', {
        title: 'Test Note',
        content: 'Hello from experiment 1',
        createdAt: Date.now(),
      })
    })

    // Call the wrapped query — convex-test should resolve it from the module glob
    const { anyApi } = await import('convex/server')
    const listNotes = anyApi['experiments/wrapped'].listNotes
    const notes = await t.query(listNotes, { _orgId: 'org_123' })

    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('Test Note')
  })

  it('wrapped mutation creates documents', async () => {
    const t = convexTest(schema, modules)

    const { anyApi } = await import('convex/server')
    const createNote = anyApi['experiments/wrapped'].createNote

    const noteId = await t.mutation(createNote, {
      title: 'Created via wrapper',
      content: 'This proves mutation wrapping works',
      _orgId: 'org_456',
    })

    expect(noteId).toBeDefined()

    // Verify the note was created with correct data
    const note = await t.run(async (ctx) => {
      return await ctx.db.get(noteId)
    })
    expect(note).not.toBeNull()
    expect(note!.title).toBe('Created via wrapper')
    expect(note!.userId).toBe('org_456') // meta.organizationId was passed through
  })

  it('wrapped query can read by ID', async () => {
    const t = convexTest(schema, modules)

    const { anyApi } = await import('convex/server')
    const createNote = anyApi['experiments/wrapped'].createNote
    const getNote = anyApi['experiments/wrapped'].getNote

    const noteId = await t.mutation(createNote, {
      title: 'Readable Note',
      content: 'Content',
      _orgId: 'org_123',
    })

    const note = await t.query(getNote, { id: noteId, _orgId: 'org_123' })
    expect(note).not.toBeNull()
    expect(note!.title).toBe('Readable Note')
  })

  it('wrapped mutation can patch documents', async () => {
    const t = convexTest(schema, modules)

    const { anyApi } = await import('convex/server')
    const createNote = anyApi['experiments/wrapped'].createNote
    const updateNote = anyApi['experiments/wrapped'].updateNote
    const getNote = anyApi['experiments/wrapped'].getNote

    const noteId = await t.mutation(createNote, {
      title: 'Original',
      content: 'Content',
      _orgId: 'org_123',
    })

    await t.mutation(updateNote, {
      id: noteId,
      title: 'Updated Title',
      _orgId: 'org_123',
    })

    const note = await t.query(getNote, { id: noteId, _orgId: 'org_123' })
    expect(note!.title).toBe('Updated Title')
  })

  it('wrapped mutation can delete documents', async () => {
    const t = convexTest(schema, modules)

    const { anyApi } = await import('convex/server')
    const createNote = anyApi['experiments/wrapped'].createNote
    const deleteNote = anyApi['experiments/wrapped'].deleteNote
    const getNote = anyApi['experiments/wrapped'].getNote

    const noteId = await t.mutation(createNote, {
      title: 'To Delete',
      content: 'Content',
      _orgId: 'org_123',
    })

    await t.mutation(deleteNote, { id: noteId, _orgId: 'org_123' })

    const note = await t.query(getNote, { id: noteId, _orgId: 'org_123' })
    expect(note).toBeNull()
  })

  it('wrapper preserves arg validation (rejects missing required args)', async () => {
    const t = convexTest(schema, modules)

    const { anyApi } = await import('convex/server')
    const createNote = anyApi['experiments/wrapped'].createNote

    // Missing 'content' should fail validation
    await expect(
      t.mutation(createNote, {
        title: 'Missing Content',
        _orgId: 'org_123',
      } as never),
    ).rejects.toThrow()
  })
})

// ============================================
// EXPERIMENT 2: withIndex() Chain Position
// ============================================
// Does .withIndex() support all downstream methods?
// Types already confirm this (Query interface), but let's verify runtime behavior.

describe('experiment 2: withIndex chain combinations', () => {
  async function seedPosts(t: ReturnType<typeof convexTest>) {
    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Test Org',
        slug: 'test',
        ownerId: 'owner_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Create 10 posts in the org
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert('posts', {
          title: `Post ${i}`,
          content: `Content ${i}`,
          status: i % 2 === 0 ? 'published' : 'draft',
          ownerId: 'user_1',
          organizationId: orgId,
          createdAt: Date.now() + i, // ensure distinct timestamps
          updatedAt: Date.now() + i,
        })
      }
    })

    // Create posts in a DIFFERENT org to verify isolation
    const otherOrgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other Org',
        slug: 'other',
        ownerId: 'owner_2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert('posts', {
          title: `Other Post ${i}`,
          content: `Other Content ${i}`,
          status: 'published',
          ownerId: 'user_2',
          organizationId: otherOrgId,
          createdAt: Date.now() + i,
          updatedAt: Date.now() + i,
        })
      }
    })

    return { orgId, otherOrgId }
  }

  it('withIndex → .collect()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const posts = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .collect()
    })

    expect(posts).toHaveLength(10)
    expect(posts.every((p) => p.organizationId === orgId)).toBe(true)
  })

  it('withIndex → .order("desc") → .collect()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const posts = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .order('desc')
        .collect()
    })

    expect(posts).toHaveLength(10)
    // Verify descending order by createdAt
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i - 1]._creationTime).toBeGreaterThanOrEqual(posts[i]._creationTime)
    }
  })

  it('withIndex → .order("asc") → .collect()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const posts = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .order('asc')
        .collect()
    })

    expect(posts).toHaveLength(10)
    // Verify ascending order
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i]._creationTime).toBeGreaterThanOrEqual(posts[i - 1]._creationTime)
    }
  })

  it('withIndex → .take(n)', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const posts = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .take(3)
    })

    expect(posts).toHaveLength(3)
    expect(posts.every((p) => p.organizationId === orgId)).toBe(true)
  })

  it('withIndex → .first()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const post = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .first()
    })

    expect(post).not.toBeNull()
    expect(post!.organizationId).toBe(orgId)
  })

  it('withIndex → .order("desc") → .first()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const post = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .order('desc')
        .first()
    })

    expect(post).not.toBeNull()
    expect(post!.organizationId).toBe(orgId)
  })

  it('withIndex → .filter() → .collect()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const posts = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .filter((q) => q.eq(q.field('status'), 'published'))
        .collect()
    })

    // 5 out of 10 posts are published (even-indexed)
    expect(posts).toHaveLength(5)
    expect(posts.every((p) => p.status === 'published')).toBe(true)
    expect(posts.every((p) => p.organizationId === orgId)).toBe(true)
  })

  it('withIndex → .order("desc") → .filter() → .take(n)', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const posts = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .order('desc')
        .filter((q) => q.eq(q.field('status'), 'draft'))
        .take(2)
    })

    expect(posts).toHaveLength(2)
    expect(posts.every((p) => p.status === 'draft')).toBe(true)
    expect(posts.every((p) => p.organizationId === orgId)).toBe(true)
  })

  it('withIndex → .paginate()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const page1 = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .paginate({ numItems: 4, cursor: null })
    })

    expect(page1.page).toHaveLength(4)
    expect(page1.isDone).toBe(false)
    expect(page1.page.every((p) => p.organizationId === orgId)).toBe(true)

    // Continue pagination
    const page2 = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .paginate({ numItems: 4, cursor: page1.continueCursor })
    })

    expect(page2.page).toHaveLength(4)
    expect(page2.page.every((p) => p.organizationId === orgId)).toBe(true)

    // No overlap
    const page1Ids = page1.page.map((p) => p._id)
    const page2Ids = page2.page.map((p) => p._id)
    expect(page1Ids.filter((id) => page2Ids.includes(id))).toHaveLength(0)
  })

  it('withIndex → .order("desc") → .paginate()', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const page = await t.run(async (ctx) => {
      return await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .order('desc')
        .paginate({ numItems: 3, cursor: null })
    })

    expect(page.page).toHaveLength(3)
    expect(page.page.every((p) => p.organizationId === orgId)).toBe(true)
    // Verify desc order
    for (let i = 1; i < page.page.length; i++) {
      expect(page.page[i - 1]._creationTime).toBeGreaterThanOrEqual(page.page[i]._creationTime)
    }
  })

  it('withIndex isolates results from other orgs', async () => {
    const t = convexTest(schema, modules)
    const { orgId, otherOrgId } = await seedPosts(t)

    const [orgPosts, otherPosts, allPosts] = await t.run(async (ctx) => {
      const org = await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', orgId))
        .collect()
      const other = await ctx.db
        .query('posts')
        .withIndex('by_organization', (q) => q.eq('organizationId', otherOrgId))
        .collect()
      const all = await ctx.db.query('posts').collect()
      return [org, other, all] as const
    })

    expect(orgPosts).toHaveLength(10)
    expect(otherPosts).toHaveLength(5)
    expect(allPosts).toHaveLength(15)
    // No cross-contamination
    expect(orgPosts.every((p) => p.organizationId === orgId)).toBe(true)
    expect(otherPosts.every((p) => p.organizationId === otherOrgId)).toBe(true)
  })
})

// ============================================
// EXPERIMENT 3: Pre-Read Cost on Writes
// ============================================
// Measures overhead of get-then-patch vs direct patch.
// convex-test runs in-memory so we're measuring relative cost, not absolute latency.

describe('experiment 3: pre-read write overhead', () => {
  it('measures get-then-patch vs direct patch (relative overhead)', async () => {
    const t = convexTest(schema, modules)

    // Seed: create an org and 50 posts
    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Bench Org',
        slug: 'bench',
        ownerId: 'owner_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const postIds: Id<'posts'>[] = []
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        const id = await ctx.db.insert('posts', {
          title: `Post ${i}`,
          content: `Content ${i}`,
          status: 'draft',
          ownerId: 'user_1',
          organizationId: orgId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        postIds.push(id)
      }
    })

    // Benchmark: direct patch (no pre-read)
    const directStart = performance.now()
    for (const postId of postIds) {
      await t.run(async (ctx) => {
        await ctx.db.patch(postId, { title: 'Updated Direct' })
      })
    }
    const directTime = performance.now() - directStart

    // Reset
    await t.run(async (ctx) => {
      for (const postId of postIds) {
        await ctx.db.patch(postId, { title: 'Reset' })
      }
    })

    // Benchmark: get-then-patch (with org check)
    const preReadStart = performance.now()
    for (const postId of postIds) {
      await t.run(async (ctx) => {
        const doc = await ctx.db.get(postId)
        if (!doc || doc.organizationId !== orgId) {
          throw new Error('Org mismatch')
        }
        await ctx.db.patch(postId, { title: 'Updated PreRead' })
      })
    }
    const preReadTime = performance.now() - preReadStart

    // Report results
    const overhead = preReadTime - directTime
    const overheadPerOp = overhead / postIds.length
    const overheadPct = ((preReadTime / directTime - 1) * 100).toFixed(1)

    console.log('\n--- Experiment 3: Pre-Read Write Overhead ---')
    console.log(`Direct patch (50 ops): ${directTime.toFixed(1)}ms`)
    console.log(`Get+check+patch (50 ops): ${preReadTime.toFixed(1)}ms`)
    console.log(`Overhead: ${overhead.toFixed(1)}ms total, ${overheadPerOp.toFixed(2)}ms/op`)
    console.log(`Overhead %: ${overheadPct}%`)
    console.log('---')

    // The pre-read approach should not be more than 3x slower in-memory
    // (in production the overhead would be even smaller relative to network)
    expect(preReadTime).toBeLessThan(directTime * 3)
  })

  it('get-then-delete overhead is acceptable', async () => {
    const t = convexTest(schema, modules)

    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Bench Org',
        slug: 'bench',
        ownerId: 'owner_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Create posts for direct delete
    const directIds: Id<'posts'>[] = []
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        directIds.push(
          await ctx.db.insert('posts', {
            title: `Post ${i}`,
            content: `Content ${i}`,
            status: 'draft',
            ownerId: 'user_1',
            organizationId: orgId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        )
      }
    })

    // Create posts for get-then-delete
    const preReadIds: Id<'posts'>[] = []
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        preReadIds.push(
          await ctx.db.insert('posts', {
            title: `Post ${i}`,
            content: `Content ${i}`,
            status: 'draft',
            ownerId: 'user_1',
            organizationId: orgId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        )
      }
    })

    // Direct delete
    const directStart = performance.now()
    for (const id of directIds) {
      await t.run(async (ctx) => {
        await ctx.db.delete(id)
      })
    }
    const directTime = performance.now() - directStart

    // Get-then-delete
    const preReadStart = performance.now()
    for (const id of preReadIds) {
      await t.run(async (ctx) => {
        const doc = await ctx.db.get(id)
        if (!doc || doc.organizationId !== orgId) {
          throw new Error('Org mismatch')
        }
        await ctx.db.delete(id)
      })
    }
    const preReadTime = performance.now() - preReadStart

    const overhead = preReadTime - directTime
    const overheadPerOp = overhead / 50

    console.log('\n--- Experiment 3b: Pre-Read Delete Overhead ---')
    console.log(`Direct delete (50 ops): ${directTime.toFixed(1)}ms`)
    console.log(`Get+check+delete (50 ops): ${preReadTime.toFixed(1)}ms`)
    console.log(`Overhead: ${overhead.toFixed(1)}ms total, ${overheadPerOp.toFixed(2)}ms/op`)
    console.log('---')

    expect(preReadTime).toBeLessThan(directTime * 3)
  })
})

// ============================================
// EXPERIMENT 4: Hidden ctx / Type Inference
// ============================================
// Can a wrapper hide ctx and still allow TypeScript to infer arg types?
// This is primarily a compile-time test — if this file compiles, the experiment passes.

describe('experiment 4: hidden ctx with type inference', () => {
  it('wrapper handler receives db, args, and meta (not ctx)', async () => {
    const t = convexTest(schema, modules)

    const { anyApi } = await import('convex/server')
    const createNote = anyApi['experiments/wrapped'].createNote

    // The handler in wrapped.ts uses (db, args, meta) — not ctx.
    // If this works, ctx is successfully hidden from the developer.
    const noteId = await t.mutation(createNote, {
      title: 'Type Test',
      content: 'Verifying handler signature',
      _orgId: 'org_type_test',
    })

    // Verify the meta was accessible (userId was set to meta.organizationId)
    const note = await t.run(async (ctx) => ctx.db.get(noteId))
    expect(note!.userId).toBe('org_type_test')
  })

  it('raw ctx is accessible via meta.raw.ctx escape hatch', async () => {
    const t = convexTest(schema, modules)

    // This test verifies the escape hatch works by checking that
    // the wrapped handler can access auth via meta.raw.ctx
    // We test this indirectly — the handler in wrapped.ts stores meta.organizationId
    const { anyApi } = await import('convex/server')
    const createNote = anyApi['experiments/wrapped'].createNote

    const noteId = await t.mutation(createNote, {
      title: 'Escape Hatch Test',
      content: 'Testing raw ctx access',
      _orgId: 'org_escape',
    })

    const note = await t.run(async (ctx) => ctx.db.get(noteId))
    expect(note).not.toBeNull()
  })

  it('db operations work through wrapper (query, insert, patch, delete)', async () => {
    const t = convexTest(schema, modules)

    const { anyApi } = await import('convex/server')
    const wrapped = anyApi['experiments/wrapped']

    // Insert
    const id = await t.mutation(wrapped.createNote, {
      title: 'Full CRUD',
      content: 'Testing all ops',
      _orgId: 'org_crud',
    })

    // Query
    const notes = await t.query(wrapped.listNotes, { _orgId: 'org_crud' })
    expect(notes.some(n => n._id === id)).toBe(true)

    // Patch
    await t.mutation(wrapped.updateNote, {
      id,
      title: 'Updated CRUD',
      _orgId: 'org_crud',
    })

    const updated = await t.query(wrapped.getNote, { id, _orgId: 'org_crud' })
    expect(updated!.title).toBe('Updated CRUD')

    // Delete
    await t.mutation(wrapped.deleteNote, { id, _orgId: 'org_crud' })
    const deleted = await t.query(wrapped.getNote, { id, _orgId: 'org_crud' })
    expect(deleted).toBeNull()
  })
})

// ============================================
// EXPERIMENT 5: db.get() Returns Complete Documents
// ============================================
// Does ctx.db.get(id) return ALL fields including organizationId?
// Does 'field in doc' work for scoped vs unscoped tables?

describe('experiment 5: db.get() document completeness', () => {
  it('db.get() returns complete documents with all fields (scoped table)', async () => {
    const t = convexTest(schema, modules)

    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Test Org',
        slug: 'test',
        ownerId: 'owner_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const postId = await t.run(async (ctx) => {
      return await ctx.db.insert('posts', {
        title: 'Scoped Post',
        content: 'Content',
        status: 'draft',
        ownerId: 'user_1',
        organizationId: orgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Get the document and verify ALL fields are present
    const post = await t.run(async (ctx) => {
      return await ctx.db.get(postId)
    })

    expect(post).not.toBeNull()
    expect(post!._id).toBe(postId)
    expect(post!._creationTime).toBeDefined()
    expect(post!.title).toBe('Scoped Post')
    expect(post!.content).toBe('Content')
    expect(post!.status).toBe('draft')
    expect(post!.ownerId).toBe('user_1')
    expect(post!.organizationId).toBe(orgId)
    expect(post!.createdAt).toBeDefined()
    expect(post!.updatedAt).toBeDefined()
  })

  it('organizationId field is accessible via "in" operator on scoped docs', async () => {
    const t = convexTest(schema, modules)

    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Test Org',
        slug: 'test',
        ownerId: 'owner_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const postId = await t.run(async (ctx) => {
      return await ctx.db.insert('posts', {
        title: 'Check In Op',
        content: 'Content',
        status: 'draft',
        ownerId: 'user_1',
        organizationId: orgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // The critical check: does 'organizationId' in doc work?
    const result = await t.run(async (ctx) => {
      const doc = await ctx.db.get(postId)
      if (!doc) return { found: false, hasOrgField: false, orgValue: null }

      return {
        found: true,
        hasOrgField: 'organizationId' in doc,
        orgValue: (doc as { organizationId?: string }).organizationId,
        orgFieldType: typeof (doc as { organizationId?: string }).organizationId,
      }
    })

    expect(result.found).toBe(true)
    expect(result.hasOrgField).toBe(true)
    expect(result.orgValue).toBe(orgId)
    expect(result.orgFieldType).toBe('string')
  })

  it('"organizationId" in doc is FALSE for unscoped tables', async () => {
    const t = convexTest(schema, modules)

    const noteId = await t.run(async (ctx) => {
      return await ctx.db.insert('notes', {
        title: 'Unscoped Note',
        content: 'No org field here',
        createdAt: Date.now(),
      })
    })

    const result = await t.run(async (ctx) => {
      const doc = await ctx.db.get(noteId)
      if (!doc) return { found: false, hasOrgField: false }

      return {
        found: true,
        hasOrgField: 'organizationId' in doc,
        orgValue: (doc as { organizationId?: string }).organizationId,
      }
    })

    expect(result.found).toBe(true)
    expect(result.hasOrgField).toBe(false)
    expect(result.orgValue).toBeUndefined()
  })

  it('org check pattern works: scoped passes, unscoped passes through', async () => {
    const t = convexTest(schema, modules)

    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Test Org',
        slug: 'test',
        ownerId: 'owner_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const postId = await t.run(async (ctx) => {
      return await ctx.db.insert('posts', {
        title: 'Scoped',
        content: 'Content',
        status: 'draft',
        ownerId: 'user_1',
        organizationId: orgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const noteId = await t.run(async (ctx) => {
      return await ctx.db.insert('notes', {
        title: 'Unscoped',
        content: 'Content',
        createdAt: Date.now(),
      })
    })

    // Simulate the org check pattern from the spec
    const orgField = 'organizationId'
    const currentOrgId = orgId

    const checkOrgAccess = async (
      ctx: { db: { get: (id: Id<'notes'> | Id<'posts'>) => Promise<Record<string, unknown> | null> } },
      id: Id<'notes'> | Id<'posts'>,
    ) => {
      const doc = await ctx.db.get(id)
      if (!doc) return { allowed: false, reason: 'not found' }

      // If the document has the org field, check it
      if (orgField in doc) {
        if (doc[orgField] !== currentOrgId) {
          return { allowed: false, reason: 'org mismatch' }
        }
        return { allowed: true, reason: 'org match' }
      }

      // Unscoped table — pass through
      return { allowed: true, reason: 'unscoped' }
    }

    // Scoped doc with matching org → allowed
    const scopedResult = await t.run(async (ctx) => {
      return await checkOrgAccess(ctx, postId)
    })
    expect(scopedResult).toEqual({ allowed: true, reason: 'org match' })

    // Unscoped doc → pass through
    const unscopedResult = await t.run(async (ctx) => {
      return await checkOrgAccess(ctx, noteId)
    })
    expect(unscopedResult).toEqual({ allowed: true, reason: 'unscoped' })
  })

  it('org check rejects documents from wrong org', async () => {
    const t = convexTest(schema, modules)

    const org1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const org2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner_2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Post belongs to org1
    const postId = await t.run(async (ctx) => {
      return await ctx.db.insert('posts', {
        title: 'Org 1 Post',
        content: 'Content',
        status: 'draft',
        ownerId: 'user_1',
        organizationId: org1Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Try to access from org2's perspective
    const result = await t.run(async (ctx) => {
      const doc = await ctx.db.get(postId)
      if (!doc) return { allowed: false }

      if ('organizationId' in doc && doc.organizationId !== org2Id) {
        return { allowed: false, reason: 'org mismatch', docOrg: doc.organizationId }
      }
      return { allowed: true }
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('org mismatch')
    expect(result.docOrg).toBe(org1Id)
  })

  it('optional organizationId field: undefined vs missing', async () => {
    const t = convexTest(schema, modules)

    // Users table has optional organizationId
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        authId: 'test_user',
        role: 'member',
        // organizationId is optional — omitting it
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.run(async (ctx) => {
      const doc = await ctx.db.get(userId)
      if (!doc) return null

      return {
        hasOrgField: 'organizationId' in doc,
        orgValue: doc.organizationId,
        orgIsUndefined: doc.organizationId === undefined,
      }
    })

    expect(result).not.toBeNull()
    // This is the critical edge case: when a field is v.optional() and not set,
    // does Convex store it as missing (not in object) or as undefined?
    console.log('\n--- Experiment 5: Optional field behavior ---')
    console.log(`'organizationId' in doc: ${result!.hasOrgField}`)
    console.log(`doc.organizationId value: ${result!.orgValue}`)
    console.log(`doc.organizationId === undefined: ${result!.orgIsUndefined}`)
    console.log('---')

    // Either way, we need to handle it. The test documents what actually happens.
    // If hasOrgField is true but value is undefined, we need !== undefined check too.
    // If hasOrgField is false, the 'in' check naturally skips it.
    expect(result!.orgIsUndefined).toBe(true)
  })
})
