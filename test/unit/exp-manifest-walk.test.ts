/**
 * Experiment 7: Build-Time AST Walk for Operations Manifest
 *
 * Validates that TypeScript Compiler API can find `defineOperation`
 * calls in source files and extract metadata (kind, name, args).
 * Runs in Node environment (not Convex runtime).
 */
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

// ---- AST Walk Implementation ----

interface OperationEntry {
  name: string
  kind: string
  exportName: string
  filePath: string
  args: string[] // arg field names
}

/**
 * Walk a TypeScript source file and extract `defineOperation` calls.
 * Returns metadata about each operation found.
 */
function extractOperations(sourceCode: string, filePath: string): OperationEntry[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  )

  const operations: OperationEntry[] = []

  function visit(node: ts.Node) {
    // Look for: export const X = defineOperation({ ... })
    if (
      ts.isVariableStatement(node)
      && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isVariableDeclaration(decl)
          && decl.initializer
          && ts.isCallExpression(decl.initializer)
        ) {
          const callExpr = decl.initializer
          const callee = callExpr.expression

          // Check if callee is `defineOperation`
          if (ts.isIdentifier(callee) && callee.text === 'defineOperation') {
            const exportName = ts.isIdentifier(decl.name) ? decl.name.text : 'unknown'
            const entry = extractFromCallExpression(callExpr, exportName, filePath)
            if (entry) operations.push(entry)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return operations
}

function extractFromCallExpression(
  callExpr: ts.CallExpression,
  exportName: string,
  filePath: string,
): OperationEntry | null {
  const arg = callExpr.arguments[0]
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null

  let kind = 'unknown'
  let name = exportName
  const args: string[] = []

  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'kind' && ts.isStringLiteral(prop.initializer)) {
      kind = prop.initializer.text
    }

    if (propName === 'name' && ts.isStringLiteral(prop.initializer)) {
      name = prop.initializer.text
    }

    if (propName === 'args' && ts.isObjectLiteralExpression(prop.initializer)) {
      // Extract arg field names from the object literal
      for (const argProp of prop.initializer.properties) {
        if (ts.isPropertyAssignment(argProp) && ts.isIdentifier(argProp.name)) {
          args.push(argProp.name.text)
        }
      }
    }
  }

  return { name, kind, exportName, filePath, args }
}

// ---- Tests ----

