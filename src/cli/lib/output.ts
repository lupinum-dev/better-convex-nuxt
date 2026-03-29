import { styleText } from 'node:util'

import { intro, note, outro } from '@clack/prompts'

import type { DoctorFinding, DoctorFindingStatus, DoctorReport } from './findings.js'

export interface RenderDoctorReportOptions {
  json: boolean
  color: boolean
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

export function renderDoctorReport(report: DoctorReport, options: RenderDoctorReportOptions): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  intro('better-convex-nuxt')
  note(report.cwd, 'doctor target')

  process.stdout.write('\n')
  process.stdout.write(`${paint(options.color, 'bold', 'Checks')}\n`)
  process.stdout.write(`${report.findings.map((finding) => renderFinding(finding, options.color)).join('\n\n')}\n\n`)

  const summary = `Summary: ${report.summary.pass} passed, ${report.summary.warn} warnings, ${report.summary.fail} failures`
  outro(report.summary.fail > 0 ? paint(options.color, 'red', summary) : paint(options.color, 'green', summary))
}
