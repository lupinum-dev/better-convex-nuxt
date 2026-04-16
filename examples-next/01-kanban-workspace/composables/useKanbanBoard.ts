import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'

import { api } from '#trellis/api'

export function useKanbanBoard(enabled: MaybeRefOrGetter<boolean>) {
  const boardArgs = computed(() => (toValue(enabled) ? {} : undefined))
  const {
    data: boardView,
    pending,
    error,
  } = useConvexQuery(api.boards.getCurrentBoard, boardArgs)

  const createCard = useConvexMutation(api.boards.createCard)
  const moveCard = useConvexMutation(api.boards.moveCard)
  const archiveBoard = useConvexMutation(api.boards.archiveBoard)

  const previewOpen = ref(false)
  const previewArgs = computed(() => {
    if (!previewOpen.value || !boardView.value?.board) return undefined
    return { id: boardView.value.board._id }
  })

  const {
    data: archivePreview,
    pending: archivePreviewPending,
    error: archivePreviewError,
  } = useConvexQuery(api.boards.previewArchiveBoard, previewArgs)

  async function addCard(input: { columnId: string; title: string }) {
    await createCard(input)
  }

  async function moveLeft(cardId: string) {
    await moveCard({ id: cardId, direction: 'left' })
  }

  async function moveRight(cardId: string) {
    await moveCard({ id: cardId, direction: 'right' })
  }

  async function confirmArchive() {
    const boardId = boardView.value?.board?._id
    if (!boardId) return
    await archiveBoard({ id: boardId })
    previewOpen.value = false
  }

  return {
    boardView,
    pending,
    error,
    createCard,
    moveCard,
    archiveBoard,
    addCard,
    moveLeft,
    moveRight,
    previewOpen,
    openArchivePreview: () => {
      previewOpen.value = true
    },
    closeArchivePreview: () => {
      previewOpen.value = false
    },
    archivePreview,
    archivePreviewPending,
    archivePreviewError,
    confirmArchive,
  }
}
