<script setup lang="ts">
/**
 * Why this file exists:
 * The task detail page needs one place where comments, uploads, and nested permissions meet.
 * Keeping that flow in its own component makes the page easier to read.
 */
import type { Id } from '~/convex/_generated/dataModel'
import { api } from '~/convex/_generated/api'

const props = defineProps<{
  taskId: Id<'tasks'>
}>()

const { can } = usePermissions()
const body = ref('')
const attachmentStorageId = ref<Id<'_storage'> | null>(null)
const createComment = useConvexMutation(api.comments.create)
const canCreateComment = can('comment.create')

const { data: comments, pending, error } = await useConvexQuery(
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
  <section class="thread">
    <header class="thread-header">
      <h3>Comments</h3>
      <span v-if="pending">Loading…</span>
    </header>

    <p v-if="error" class="error">{{ error.message }}</p>

    <ul class="comments">
      <li v-for="comment in comments || []" :key="comment._id" class="comment">
        <p class="body">{{ comment.body }}</p>
        <p class="meta">
          by {{ comment.ownerId }}
          <span v-if="comment.attachmentStorageId"> · attachment saved</span>
        </p>
      </li>
    </ul>

    <form v-if="canCreateComment" class="composer" @submit.prevent="handleSubmit">
      <label class="field">
        <span>New comment</span>
        <textarea
          v-model="body"
          data-testid="comment-body"
          rows="4"
          class="input"
          placeholder="Add context for the team"
          required
        />
      </label>

      <FileAttachment v-model="attachmentStorageId" />

      <button
        data-testid="comment-submit"
        class="button"
        type="submit"
        :disabled="createComment.pending.value"
      >
        {{ createComment.pending.value ? 'Saving…' : 'Add comment' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.thread {
  display: grid;
  gap: 1rem;
}

.thread-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.comments {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.comment {
  padding: 0.85rem 1rem;
  border: 1px solid #dbe4ef;
  border-radius: 16px;
}

.body,
.meta {
  margin: 0;
}

.meta {
  margin-top: 0.4rem;
  color: #667085;
  font-size: 0.85rem;
}

.composer {
  display: grid;
  gap: 0.75rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.error {
  margin: 0;
  color: #b42318;
}
</style>
