import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('mcp-agent schema invariants', () => {
  it('keeps approval and service audit labels schema-bounded', () => {
    const source = readFileSync(new URL('./schema.ts', import.meta.url), 'utf8')

    expect(source).toContain(
      "export const approvalOperationValidator = v.literal('projects.delete')",
    )
    expect(source).toContain('export const approvalStatusValidator = v.union(')
    expect(source).toContain("v.literal('pending')")
    expect(source).toContain("v.literal('approved')")
    expect(source).toContain("v.literal('rejected')")
    expect(source).toContain("v.literal('used')")
    expect(source).not.toContain("v.literal('expired')")
    expect(source).toContain('export const serviceAuditActionValidator = v.union(')
    expect(source).toContain("v.literal('projects.create')")
    expect(source).toContain("v.literal('projects.delete')")
    expect(source).toContain(
      "export const serviceAuditResourceTypeValidator = v.literal('project')",
    )
    expect(source).toContain('export const projectCreatorValidator = v.union(')
    expect(source).toContain('export const serviceActorRoleValidator = v.union(')
    expect(source).toContain('role: serviceActorRoleValidator')
    expect(source).toContain('operation: approvalOperationValidator')
    expect(source).toContain('action: serviceAuditActionValidator')
    expect(source).toContain('resourceType: serviceAuditResourceTypeValidator')
    expect(source).toContain('createdBy: projectCreatorValidator')
    expect(source).not.toContain('createdByServiceActorId')
    expect(source).not.toContain("v.literal('denied')")
  })
})
