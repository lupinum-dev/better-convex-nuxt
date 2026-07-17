#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const SECURITY_NOTIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000

function normalizedName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateSecurityGovernance(input, now = new Date()) {
  const failures = []
  const owner = normalizedName(input?.owner)
  const deputy = normalizedName(input?.deputy)
  const nowMilliseconds = now instanceof Date ? now.getTime() : Number(now)

  if (!Number.isFinite(nowMilliseconds)) throw new Error('governance validation clock is invalid')
  if (!owner) failures.push('BCN_SECURITY_OWNER must name the current Security Owner')
  if (!deputy) failures.push('BCN_SECURITY_DEPUTY must name the current Security Owner deputy')
  if (owner && deputy && owner.toLowerCase() === deputy.toLowerCase()) {
    failures.push('BCN Security Owner and deputy must be distinct people')
  }

  const testedAtValue =
    typeof input?.notificationTestedAt === 'string' ? input.notificationTestedAt.trim() : ''
  const testedAt = testedAtValue ? Date.parse(testedAtValue) : Number.NaN
  if (!Number.isFinite(testedAt)) {
    failures.push('BCN_SECURITY_NOTIFICATION_TESTED_AT must be a valid delivery-test timestamp')
  } else if (testedAt > nowMilliseconds) {
    failures.push('security notification delivery-test timestamp must not be in the future')
  } else if (nowMilliseconds - testedAt > SECURITY_NOTIFICATION_MAX_AGE_MS) {
    failures.push('security notification delivery-test timestamp must be no older than 30 days')
  }

  return failures
}

export function validatePrereleaseIdentity(releaseTag, packageVersion) {
  if (
    typeof releaseTag !== 'string' ||
    typeof packageVersion !== 'string' ||
    releaseTag !== `v${packageVersion}` ||
    !packageVersion.includes('-')
  ) {
    return ['tag must exactly match a prerelease package version']
  }
  return []
}

function parseArguments(arguments_) {
  const prerelease = arguments_.includes('--prerelease')
  const unknown = arguments_.filter((argument) => argument !== '--prerelease')
  if (unknown.length > 0) throw new Error(`unknown governance-check option: ${unknown[0]}`)
  return { prerelease }
}

function run() {
  const { prerelease } = parseArguments(process.argv.slice(2))
  const failures = validateSecurityGovernance({
    deputy: process.env.BCN_SECURITY_DEPUTY,
    notificationTestedAt: process.env.BCN_SECURITY_NOTIFICATION_TESTED_AT,
    owner: process.env.BCN_SECURITY_OWNER,
  })

  if (prerelease) {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
    failures.push(...validatePrereleaseIdentity(process.env.RELEASE_TAG, packageJson.version))
  }

  if (failures.length > 0) {
    console.error(`Security governance check failed with ${failures.length} issue(s):`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }
  console.log('Security governance metadata check passed.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run()
