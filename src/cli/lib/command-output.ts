import { note, outro } from '@clack/prompts'

export type TemplateCommand = 'init' | 'add'

export interface TemplateCommandResult {
  status: 'ok'
  command: TemplateCommand
  label: string
  cwd: string
  description: string
  authored: string[]
  generated: string[]
  written: string[]
  skipped: string[]
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join('\n') : '(none)'
}

export function createTemplateCommandResult(options: Omit<TemplateCommandResult, 'status'>) {
  return {
    status: 'ok' as const,
    ...options,
  }
}

export function renderTemplateCommandResult(result: TemplateCommandResult): void {
  note(result.description, result.label)
  note(formatList(result.authored), 'authored files')
  note(formatList(result.generated), 'generated plumbing')
  if (result.written.length > 0) {
    note(formatList(result.written), 'written')
  }
  if (result.skipped.length > 0) {
    note(formatList(result.skipped), 'skipped')
  }
  outro(`Finished ${result.label} ${result.command} in ${result.cwd}`)
}

export function writeTemplateCommandResultJson(result: TemplateCommandResult): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
