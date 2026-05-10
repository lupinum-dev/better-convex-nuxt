import type { TrellisCliInventory } from './inventory.js'

export type DoctorFindingStatus = 'pass' | 'warn' | 'fail'
export type DoctorFindingCategory = 'core' | 'auth' | 'advanced'

export interface DoctorFinding {
  id: string
  category: DoctorFindingCategory
  title: string
  status: DoctorFindingStatus
  message: string
  fixHint: string
}

export interface DoctorSummary {
  pass: number
  warn: number
  fail: number
}

export interface DoctorReport {
  cwd: string
  inventory: TrellisCliInventory
  findings: DoctorFinding[]
  summary: DoctorSummary
}

export function summarizeFindings(findings: DoctorFinding[]): DoctorSummary {
  return findings.reduce<DoctorSummary>(
    (summary, finding) => {
      summary[finding.status] += 1
      return summary
    },
    { pass: 0, warn: 0, fail: 0 },
  )
}
