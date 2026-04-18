<template>
  <section class="column card stack">
    <header class="stack-sm">
      <div class="split">
        <div class="stack-sm">
          <div class="cluster">
            <h3>{{ column.title }}</h3>
            <span class="chip">{{ column.cards.length }}</span>
          </div>
        </div>

        <div v-if="canManageBoardStructure" class="card-actions">
          <button
            type="button"
            class="btn btn--ghost btn--sm btn--icon"
            aria-label="Move column earlier"
            title="Move column earlier"
            :disabled="pending || columnIndex === 0"
            @click="$emit('moveColumnEarlier', column._id)"
          >
            ←
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm btn--icon"
            aria-label="Move column later"
            title="Move column later"
            :disabled="pending || columnIndex === columnCount - 1"
            @click="$emit('moveColumnLater', column._id)"
          >
            →
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="pending"
            @click="$emit('renameColumn', column._id)"
          >
            Rename
          </button>
        </div>
      </div>
    </header>

    <form v-if="canWriteCards" class="stack-sm" @submit.prevent="submit">
      <label>
        <span>New card</span>
        <input v-model="title" type="text" placeholder="Card title" required />
      </label>
      <div>
        <button
          type="submit"
          class="btn btn--primary btn--sm"
          :disabled="pending || !title.trim()"
        >
          Add card
        </button>
      </div>
    </form>

    <ul v-if="column.cards.length > 0" class="card-list">
      <li v-for="(card, index) in column.cards" :key="card._id" class="card stack-sm">
        <strong>{{ card.title }}</strong>
        <p v-if="card.description" class="meta">{{ card.description }}</p>

        <div v-if="canWriteCards" class="card-actions">
          <button
            type="button"
            class="btn btn--ghost btn--sm btn--icon"
            aria-label="Move card up"
            title="Move card up"
            :disabled="pending || index === 0"
            @click="$emit('moveCardUp', card._id)"
          >
            ↑
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm btn--icon"
            aria-label="Move card down"
            title="Move card down"
            :disabled="pending || index === column.cards.length - 1"
            @click="$emit('moveCardDown', card._id)"
          >
            ↓
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="pending"
            @click="$emit('renameCard', card._id)"
          >
            Edit
          </button>
        </div>

        <details v-if="canWriteCards && otherColumns.length > 0" class="stack-sm">
          <summary class="meta">Move to another column…</summary>
          <div class="stack-sm">
            <div
              v-for="targetColumn in otherColumns"
              :key="targetColumn._id"
              class="stack-sm move-target"
            >
              <label>
                <span class="meta">{{ targetColumn.title }}</span>
                <select
                  v-model="moveTargets[moveTargetKey(card._id, targetColumn._id)]"
                  :disabled="pending"
                >
                  <option value="">At end</option>
                  <option
                    v-for="targetCard in targetColumn.cards"
                    :key="targetCard._id"
                    :value="targetCard._id"
                  >
                    Before {{ targetCard.title }}
                  </option>
                </select>
              </label>
              <div>
                <button
                  type="button"
                  class="btn btn--sm"
                  :disabled="pending"
                  @click="
                    $emit('moveCardToColumn', {
                      cardId: card._id,
                      toColumnId: targetColumn._id,
                      beforeCardId:
                        moveTargets[moveTargetKey(card._id, targetColumn._id)] || undefined,
                    })
                  "
                >
                  Move to {{ targetColumn.title }}
                </button>
              </div>
            </div>
          </div>
        </details>
      </li>
    </ul>

    <div v-else class="empty-state">
      <span class="empty-state__title">No cards yet</span>
      <span v-if="canWriteCards" class="empty-state__hint">Add one with the form above.</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Id } from '../convex/_generated/dataModel'
import { computed, reactive, ref } from 'vue'

const props = defineProps<{
  column: {
    _id: Id<'columns'>
    title: string
    cards: Array<{ _id: Id<'cards'>; title: string; description?: string }>
  }
  allColumns: Array<{
    _id: Id<'columns'>
    title: string
    cards: Array<{ _id: Id<'cards'>; title: string }>
  }>
  columnIndex: number
  columnCount: number
  canManageBoardStructure: boolean
  canWriteCards: boolean
  pending: boolean
}>()

const emit = defineEmits<{
  createCard: [{ columnId: Id<'columns'>; title: string }]
  renameColumn: [columnId: Id<'columns'>]
  moveColumnEarlier: [columnId: Id<'columns'>]
  moveColumnLater: [columnId: Id<'columns'>]
  renameCard: [cardId: Id<'cards'>]
  moveCardUp: [cardId: Id<'cards'>]
  moveCardDown: [cardId: Id<'cards'>]
  moveCardToColumn: [
    { cardId: Id<'cards'>; toColumnId: Id<'columns'>; beforeCardId?: Id<'cards'> },
  ]
}>()

const title = ref('')
const moveTargets = reactive<Record<string, Id<'cards'> | ''>>({})

const otherColumns = computed(() =>
  props.allColumns.filter((targetColumn) => targetColumn._id !== props.column._id),
)

function moveTargetKey(cardId: Id<'cards'>, columnId: Id<'columns'>) {
  return `${cardId}:${columnId}`
}

function submit() {
  const nextTitle = title.value.trim()
  if (!nextTitle) return
  emit('createCard', { columnId: props.column._id, title: nextTitle })
  title.value = ''
}
</script>
