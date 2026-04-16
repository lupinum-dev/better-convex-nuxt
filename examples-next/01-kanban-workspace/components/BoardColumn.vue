<template>
  <section class="column stack">
    <header class="stack">
      <h3>{{ column.title }}</h3>
      <p class="meta">{{ cards.length }} cards</p>
    </header>

    <form v-if="canCreateCards" class="stack" @submit.prevent="submit">
      <label>
        <span>New card</span>
        <input v-model="title" type="text" required />
      </label>
      <button type="submit" :disabled="pending || !title.trim()">Add card</button>
    </form>

    <ul class="card-list">
      <li v-for="card in cards" :key="card._id" class="stack">
        <strong>{{ card.title }}</strong>
        <div class="card-actions" v-if="canMoveCards">
          <button
            type="button"
            :disabled="pending || !canMoveLeft"
            @click="$emit('moveLeft', card._id)"
          >
            Move left
          </button>
          <button
            type="button"
            :disabled="pending || !canMoveRight"
            @click="$emit('moveRight', card._id)"
          >
            Move right
          </button>
        </div>
      </li>
    </ul>

    <p v-if="cards.length === 0" class="empty meta">No cards.</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  column: { _id: string; title: string }
  cards: Array<{ _id: string; title: string }>
  canCreateCards: boolean
  canMoveCards: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
  pending: boolean
}>()

const emit = defineEmits<{
  createCard: [{ columnId: string; title: string }]
  moveLeft: [cardId: string]
  moveRight: [cardId: string]
}>()

const title = ref('')

function submit() {
  const next = title.value.trim()
  if (!next) return
  emit('createCard', { columnId: props.column._id, title: next })
  title.value = ''
}
</script>