describe('Exp 7: Build-Time AST Walk for Operations Manifest', () => {
  it('7a: finds defineOperation calls and extracts metadata', () => {
    const source = `
      import { defineOperation } from '@lupinum/trellis/functions'
      import { v } from 'convex/values'

      export const deletePost = defineOperation({
        kind: 'destructive',
        name: 'deletePost',
        args: {
          postId: v.id('posts'),
        },
        guard: async (ctx) => { /* auth check */ },
        load: async (ctx, args) => { /* load data */ },
        authorize: async (ctx, loaded, args) => { /* authz check */ },
        preview: { confirm: (loaded) => ({ title: loaded.post.title }) },
        handler: async (ctx, args, loaded) => { /* delete */ },
      })
    `

    const ops = extractOperations(source, 'convex/posts/operations.ts')
    expect(ops).toHaveLength(1)
    expect(ops[0]).toEqual({
      name: 'deletePost',
      kind: 'destructive',
      exportName: 'deletePost',
      filePath: 'convex/posts/operations.ts',
      args: ['postId'],
    })
  })

  it('7b: handles multiple operations in one file', () => {
    const source = `
      import { defineOperation } from '@lupinum/trellis/functions'
      import { v } from 'convex/values'

      export const archivePost = defineOperation({
        kind: 'standard',
        name: 'archivePost',
        args: { postId: v.id('posts'), reason: v.string() },
        handler: async (ctx, args) => {},
      })

      export const publishPost = defineOperation({
        kind: 'standard',
        name: 'publishPost',
        args: { postId: v.id('posts') },
        handler: async (ctx, args) => {},
      })

      export const nukeAllPosts = defineOperation({
        kind: 'destructive',
        name: 'nukeAllPosts',
        args: {},
        handler: async (ctx, args) => {},
      })
    `

    const ops = extractOperations(source, 'convex/posts/bulkOps.ts')
    expect(ops).toHaveLength(3)
    expect(ops.map(o => o.name)).toEqual(['archivePost', 'publishPost', 'nukeAllPosts'])
    expect(ops.map(o => o.kind)).toEqual(['standard', 'standard', 'destructive'])
    expect(ops[0].args).toEqual(['postId', 'reason'])
    expect(ops[2].args).toEqual([])
  })

  it('7c: ignores non-defineOperation exports', () => {
    const source = `
      import { defineOperation } from '@lupinum/trellis/functions'
      import { query } from './_generated/server'

      // Regular query — not an operation
      export const listPosts = query({
        args: {},
        handler: async (ctx) => ctx.db.query('posts').collect(),
      })

      // Helper function — not an operation
      export function formatPost(post: any) {
        return { title: post.title }
      }

      // Actual operation
      export const deletePost = defineOperation({
        kind: 'destructive',
        name: 'deletePost',
        args: { postId: v.id('posts') },
        handler: async (ctx, args) => {},
      })
    `

    const ops = extractOperations(source, 'convex/posts/mixed.ts')
    expect(ops).toHaveLength(1)
    expect(ops[0].name).toBe('deletePost')
  })

  it('7d: handles aliased imports via rename tracking', () => {
    // This tests that the walker can handle the common case
    // where defineOperation is imported with an alias
    const source = `
      import { defineOperation as defOp } from '@lupinum/trellis/functions'

      export const deleteUser = defOp({
        kind: 'destructive',
        name: 'deleteUser',
        args: { userId: v.string() },
        handler: async (ctx, args) => {},
      })
    `

    // Current implementation only checks for `defineOperation` identifier.
    // This test documents that aliased imports are NOT resolved — which is
    // an acceptable limitation for the manifest walk.
    const ops = extractOperations(source, 'convex/users/ops.ts')

    // Expected: 0 — aliased imports are not followed
    // If we want to support aliases, we'd need to track import bindings
    expect(ops).toHaveLength(0)
  })

  it('7e: extracts operations when name is omitted (uses export name)', () => {
    const source = `
      import { defineOperation } from '@lupinum/trellis/functions'

      export const removeComment = defineOperation({
        kind: 'standard',
        args: { commentId: v.id('comments') },
        handler: async (ctx, args) => {},
      })
    `

    const ops = extractOperations(source, 'convex/comments/ops.ts')
    expect(ops).toHaveLength(1)
    // When no explicit `name` property, falls back to export variable name
    expect(ops[0].name).toBe('removeComment')
    expect(ops[0].kind).toBe('standard')
  })

  it('7f: processes real file-like structure with nested args', () => {
    const source = `
      import { defineOperation } from '@lupinum/trellis/functions'
      import { v } from 'convex/values'

      export const transferOwnership = defineOperation({
        kind: 'destructive',
        name: 'transferOwnership',
        args: {
          organizationId: v.id('organizations'),
          newOwnerId: v.id('users'),
          reason: v.optional(v.string()),
        },
        guard: async (ctx) => {
          if (ctx.actor.role !== 'owner') throw new Error('Only owners can transfer')
        },
        load: async (ctx, args) => {
          const org = await ctx.db.get(args.organizationId)
          const newOwner = await ctx.db.get(args.newOwnerId)
          return { org, newOwner }
        },
        authorize: async (ctx, loaded) => {
          if (!loaded.org || !loaded.newOwner) throw new Error('Not found')
        },
        preview: {
          confirm: (loaded) => ({
            orgName: loaded.org.name,
            newOwnerName: loaded.newOwner.displayName,
          }),
        },
        handler: async (ctx, args) => {
          await ctx.db.patch(args.organizationId, { ownerId: args.newOwnerId })
        },
      })
    `

    const ops = extractOperations(source, 'convex/orgs/operations.ts')
    expect(ops).toHaveLength(1)
    expect(ops[0].args).toEqual(['organizationId', 'newOwnerId', 'reason'])
    expect(ops[0].kind).toBe('destructive')
  })
})
