<script setup lang="ts">
import { api } from '~/convex/_generated/api'
/**
 * Why this file exists:
 * The task detail page needs one place where comments, uploads, and nested permissions meet.
 * Keeping that flow in its own component makes the page easier to read.
 */
import type { Id } from '~/convex/_generated/dataModel'
import { saasPermissionKeys } from '~/shared/permissions'

const props = defineProps<{
  taskId: Id<'tasks'>
}>()

const { can } = usePermissions()
const body = ref('')
const attachmentStorageId = ref<Id<'_storage'> | null>(null)
const createComment = useConvexMutation(api.comments.create)
const canCreateComment = can(saasPermissionKeys.commentCreate)

const {
  data: comments,
  pending,
  error,
} = await useConvexQuery(
  api.comments.listByTask,
  computed(() => ({ taskId: props.taskId })),
)

async function handleSubmit() {
  await createComment({
    taskId: props.taskId,
    body: body.value,
    attachmentStorageId: attachmentStorageId.value ?? undefined,
  })

  body.value = ''
  attachmentStorageId.value = null
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">Comments</h3>
      <span v-if="pending" class="text-sm text-muted">Loading…</span>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="error.message"
    />

    <div class="space-y-3">
      <div
        v-for="comment in comments || []"
        :key="comment._id"
        class="rounded-xl border border-default p-3"
      >
        <p>{{ comment.body }}</p>
        <p class="text-sm text-muted mt-2">
          by {{ comment.ownerId }}
          <span v-if="comment.attachmentStorageId"> · attachment saved</span>
        </p>
      </div>
    </div>

    <form v-if="canCreateComment" class="space-y-3" @submit.prevent="handleSubmit">
      <div class="space-y-1">
        <label class="text-sm font-medium text-highlighted">New comment</label>
        <UTextarea
          v-model="body"
          data-testid="comment-body"
          :rows="4"
          placeholder="Add context for the team"
          required
        />
      </div>

      <FileAttachment v-model="attachmentStorageId" />

      <UButton
        data-testid="comment-submit"
        type="submit"
        :loading="createComment.pending.value"
        leading-icon="i-lucide-message-square-plus"
      >
        Add comment
      </UButton>
    </form>
  </div>
</template>
