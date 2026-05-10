import { defineArgs } from '@lupinum/trellis/args'

export const generateUploadUrl = defineArgs({
  description: 'Create a storage upload URL before a concrete tenant record exists.',
  args: {},
})
