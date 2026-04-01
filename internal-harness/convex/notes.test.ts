/**
 * Notes Query/Mutation Tests
 *
 * Tests the backend behavior that frontend composables depend on.
 * These tests replace the flaky E2E tests with fast, deterministic convex-test.
 *
 * What we test:
 * - Query behaviors (list, search, pagination)
 * - Mutation behaviors (add, remove)
 * - Error handling
 */

import { convexTest } from 'convex-test'
import { describe, it, expect } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('notes.list', () => {
  it('returns empty array when no notes exist', async () => {
    const t = convexTest(schema, modules)

    const notes = await t.query(api.notes.list, {})
    expect(notes).toEqual([])
  })

  it('returns notes ordered by creation time (desc)', async () => {
    const t = convexTest(schema, modules)

    // Create notes in order
    await t.mutation(api.notes.add, { title: 'First', content: 'First content' })
    await t.mutation(api.notes.add, { title: 'Second', content: 'Second content' })
    await t.mutation(api.notes.add, { title: 'Third', content: 'Third content' })

    const notes = await t.query(api.notes.list, {})

    expect(notes).toHaveLength(3)
    // Most recent first (desc order)
    expect(notes[0]?.title).toBe('Third')
    expect(notes[1]?.title).toBe('Second')
    expect(notes[2]?.title).toBe('First')
  })

  it('limits results to 50 notes', async () => {
    const t = convexTest(schema, modules)

    // Create 55 notes
    for (let i = 0; i < 55; i++) {
      await t.mutation(api.notes.add, { title: `Note ${i}`, content: `Content ${i}` })
    }

    const notes = await t.query(api.notes.list, {})
    expect(notes).toHaveLength(50)
  })

  it('handles notes with missing title (backward compatibility)', async () => {
    const t = convexTest(schema, modules)

    // Insert note without title directly
    await t.run(async (ctx) => {
      await ctx.db.insert('notes', {
        content: 'Content without title',
        createdAt: Date.now(),
      } as Parameters<typeof ctx.db.insert<'notes'>>[1])
    })

    const notes = await t.query(api.notes.list, {})
    expect(notes).toHaveLength(1)
    expect(notes[0]?.title).toBe('Untitled')
  })
})

describe('notes.listPaginated', () => {
  it('returns first page with correct numItems', async () => {
    const t = convexTest(schema, modules)

    // Create 10 notes
    for (let i = 0; i < 10; i++) {
      await t.mutation(api.notes.add, { title: `Note ${i}`, content: `Content ${i}` })
    }

    const result = await t.query(api.notes.listPaginated, {
      paginationOpts: { numItems: 3, cursor: null },
    })

    expect(result.page).toHaveLength(3)
    expect(result.isDone).toBe(false)
    expect(result.continueCursor).toBeDefined()
  })

  it('returns isDone=true when fewer items than requested', async () => {
    const t = convexTest(schema, modules)

    // Create only 2 notes
    await t.mutation(api.notes.add, { title: 'Note 1', content: 'Content' })
    await t.mutation(api.notes.add, { title: 'Note 2', content: 'Content' })

    const result = await t.query(api.notes.listPaginated, {
      paginationOpts: { numItems: 5, cursor: null },
    })

    expect(result.page).toHaveLength(2)
    expect(result.isDone).toBe(true)
  })

  it('returns next page with cursor', async () => {
    const t = convexTest(schema, modules)

    // Create 6 notes
    for (let i = 0; i < 6; i++) {
      await t.mutation(api.notes.add, { title: `Note ${i}`, content: `Content ${i}` })
    }

    // First page
    const page1 = await t.query(api.notes.listPaginated, {
      paginationOpts: { numItems: 3, cursor: null },
    })

    expect(page1.page).toHaveLength(3)
    expect(page1.isDone).toBe(false)

    // Second page
    const page2 = await t.query(api.notes.listPaginated, {
      paginationOpts: { numItems: 3, cursor: page1.continueCursor },
    })

    expect(page2.page).toHaveLength(3)
    // Note: Convex pagination may not report isDone=true until a subsequent empty fetch
    // The important thing is we got all 6 items across the 2 pages

    // Verify no duplicates between pages
    const page1Ids = page1.page.map((n) => n._id)
    const page2Ids = page2.page.map((n) => n._id)
    const overlap = page1Ids.filter((id) => page2Ids.includes(id))
    expect(overlap).toHaveLength(0)

    // Verify we got all 6 items total
    expect(page1.page.length + page2.page.length).toBe(6)
  })

  it('returns empty page when no data exists', async () => {
    const t = convexTest(schema, modules)

    const result = await t.query(api.notes.listPaginated, {
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page).toHaveLength(0)
    expect(result.isDone).toBe(true)
  })
})

describe('notes.search', () => {
  it('returns empty array for empty query', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.notes.add, { title: 'Test', content: 'Content' })

    const results = await t.query(api.notes.search, { query: '' })
    expect(results).toEqual([])
  })

  it('returns empty array for whitespace-only query', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.notes.add, { title: 'Test', content: 'Content' })

    const results = await t.query(api.notes.search, { query: '   ' })
    expect(results).toEqual([])
  })

  it('finds notes by title', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.notes.add, { title: 'Important Meeting', content: 'Details' })
    await t.mutation(api.notes.add, { title: 'Shopping List', content: 'Items' })

    const results = await t.query(api.notes.search, { query: 'meeting' })

    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Important Meeting')
  })

  it('finds notes by content', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.notes.add, { title: 'Note 1', content: 'Contains secret keyword' })
    await t.mutation(api.notes.add, { title: 'Note 2', content: 'Just regular content' })

    const results = await t.query(api.notes.search, { query: 'secret' })

    expect(results).toHaveLength(1)
    expect(results[0]?.content).toContain('secret')
  })

  it('is case-insensitive', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.notes.add, { title: 'UPPERCASE Title', content: 'content' })

    const results = await t.query(api.notes.search, { query: 'uppercase' })
    expect(results).toHaveLength(1)
  })

  it('returns multiple matches', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.notes.add, { title: 'Project Alpha', content: 'Details' })
    await t.mutation(api.notes.add, { title: 'Project Beta', content: 'Details' })
    await t.mutation(api.notes.add, { title: 'Unrelated', content: 'Other stuff' })

    const results = await t.query(api.notes.search, { query: 'project' })
    expect(results).toHaveLength(2)
  })
})

