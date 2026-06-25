<script setup lang="ts">
defineProps<{
  approvals: Array<{
    id: string
    operation: string
    resourceId: string
    status: string
    requestedReason: string | null
    resourceLabel: string
    expiresAtLabel: string
  }>
  actionBusy: boolean
}>()

defineEmits<{
  approve: [approvalRequestId: string]
  reject: [approvalRequestId: string]
}>()
</script>

<template>
  <section class="panel approvals-panel">
    <div class="panel-heading">
      <span class="step">C</span>
      <div>
        <h3>Pending approvals</h3>
        <p>Human admins approve destructive MCP requests inside the app.</p>
      </div>
    </div>

    <ul v-if="approvals.length" class="item-list" data-testid="approval-list">
      <li v-for="approval in approvals" :key="approval.id">
        <div>
          <strong>Delete project "{{ approval.resourceLabel }}"</strong>
          <span> {{ approval.operation }} · expires {{ approval.expiresAtLabel }} </span>
          <span v-if="approval.requestedReason">{{ approval.requestedReason }}</span>
        </div>
        <div class="inline-actions">
          <button
            class="secondary-button"
            :data-testid="`reject-approval-${approval.id}`"
            :disabled="actionBusy"
            type="button"
            @click="$emit('reject', approval.id)"
          >
            Reject
          </button>
          <button
            class="primary-button"
            :data-testid="`approve-approval-${approval.id}`"
            :disabled="actionBusy"
            type="button"
            @click="$emit('approve', approval.id)"
          >
            Approve
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="empty-state" data-testid="empty-approvals">No pending approvals.</p>
  </section>
</template>
