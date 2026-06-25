<script setup lang="ts">
import { api } from '#convex/api'

const props = defineProps<{
  teamId: string
}>()

const {
  results: teamAuditEvents,
  status: teamAuditStatus,
  loadMore: loadMoreTeamAudit,
} = await useConvexPaginatedQuery(
  api.audit.listForTeam,
  computed(() => ({ teamId: props.teamId })),
  {
    initialNumItems: 10,
  },
)
</script>

<template>
  <AuditPanel
    title="Team activity"
    :events="teamAuditEvents"
    :status="teamAuditStatus"
    :on-load-more="loadMoreTeamAudit"
  />
</template>
