<template>
  <section class="column stack">
    <header class="stack">
      <div class="split">
        <div class="stack-sm">
          <h3>{{ column.title }}</h3>
          <p class="meta">{{ column.cards.length }} cards</p>
        </div>

        <div v-if="canManageBoardStructure" class="card-actions">
          <button type="button" :disabled="pending || columnIndex === 0" @click="$emit('moveColumnEarlier', column._id)">
            Earlier
          </button>
          <button
            type="button"
            :disabled="pending || columnIndex === columnCount - 1"
            @click="$emit('moveColumnLater', column._id)"
          >
            Later
          </button>
          <button type="button" :disabled="pending" @click="$emit('renameColumn', column._id)">
            Rename
          </button>
        </div>
      </div>
    </header>

    <form v-if="canWriteCards" class="stack" @submit.prevent="submit">
      <label>
        <span>New card</span>
        <input v-model="title" type="text" required />
      </label>
      <button type="submit" :disabled="pending || !title.trim()">Add card</button>
    </form>

    <ul class="card-list">
      <li v-for="(card, index) in column.cards" :key="card._id" class="card stack">
        <strong>{{ card.title }}</strong>
        <p v-if="card.description" class="meta">{{ card.description }}</p>

        <div v-if="canWriteCards" class="card-actions">
          <button type="button" :disabled="pending || index === 0" @click="$emit('moveCardUp', card._id)">
            Up
          </button>
          <button
            type="button"
            :disabled="pending || index === column.cards.length - 1"
            @click="$emit('moveCardDown', card._id)"
          >
            Down
          </button>
          <button type="button" :disabled="pending" @click="$emit('renameCard', card._id)">
            Edit
          </button>
        </div>

        <div v-if="canWriteCards" class="cluster">
          <div v-for="targetColumn in otherColumns" :key="targetColumn._id" class="stack-sm move-target">
            <strong class="meta">Move to {{ targetColumn.title }}</strong>
            <label>
              <span class="meta">Place card</span>
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
            <button
              type="button"
              :disabled="pending"
              @click="
                $emit('moveCardToColumn', {
                  cardId: card._id,
                  toColumnId: targetColumn._id,
                  beforeCardId: moveTargets[moveTargetKey(card._id, targetColumn._id)] || undefined,
                })
              "
            >
              Move
            </button>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="column.cards.length === 0" class="empty meta">No cards.</p>
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
