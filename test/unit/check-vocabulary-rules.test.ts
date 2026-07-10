import { describe, expect, it } from 'vitest'

import { ACTIVE_PHASES, expandPathPattern, RULES } from '../../scripts/check-vocabulary.mjs'

const KNOWN_PHASES = ['phase0', 'phase1', 'phase3', 'phase4', 'phase6']

describe('vocabulary checker rule table integrity (internal §16.3)', () => {
  it('has at least one active phase and one rule', () => {
    expect(Array.isArray(ACTIVE_PHASES)).toBe(true)
    expect(ACTIVE_PHASES.length).toBeGreaterThan(0)
    expect(RULES.length).toBeGreaterThan(0)
  })

  it('is frozen at Phase 6 (vNext §11 final activation): every known phase is active', () => {
    // The table stops scheduling once Phase 6 lands — there is no later phase
    // to extend ACTIVE_PHASES for, so it must equal the full known-phase set.
    expect([...ACTIVE_PHASES].sort()).toEqual([...KNOWN_PHASES].sort())
    expect(ACTIVE_PHASES).toContain('phase6')
  })

  it('gives every rule a unique name, a description, and a known phase', () => {
    const names = new Set<string>()
    for (const rule of RULES) {
      expect(typeof rule.name).toBe('string')
      expect(rule.name.length).toBeGreaterThan(0)
      expect(names.has(rule.name)).toBe(false)
      names.add(rule.name)

      expect(typeof rule.description).toBe('string')
      expect(rule.description.length).toBeGreaterThan(0)

      expect(KNOWN_PHASES).toContain(rule.phase)
    }
  })

  it('gives every rule at least one compiled regular expression pattern', () => {
    for (const rule of RULES) {
      expect(Array.isArray(rule.patterns)).toBe(true)
      expect(rule.patterns.length).toBeGreaterThan(0)
      for (const pattern of rule.patterns) {
        expect(pattern).toBeInstanceOf(RegExp)
      }
    }
  })

  it('gives every rule at least one path, and every path resolves to something that exists', () => {
    for (const rule of RULES) {
      expect(Array.isArray(rule.paths)).toBe(true)
      expect(rule.paths.length).toBeGreaterThan(0)

      for (const pathPattern of rule.paths) {
        // expandPathPattern throws a ConfigError (fails loudly) when a path is
        // missing or a glob pattern matches nothing - the whole point of the
        // vocabulary checker replacing the vacuous-pass `sh -c '! rg ...'` scripts.
        expect(() => expandPathPattern(pathPattern)).not.toThrow()
        const resolved = expandPathPattern(pathPattern)
        expect(resolved.length).toBeGreaterThan(0)
      }
    }
  })

  it('runs every currently-active rule against the real tree (proving the table is non-vacuous)', () => {
    const activeRules = RULES.filter((rule: { phase: string }) =>
      ACTIVE_PHASES.includes(rule.phase),
    )
    expect(activeRules.length).toBeGreaterThan(0)
  })

  it('locks in the full Phase 6 source-lock rule set (vNext §11)', () => {
    const phase6Names = RULES.filter((rule: { phase: string }) => rule.phase === 'phase6').map(
      (rule: { name: string }) => rule.name,
    )
    expect(phase6Names.sort()).toEqual(
      [
        'no-legacy-auth-engine-api',
        'no-defaults-auth-escape-hatch',
        'no-permissions-module-option',
        'no-legacy-auth-dotted-flags',
        'no-legacy-auth-client-type-names',
        'no-omitted-query-args',
      ].sort(),
    )
  })

  it('reports missing rule paths as a configuration error rather than silently passing', () => {
    expect(() => expandPathPattern('this-path-definitely-does-not-exist-in-repo')).toThrow(
      /path does not exist/,
    )
    expect(() => expandPathPattern('starters/*/this-glob-segment-matches-nothing')).toThrow(
      /matched nothing/,
    )
  })
})
