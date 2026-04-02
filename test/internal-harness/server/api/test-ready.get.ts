import { defineEventHandler } from 'h3'

export default defineEventHandler(() => {
  return {
    ok: true,
    service: 'internal-harness',
  }
})
