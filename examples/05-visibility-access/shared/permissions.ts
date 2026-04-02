export const knowledgeBasePermissionKeys = {
  kbCreate: 'kb.create',
  kbRead: 'kb.read',
  articleCreate: 'article.create',
  articleRead: 'article.read',
  enrollmentManage: 'enrollment.manage',
  shareCreate: 'share.create',
} as const

export type KnowledgeBasePermissionKey =
  (typeof knowledgeBasePermissionKeys)[keyof typeof knowledgeBasePermissionKeys]

export type KnowledgeBasePermissionMap = Record<KnowledgeBasePermissionKey, boolean>
