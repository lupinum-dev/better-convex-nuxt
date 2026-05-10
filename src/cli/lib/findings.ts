import type { TrellisCliInventory, TrellisCliInventorySourceLocation } from './inventory.js'

export type DoctorFindingStatus = 'pass' | 'warn' | 'fail'
export type DoctorFindingCategory = 'core' | 'auth' | 'advanced'
export type FindingSourceKind = 'inventory' | 'project-scan'

export interface FindingSource {
  kind: FindingSourceKind
  inventoryPath?: string
  label?: string
  locations?: TrellisCliInventorySourceLocation[]
}

export interface DoctorFinding {
  id: string
  category: DoctorFindingCategory
  title: string
  status: DoctorFindingStatus
  message: string
  fixHint: string
  sources?: FindingSource[]
}

export interface DoctorSummary {
  pass: number
  warn: number
  fail: number
}

export interface FindingReport {
  schemaVersion?: 1
  cwd: string
  inventory: TrellisCliInventory
  findings: DoctorFinding[]
  summary: DoctorSummary
}

export type DoctorReport = FindingReport

function withLocations(
  source: Omit<FindingSource, 'locations'>,
  locations: TrellisCliInventorySourceLocation[],
): FindingSource {
  return locations.length > 0 ? { ...source, locations } : source
}

export function findingInventorySource(
  inventoryPath: string,
  locations: TrellisCliInventorySourceLocation[] = [],
  label?: string,
): FindingSource {
  return withLocations({ kind: 'inventory', inventoryPath, label }, locations)
}

export function findingProjectScanSource(
  label: string,
  locations: TrellisCliInventorySourceLocation[] = [],
): FindingSource {
  return withLocations({ kind: 'project-scan', label }, locations)
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

export function exitCodeForFindings(summary: DoctorSummary): 0 | 1 {
  return summary.fail > 0 ? 1 : 0
}
