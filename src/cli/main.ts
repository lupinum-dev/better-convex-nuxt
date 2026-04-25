import { renderUsage, runCommand, defineCommand } from 'citty'

import { addCommand } from './commands/add.js'
import { bridgeCommand } from './commands/bridge.js'
import { doctorCommand } from './commands/doctor.js'
import { initCommand } from './commands/init.js'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function createCliCommand() {
  return defineCommand({
    meta: {
      name: 'trellis',
      description: 'CLI tools for @lupinum/trellis',
    },
    subCommands: {
      add: addCommand,
      bridge: bridgeCommand,
      doctor: doctorCommand,
      init: initCommand,
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
