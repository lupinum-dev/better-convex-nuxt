import { openai } from '@ai-sdk/openai'
import { Agent, createThread, stepCountIs } from '@convex-dev/agent'
import { v } from 'convex/values'

import { api, components } from './_generated/api'
import { action } from './_generated/server'

const draftingAgent = new Agent(components.agent, {
  name: 'Drafting Agent',
  languageModel: openai.chat('gpt-4o-mini'),
  instructions: 'Create concise, reviewable drafts. Never claim a draft is approved or canonical.',
  stopWhen: stepCountIs(3),
})

export const createDraftFromPrompt = action({
  args: {
    organizationId: v.id('organizations'),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const threadId = await createThread(ctx, components.agent)
    const result = await draftingAgent.generateText(ctx, { threadId }, { prompt: args.prompt })

    const draftId = await ctx.runMutation(api.drafts.createFromAgent, {
      organizationId: args.organizationId,
      title: args.prompt.slice(0, 80),
      body: result.text,
      sourceThreadId: threadId,
    })

    return { threadId, draftId }
  },
})
