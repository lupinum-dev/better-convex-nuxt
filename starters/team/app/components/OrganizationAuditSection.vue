<script setup lang="ts">
import { api } from '#convex/api'

const props = defineProps<{
  organizationId: string
}>()

const {
  results: orgAuditEvents,
  status: orgAuditStatus,
  loadMore: loadMoreOrgAudit,
} = await useConvexPaginatedQuery(
  api.audit.listForOrganization,
  {
    organizationId: props.organizationId,
  },
  {
    initialNumItems: 10,
  },
)
</script>

<template>
  <AuditPanel
    title="Organization activity"
    :events="orgAuditEvents"
    :status="orgAuditStatus"
    :on-load-more="loadMoreOrgAudit"
  />
</template>
