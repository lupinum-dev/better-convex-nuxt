#!/usr/bin/env node

import { runCli } from './cli/main.js'

const exitCode = await runCli(process.argv.slice(2))

if (typeof exitCode === 'number') {
  process.exitCode = exitCode
}
