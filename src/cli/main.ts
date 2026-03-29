import { renderUsage, runCommand, defineCommand } from 'citty'

import { doctorCommand } from './commands/doctor.js'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function createCliCommand() {
  return defineCommand({
    meta: {
      name: 'better-convex-nuxt',
      description: 'CLI tools for better-convex-nuxt',
    },
    subCommands: {
      doctor: doctorCommand,
    },
  })
}

export async function runCli(rawArgs: string[]): Promise<number> {
  const command = createCliCommand()

  if (rawArgs.length === 0 || (rawArgs.length === 1 && ['--help', '-h'].includes(rawArgs[0]!))) {
    process.stdout.write(`${await renderUsage(command)}\n`)
    return 0
  }

  try {
    const { result } = await runCommand(command, {
      rawArgs,
      showUsage: true,
    })

    if (typeof result === 'number') {
      return result
    }

    return typeof process.exitCode === 'number' ? process.exitCode : 0
  } catch (error) {
    const message = getErrorMessage(error)
    process.stderr.write(`Error: ${message}\n\n`)
    process.stderr.write(`${await renderUsage(command)}\n`)
    return 2
  }
}
