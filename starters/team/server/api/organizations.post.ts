import { defineEventHandler } from 'h3'

import { callBetterAuth, readJsonObject, readTrimmedString } from '../utils/management'

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'organization'}-${Date.now().toString(36)}`
}

export default defineEventHandler(async (event) => {
  const body = await readJsonObject(event)
  const name = readTrimmedString(body, 'name', 'Organization name is required')

  const result = await callBetterAuth(event, '/organization/create', {
    name,
    slug: slugify(name),
  })

  return result.data
})
