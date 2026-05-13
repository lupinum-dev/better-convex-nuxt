import { createComponentBridge } from '@lupinum/trellis-bridge/component'
import { operationPreviewValidator } from '@lupinum/trellis/backend'
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
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from '../../_generated/server'
import { caller } from '../../auth/caller'

const miniCmsComponents = components.miniCms.features.pages

const bridge = createComponentBridge(
  {
    action,
    internalAction,
    query,
    mutation,
    internalQuery,
    internalMutation,
  },
  {
    caller,
  },
)

const miniCmsBridge = bridge.from({
  listPublished: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.listPublished,
    functionRef: 'features/pages/domain:listPublished',
    args: listPublishedPages.args,
    returns: v.array(publishedPageValidator),
  },
  getPublished: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.getPublished,
    functionRef: 'features/pages/domain:getPublished',
    args: getPublishedPage.args,
    returns: v.union(publishedPageValidator, v.null()),
  },
  listStudio: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.listStudio,
    functionRef: 'features/pages/domain:listStudio',
    args: listStudioPages.args,
    returns: v.array(studioPageValidator),
  },
  listDraft: {
    operation: 'internalQuery',
    component: miniCmsComponents.domain.listDraft,
    functionRef: 'features/pages/domain:listDraft',
    args: listDraftPages.args,
    returns: v.array(studioPageValidator),
  },
  create: {
    operation: 'internalMutation',
    component: miniCmsComponents.domain.create,
    functionRef: 'features/pages/domain:create',
    args: createPage.args,
    returns: v.string(),
  },
  save: {
    operation: 'internalMutation',
    component: miniCmsComponents.domain.save,
    functionRef: 'features/pages/domain:save',
    args: saveDraft.args,
    returns: v.null(),
  },
  publish: {
    operation: 'internalMutation',
    component: miniCmsComponents.domain.publish,
    functionRef: 'features/pages/domain:publish',
    forwardingPurpose: 'operation-execute',
    args: publishPage.args,
    returns: v.object({
      pageId: v.string(),
      published: v.boolean(),
    }),
  },
  previewPublish: {
    operation: 'internalQuery',
    component: miniCmsComponents.operations.previewPublish,
    functionRef: 'features/pages/operations:previewPublish',
    args: publishPage.args,
    returns: operationPreviewValidator({
      details: publishPreviewValidator,
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