describe('notes.get', () => {
  it('returns note by ID', async () => {
    const t = convexTest(schema, modules)

    const noteId = await t.mutation(api.notes.add, {
      title: 'My Note',
      content: 'My Content',
    })

    const note = await t.query(api.notes.get, { id: noteId })

    expect(note).not.toBeNull()
    expect(note?.title).toBe('My Note')
    expect(note?.content).toBe('My Content')
  })

  it('returns null for non-existent ID', async () => {
    const t = convexTest(schema, modules)

    // Create a note to get a valid ID format, then delete it
    const noteId = await t.mutation(api.notes.add, {
      title: 'Temp',
      content: 'Content',
    })
    await t.mutation(api.notes.remove, { id: noteId })

    const note = await t.query(api.notes.get, { id: noteId })
    expect(note).toBeNull()
  })
})

describe('notes.add', () => {
  it('creates note and returns ID', async () => {
    const t = convexTest(schema, modules)

    const noteId = await t.mutation(api.notes.add, {
      title: 'New Note',
      content: 'New Content',
    })

    expect(noteId).toBeDefined()
    expect(typeof noteId).toBe('string')

    // Verify it was actually created
    const note = await t.query(api.notes.get, { id: noteId })
    expect(note?.title).toBe('New Note')
  })

  it('sets createdAt timestamp', async () => {
    const t = convexTest(schema, modules)

    const before = Date.now()
    const noteId = await t.mutation(api.notes.add, {
      title: 'Timed Note',
      content: 'Content',
    })
    const after = Date.now()

    const note = await t.query(api.notes.get, { id: noteId })
    expect(note?.createdAt).toBeGreaterThanOrEqual(before)
    expect(note?.createdAt).toBeLessThanOrEqual(after)
  })
})

describe('notes.remove', () => {
  it('deletes note by ID', async () => {
    const t = convexTest(schema, modules)

    const noteId = await t.mutation(api.notes.add, {
      title: 'To Delete',
      content: 'Content',
    })

    // Verify it exists
    let note = await t.query(api.notes.get, { id: noteId })
    expect(note).not.toBeNull()

    // Delete it
    await t.mutation(api.notes.remove, { id: noteId })

    // Verify it's gone
    note = await t.query(api.notes.get, { id: noteId })
    expect(note).toBeNull()
  })

  it('removes note from list results', async () => {
    const t = convexTest(schema, modules)

    const noteId = await t.mutation(api.notes.add, {
      title: 'Listed Note',
      content: 'Content',
    })

    // Verify it's in the list
    let notes = await t.query(api.notes.list, {})
    expect(notes).toHaveLength(1)

    // Delete it
    await t.mutation(api.notes.remove, { id: noteId })

    // Verify it's not in the list
    notes = await t.query(api.notes.list, {})
    expect(notes).toHaveLength(0)
  })
})

describe('testing.alwaysFails', () => {
  it('throws expected error', async () => {
    const t = convexTest(schema, modules)

    await expect(t.query(api.testing.alwaysFails, {})).rejects.toThrow('Intentional test error')
  })
})
