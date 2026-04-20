<script setup lang="ts">
import { api } from '#trellis/api'
import { pageCreate, pagePublish } from '~/convex/auth/permissions'
import { createPageInputSchema, saveDraftInputSchema } from '~/shared/schemas/page'

const { isAuthenticated, isPending, signOut, user } = useConvexAuth()
const { signIn, pending: signInPending, error: signInError } = useConvexSignIn()
const { signUp, pending: signUpPending, error: signUpError } = useConvexSignUp()
const { ready, allows } = usePermissions()

const email = ref('editor@example.com')
const password = ref('password1234')
const form = reactive({
  slug: 'welcome',
  title: 'Welcome',
  draftBody: 'Hello from the Trellis CMS starter.',
})
const selectedId = ref<string | null>(null)

const studioArgs = computed(() => (ready.value ? {} : undefined))
const { data: pages } = await useConvexQuery(api.domain.pages.listStudio, studioArgs)
const previewArgs = computed(() =>
  selectedId.value ? ({ id: selectedId.value as never }) : undefined,
)
const { data: publishPreview } = await useConvexQuery(api.domain.pages.previewPublish, previewArgs, {
  server: false,
  subscribe: false,
})

const createPage = useConvexMutation(api.domain.pages.create)
const saveDraft = useConvexMutation(api.domain.pages.save)
const publishPage = useConvexMutation(api.domain.pages.publish)

watchEffect(() => {
  const first = pages.value?.[0]
  if (!first || selectedId.value) return

  selectedId.value = first._id as string
  form.slug = first.slug
  form.title = first.title
  form.draftBody = first.draftBody
})

async function handleSignIn() {
  await signIn({
    email: email.value,
    password: password.value,
  })
}

async function handleSignUp() {
  await signUp({
    email: email.value,
    password: password.value,
    name: email.value.split('@')[0],
  })
}

async function handleCreatePage() {
  const parsed = createPageInputSchema.safeParse(form)
  if (!parsed.success) return

  const id = await createPage(parsed.data)
  selectedId.value = id as string
}

async function handleSaveDraft() {
  if (!selectedId.value) return
  const parsed = saveDraftInputSchema.safeParse({
    id: selectedId.value,
    slug: form.slug,
    title: form.title,
    draftBody: form.draftBody,
  })
  if (!parsed.success) return

  await saveDraft({
    ...parsed.data,
    id: parsed.data.id as never,
  })
}

async function handlePublish() {
  if (!selectedId.value) return
  await publishPage({
    id: selectedId.value as never,
  })
}
</script>

<template>
  <main style="max-width: 880px; margin: 0 auto; padding: 40px 16px; display: grid; gap: 20px;">
    <header style="display: grid; gap: 8px;">
      <h1>Studio</h1>
      <p>Draft, save, and publish through one Trellis-backed content module.</p>
    </header>

    <div v-if="isPending">Loading auth…</div>

    <div v-else-if="!isAuthenticated" style="display: grid; gap: 12px; max-width: 320px;">
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Password" />
      <div style="display: flex; gap: 8px;">
        <button :disabled="signInPending" @click="handleSignIn">Sign in</button>
        <button :disabled="signUpPending" @click="handleSignUp">Sign up</button>
      </div>
      <p v-if="signInError">{{ signInError.message }}</p>
      <p v-if="signUpError">{{ signUpError.message }}</p>
    </div>

    <div v-else-if="!ready">Waiting for permissions…</div>

    <div v-else style="display: grid; gap: 20px;">
      <p>Signed in as {{ user?.email ?? user?.name ?? 'editor' }}</p>

      <section style="display: grid; gap: 12px; max-width: 720px;">
        <input v-model="form.slug" type="text" placeholder="Slug" />
        <input v-model="form.title" type="text" placeholder="Title" />
        <textarea v-model="form.draftBody" rows="10" placeholder="Draft body"></textarea>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button :disabled="!allows(pageCreate).value || createPage.pending.value" @click="handleCreatePage">
            Create draft
          </button>
          <button :disabled="!selectedId || saveDraft.pending.value" @click="handleSaveDraft">
            Save draft
          </button>
          <button :disabled="!allows(pagePublish).value || !selectedId || publishPage.pending.value" @click="handlePublish">
            Publish
          </button>
          <button @click="signOut()">Sign out</button>
        </div>
      </section>

      <section v-if="publishPreview" style="display: grid; gap: 4px;">
        <strong>Publish preview</strong>
        <p>{{ publishPreview.display.summary }}</p>
        <p v-if="publishPreview.display.warn">{{ publishPreview.display.warn }}</p>
      </section>

      <section style="display: grid; gap: 8px;">
        <h2>Your pages</h2>
        <ul style="display: grid; gap: 8px; padding-left: 20px;">
          <li v-for="page in pages ?? []" :key="page._id">
            <button
              style="all: unset; cursor: pointer; text-decoration: underline;"
              @click="
                selectedId = page._id as string
                form.slug = page.slug
                form.title = page.title
                form.draftBody = page.draftBody
              "
            >
              {{ page.title }} · {{ page.status }}
            </button>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
