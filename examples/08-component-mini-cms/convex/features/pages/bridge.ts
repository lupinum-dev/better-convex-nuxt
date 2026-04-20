import { createComponentBridge } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import {
  createPage,
  getPublishedPage,
  listDraftPages,
  listPublishedPages,
  listStudioPages,
  publishPage,
  publishPreviewValidator,
  publishedPageValidator,
  saveDraft,
  studioPageValidator,
} from '../../../shared/features/pages/contract'
import { components } from '../../_generated/api'
import { internalMutation, internalQuery, mutation, query } from '../../_generated/server'
import { principal } from '../../auth/principal'

const miniCmsComponents = components.miniCms.features.pages

const bridge = createComponentBridge(
  {
    query,
    mutation,
    internalQuery,
    internalMutation,
  },
  {
    principal,
  },
)

const miniCmsBridge = bridge.from({
  listPublished: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.listPublished,
    args: listPublishedPages.args,
    returns: v.array(publishedPageValidator),
  },
  getPublished: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.getPublished,
    args: getPublishedPage.args,
    returns: v.union(publishedPageValidator, v.null()),
  },
  listStudio: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.listStudio,
    args: listStudioPages.args,
    returns: v.array(studioPageValidator),
  },
  listDraft: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.listDraft,
    args: listDraftPages.args,
    returns: v.array(studioPageValidator),
  },
  create: {
    operation: 'internalMutation',
    component: miniCmsComponents.domain.create,
    args: createPage.args,
    returns: v.string(),
  },
  save: {
    operation: 'internalMutation',
    component: miniCmsComponents.domain.save,
    args: saveDraft.args,
    returns: v.null(),
  },
  publish: {
    operation: 'internalMutation',
    component: miniCmsComponents.domain.publish,
    args: publishPage.args,
    returns: v.object({
      pageId: v.string(),
      published: v.boolean(),
    }),
  },
  previewPublish: {
    operation: 'internalQuery',
    component: miniCmsComponents.operations.previewPublish,
    args: publishPage.args,
    returns: v.object({
      display: publishPreviewValidator,
      confirm: v.object({
        operation: v.literal('pages.publish'),
        targetId: v.string(),
        affectedCounts: v.object({
          pages: v.number(),
        }),
      }),
    }),
  },
})

export const {
  listPublished,
  getPublished,
  listStudio,
  listDraft,
  create,
  save,
  publish,
  previewPublish,
} = miniCmsBridge
