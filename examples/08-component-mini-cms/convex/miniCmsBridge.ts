import { createComponentBridge } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { components } from './_generated/api'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { principal } from './auth/principal'
import {
  createPage,
  listDraftPages,
  listPublishedPages,
  publishPage,
  publishPreviewValidator,
  publishedPageValidator,
  saveDraft,
  studioPageValidator,
} from '../shared/schemas/page'

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
    returns: publishPreviewValidator,
  },
})

export const {
  listPublishedPagesBridge,
  listDraftPagesBridge,
  createPageBridge,
  saveDraftBridge,
  publishPageBridge,
  previewPublishPageBridge,
} = miniCmsBridge

export {
  createPageBridge as createPage,
  listDraftPagesBridge as listDraftPages,
  listPublishedPagesBridge as listPublishedPages,
  previewPublishPageBridge as previewPublishPage,
  publishPageBridge as publishPage,
  saveDraftBridge as saveDraft,
}
