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
} from '../../shared/schemas/page'
import { components } from '../_generated/api'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { principal } from '../auth/principal'

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
  listPublishedPagesBridge: {
    operation: 'internalQuery',
    component: components.miniCms.pages.listPublishedPages,
    args: listPublishedPages.args,
    returns: v.array(publishedPageValidator),
  },
  getPublishedPageBridge: {
    operation: 'internalQuery',
    component: components.miniCms.pages.getPublishedPage,
    args: getPublishedPage.args,
    returns: v.union(publishedPageValidator, v.null()),
  },
  listStudioPagesBridge: {
    operation: 'internalQuery',
    component: components.miniCms.pages.listStudioPages,
    args: listStudioPages.args,
    returns: v.array(studioPageValidator),
  },
  listDraftPagesBridge: {
    operation: 'internalQuery',
    component: components.miniCms.pages.listDraftPages,
    args: listDraftPages.args,
    returns: v.array(studioPageValidator),
  },
  createPageBridge: {
    operation: 'internalMutation',
    component: components.miniCms.pages.createPage,
    args: createPage.args,
    returns: v.string(),
  },
  saveDraftBridge: {
    operation: 'internalMutation',
    component: components.miniCms.pages.saveDraft,
    args: saveDraft.args,
    returns: v.null(),
  },
  publishPageBridge: {
    operation: 'internalMutation',
    component: components.miniCms.pages.publishPage,
    args: publishPage.args,
    returns: v.object({
      pageId: v.string(),
      published: v.boolean(),
    }),
  },
  previewPublishPageBridge: {
    operation: 'internalQuery',
    component: components.miniCms.pages.previewPublishPage,
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
  listPublishedPagesBridge,
  getPublishedPageBridge,
  listStudioPagesBridge,
  listDraftPagesBridge,
  createPageBridge,
  saveDraftBridge,
  publishPageBridge,
  previewPublishPageBridge,
} = miniCmsBridge

export {
  createPageBridge as createPage,
  getPublishedPageBridge as getPublishedPage,
  listDraftPagesBridge as listDraftPages,
  listPublishedPagesBridge as listPublishedPages,
  listStudioPagesBridge as listStudioPages,
  previewPublishPageBridge as previewPublishPage,
  publishPageBridge as publishPage,
  saveDraftBridge as saveDraft,
}
