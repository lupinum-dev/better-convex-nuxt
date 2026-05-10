import { styleText } from 'node:util'

import { intro, note, outro } from '@clack/prompts'

import type {
  DoctorFinding,
  DoctorFindingCategory,
  DoctorFindingStatus,
  FindingReport,
  DoctorReport,
} from './findings.js'

export interface RenderDoctorReportOptions {
  json: boolean
  color: boolean
}

export interface RenderFindingReportOptions {
  json: boolean
  color?: boolean
  title: string
  targetLabel?: string
  groupByCategory?: boolean
  useClackFrame?: boolean
}

function paint(color: boolean, style: Parameters<typeof styleText>[0], text: string): string {
  return color ? styleText(style, text) : text
}

function badgeFor(status: DoctorFindingStatus, color: boolean): string {
  switch (status) {
    case 'pass':
      return paint(color, 'green', '[ok]')
    case 'warn':
      return paint(color, 'yellow', '[warn]')
    case 'fail':
      return paint(color, 'red', '[fail]')
  }
}

function renderFinding(finding: DoctorFinding, color: boolean): string {
  const heading = `${badgeFor(finding.status, color)} ${paint(color, 'bold', finding.title)}`
  const message = `  ${finding.message}`
  const fixHint = `  Fix: ${finding.fixHint}`

  return [heading, message, fixHint].join('\n')
}

function renderFlatFinding(finding: DoctorFinding): string {
  return [
    `${finding.status.padEnd(4)}  ${finding.title}`,
    `      ${finding.message}`,
    `      Fix: ${finding.fixHint}`,
  ].join('\n')
}

function categoryLabel(category: DoctorFindingCategory): string {
  switch (category) {
    case 'core':
      return 'Core setup'
    case 'auth':
      return 'Auth and deployment'
    case 'advanced':
      return 'Advanced surfaces'
  }
}

function summaryText(report: FindingReport): string {
  return `Summary: ${report.summary.pass} passed, ${report.summary.warn} warnings, ${report.summary.fail} failures`
}

export function writeFindingReportJson(report: FindingReport): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

export function renderFindingReport(
  report: FindingReport,
  options: RenderFindingReportOptions,
): void {
  if (options.json) {
    writeFindingReportJson(report)
    return
  }

  const color = Boolean(options.color)

  if (options.useClackFrame) {
    intro('trellis')
    if (options.targetLabel) {
      note(report.cwd, options.targetLabel)
    }
  } else {
    process.stdout.write(`${options.title}\n\n`)
  }

  if (options.groupByCategory) {
    process.stdout.write('\n')
    process.stdout.write(`${paint(color, 'bold', options.title)}\n`)
    const grouped = report.findings.reduce<Record<DoctorFindingCategory, DoctorFinding[]>>(
      (acc, finding) => {
        acc[finding.category].push(finding)
        return acc
      },
      { core: [], auth: [], advanced: [] },
    )

    const sections = (['core', 'auth', 'advanced'] as const)
      .filter((category) => grouped[category].length > 0)
      .map((category) =>
        [
          paint(color, 'bold', categoryLabel(category)),
          grouped[category].map((finding) => renderFinding(finding, color)).join('\n\n'),
        ].join('\n'),
      )

    process.stdout.write(`${sections.join('\n\n')}\n\n`)
  } else {
    for (const finding of report.findings) {
      process.stdout.write(`${renderFlatFinding(finding)}\n\n`)
    }
  }

  const summary = summaryText(report)
  if (options.useClackFrame) {
    outro(report.summary.fail > 0 ? paint(color, 'red', summary) : paint(color, 'green', summary))
  } else {
    process.stdout.write(`${summary}\n`)
  }
}

export function renderDoctorReport(report: DoctorReport, options: RenderDoctorReportOptions): void {
  renderFindingReport(report, {
    json: options.json,
    color: options.color,
    title: 'Checks',
    targetLabel: 'doctor target',
    groupByCategory: true,
    useClackFrame: true,
  })
}
