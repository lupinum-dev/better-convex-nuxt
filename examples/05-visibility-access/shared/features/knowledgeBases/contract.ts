import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const knowledgeBaseStatusValidator = v.union(v.literal('draft'), v.literal('published'))

export const listKnowledgeBases = defineArgs({
  description: 'List the knowledge bases in the current workspace.',
  args: {},
})

export const getKnowledgeBase = defineArgs({
  description: 'Load one knowledge base in the current workspace.',
  args: {
    id: v.id('knowledgeBases'),
  },
})

export const createKnowledgeBase = defineArgs({
  description: 'Create a new knowledge base.',
  args: {
    title: v.string(),
  },
})

export const publishKnowledgeBase = defineArgs({
  description: 'Publish a knowledge base.',
  args: {
    id: v.id('knowledgeBases'),
  },
})

export const enrollKnowledgeBaseUser = defineArgs({
  description: 'Enroll a user in one knowledge base.',
  args: {
    knowledgeBaseId: v.id('knowledgeBases'),
    userId: v.id('users'),
  },
})

export const enrollKnowledgeBaseUserByEmail = defineArgs({
  description: 'Enroll a user in one knowledge base by email address.',
  args: {
    knowledgeBaseId: v.id('knowledgeBases'),
    email: v.string(),
  },
})
