<template>
  <div class="mini-shell">
    <div class="mini-frame space-y-6">
      <header class="mini-hero">
        <p class="mini-kicker">Studio</p>
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div class="space-y-3 max-w-3xl">
            <p class="mini-kicker">Example 08</p>
            <h1 class="text-5xl font-semibold">Drafts live inside the component</h1>
            <p class="text-lg text-[var(--mini-muted)]">
              The architecture branch: the browser hits root app wrappers, those wrappers resolve
              the caller from Better Auth, then forward it into the local component.
            </p>
          </div>

          <UButton to="/" color="neutral" variant="soft" trailing-icon="i-lucide-arrow-left">
            Back to public site
          </UButton>
        </div>
      </header>

      <section class="mini-panel p-5">
        <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div class="space-y-2">
            <h2 class="text-2xl font-semibold">Boundary flow</h2>
            <p class="text-sm text-[var(--mini-muted)]">
              Browser users become <span class="mini-code">user</span> principals via Better Auth,
              then the root app forwards that caller into the component wrapper.
            </p>
            <p class="text-sm text-[var(--mini-muted)]">
              MCP is secondary in this example. Agent access requires a server-only
              <span class="mini-code">DEMO_MCP_TOKEN</span>; anonymous MCP callers can only read
              published pages.
            </p>
          </div>

          <div v-if="isAuthenticated" class="flex flex-col gap-2 text-sm text-right">
            <span class="mini-code">{{
              sessionUser?.email || sessionUser?.displayName || 'editor'
            }}</span>
            <UButton color="neutral" variant="ghost" @click="handleSignOut">Sign out</UButton>
          </div>
        </div>
      </section>

      <section class="mini-panel p-5">
        <div class="grid gap-3 lg:grid-cols-4">
          <div class="rounded-2xl border border-default p-4">
            <p class="mini-kicker">Browser auth</p>
            <p class="mt-2 text-sm text-[var(--mini-muted)]">
              Better Auth resolves the browser caller into a root-app caller.
            </p>
          </div>
          <div class="rounded-2xl border border-default p-4">
            <p class="mini-kicker">Root wrappers</p>
            <p class="mt-2 text-sm text-[var(--mini-muted)]">
              The host app exposes manual wrappers instead of treating the component as ambient.
            </p>
          </div>
          <div class="rounded-2xl border border-default p-4">
            <p class="mini-kicker">Component appIdentity</p>
            <p class="mt-2 text-sm text-[var(--mini-muted)]">
              The component receives the forwarded caller and decides whether that becomes viewer,
              editor, or agent behavior.
            </p>
          </div>
          <div class="rounded-2xl border border-default p-4">
            <p class="mini-kicker">Projected outward</p>
            <p class="mt-2 text-sm text-[var(--mini-muted)]">
              MCP reuses the same bridge-backed operations after the boundary is already clear.
            </p>
          </div>
        </div>
      </section>

      <div v-if="isPending" class="mini-panel p-6 space-y-3">
        <p class="text-sm text-[var(--mini-muted)]">Checking your session…</p>
        <USkeleton class="h-24 w-full rounded-2xl" />
      </div>

      <div v-else-if="!isAuthenticated" class="grid gap-4 md:grid-cols-2">
        <UCard class="mini-panel">
          <UAuthForm
            :schema="signUpSchema"
            title="Create editor account"
            description="This is the browser side of the caller-first flow."
            icon="i-lucide-user-plus"
            :fields="signUpFields"
            :submit="{ label: 'Sign up', block: true }"
            :loading="authAction.pending.value"
            @submit="handleSignUp"
          >
            <template #validation>
              <UAlert
                v-if="authAction.error.value"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                title="Authentication error"
                :description="authAction.error.value.message"
              />
            </template>
          </UAuthForm>
        </UCard>

        <UCard class="mini-panel">
          <UAuthForm
            :schema="signInSchema"
            title="Sign in"
            description="Once signed in, the root wrapper forwards your caller into the component."
            icon="i-lucide-log-in"
            :fields="signInFields"
            :submit="{ label: 'Sign in', block: true, color: 'neutral', variant: 'soft' }"
            :loading="authAction.pending.value"
            @submit="handleSignIn"
          >
            <template #validation>
              <UAlert
                v-if="authAction.error.value"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                title="Authentication error"
                :description="authAction.error.value.message"
              />
            </template>
          </UAuthForm>
        </UCard>
      </div>

      <div v-else class="mini-grid">
        <section class="mini-panel p-5">
          <div class="space-y-4">
            <div>
              <h2 class="text-2xl font-semibold">Page inventory</h2>
              <p class="mt-2 text-sm text-[var(--mini-muted)]">
                Studio list is a manual root query wrapper, not a projection tool.
              </p>
            </div>

            <UAlert
              v-if="uiError"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              title="Editor error"
              :description="uiError"
            />

            <form
              class="space-y-3 rounded-2xl border border-default p-4"
              @submit.prevent="handleCreatePage"
            >
              <div class="grid gap-3 md:grid-cols-2">
                <UInput v-model="createForm.title" placeholder="New page title" required />
                <UInput v-model="createForm.slug" placeholder="new-page-slug" required />
              </div>
              <UButton
                type="submit"
                :loading="createPageMutation.pending.value"
                leading-icon="i-lucide-plus"
              >
                Create draft
              </UButton>
            </form>

            <div v-if="pagesPending" class="space-y-3">
              <USkeleton v-for="n in 3" :key="n" class="h-20 w-full rounded-2xl" />
            </div>

            <div v-else-if="pages?.length" class="space-y-3">
              <button
                v-for="page in pages"
                :key="page._id"
                class="mini-list-item block w-full text-left"
                :data-active="page._id === selectedId"
                @click="selectedId = page._id"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-lg font-semibold">{{ page.title }}</p>
                    <p class="mt-1 text-sm text-[var(--mini-muted)]">/{{ page.slug }}</p>
                  </div>
                  <UBadge
                    :color="page.status === 'published' ? 'success' : 'neutral'"
                    variant="soft"
                  >
                    {{ page.status }}
                  </UBadge>
                </div>
              </button>
            </div>

            <p v-else class="text-sm text-[var(--mini-muted)]">
              Create the first draft to start editing.
            </p>
          </div>
        </section>

        <section class="mini-panel p-6">
          <template v-if="selectedPage">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="mini-kicker">Selected draft</p>
                <h2 class="mt-2 text-3xl font-semibold">{{ selectedPage.title }}</h2>
              </div>
              <UBadge
                :color="selectedPage.status === 'published' ? 'success' : 'neutral'"
                variant="soft"
              >
                {{ selectedPage.status }}
              </UBadge>
            </div>

            <form class="mt-6 space-y-4" @submit.prevent="handleSaveDraft">
              <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <label class="text-sm font-medium">Title</label>
                  <UInput v-model="editorForm.title" required />
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-medium">Slug</label>
                  <UInput v-model="editorForm.slug" required />
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium">Draft body</label>
                <UTextarea v-model="editorForm.draftBody" :rows="12" autoresize />
              </div>

              <div class="flex flex-col gap-3 md:flex-row">
                <UButton
                  type="submit"
                  :loading="saveDraftMutation.pending.value"
                  leading-icon="i-lucide-save"
                >
                  Save draft
                </UButton>
                <UButton
                  type="button"
                  color="primary"
                  variant="soft"
                  :loading="publishPageMutation.pending.value"
                  leading-icon="i-lucide-rocket"
                  @click="handlePublish"
                >
                  Publish page
                </UButton>
              </div>
            </form>

            <div class="mt-6 grid gap-4 md:grid-cols-2">
              <div class="rounded-2xl border border-default p-4">
                <p class="mini-kicker">Draft</p>
                <p class="mini-prose mt-3 text-sm">
                  {{ editorForm.draftBody || 'Draft body is empty.' }}
                </p>
              </div>

              <div class="rounded-2xl border border-default p-4">
                <p class="mini-kicker">Last published</p>
                <p class="mini-prose mt-3 text-sm">
                  {{ selectedPage.publishedBody || 'This page has not been published yet.' }}
                </p>
              </div>
            </div>
          </template>

          <div
            v-else
            class="h-full flex items-center justify-center text-sm text-[var(--mini-muted)]"
          >
            Select a draft to edit it.
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { computed, reactive, ref, watch } from 'vue'
import * as z from 'zod'
import { createPage, saveDraft } from '~~/shared/features/pages/contract'

import { api } from '#trellis/api'

const { isAuthenticated, isPending, sessionUser, signOut } = useConvexAuth()
const client = useBetterAuthClient()
const authAction = useBetterAuthActions()

const signUpFields: AuthFormField[] = [
  { name: 'name', type: 'text', label: 'Name', placeholder: 'Editor name', required: true },
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'editor@example.com',
    required: true,
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Create a password',
    required: true,
  },
]

const signInFields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'editor@example.com',
    required: true,
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Your password',
    required: true,
  },
]

const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})

const signInSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

type SignUpSchema = z.output<typeof signUpSchema>
type SignInSchema = z.output<typeof signInSchema>

const createForm = reactive({
  title: '',
  slug: '',
})

const editorForm = reactive({
  title: '',
  slug: '',
  draftBody: '',
})

const studioArgs = computed(() => (isAuthenticated.value ? {} : undefined))
const {
  data: pages,
  pending: pagesPending,
  error: pagesError,
} = await useConvexQuery(api.features.pages.domain.listStudio, studioArgs)

const selectedId = ref<string | undefined>()

watch(
  pages,
  (value) => {
    if (!value?.length) {
      selectedId.value = undefined
      return
    }

    if (
      !selectedId.value ||
      !value.some((page: { _id: string }) => page._id === selectedId.value)
    ) {
      selectedId.value = value[0]?._id
    }
  },
  { immediate: true },
)

const selectedPage = computed(
  () => pages.value?.find((page: { _id: string }) => page._id === selectedId.value) ?? null,
)

watch(
  selectedPage,
  (page) => {
    if (!page) return
    editorForm.title = page.title
    editorForm.slug = page.slug
    editorForm.draftBody = page.draftBody
  },
  { immediate: true },
)

const createPageMutation = useConvexMutation(api.features.pages.domain.create)
const saveDraftMutation = useConvexMutation(api.features.pages.domain.save)
const publishPageMutation = useConvexMutation(api.features.pages.domain.publish)

const uiError = computed(
  () =>
    pagesError.value?.message ||
    createPageMutation.error.value?.message ||
    saveDraftMutation.error.value?.message ||
    publishPageMutation.error.value?.message ||
    '',
)

async function handleSignUp(payload: FormSubmitEvent<SignUpSchema>) {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signUp.email(payload.data), { redirectTo: '/studio' })
}

async function handleSignIn(payload: FormSubmitEvent<SignInSchema>) {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signIn.email(payload.data), { redirectTo: '/studio' })
}

async function handleSignOut() {
  await signOut()
}

async function handleCreatePage() {
  const parsed = createPage.zod.safeParse({
    title: createForm.title,
    slug: createForm.slug,
    draftBody: '',
  })
  if (!parsed.success) return

  const id = await createPageMutation(parsed.data)

  selectedId.value = id
  createForm.title = ''
  createForm.slug = ''
}

async function handleSaveDraft() {
  if (!selectedId.value) return
  const parsed = saveDraft.zod.safeParse({
    id: selectedId.value,
    title: editorForm.title,
    slug: editorForm.slug,
    draftBody: editorForm.draftBody,
  })
  if (!parsed.success) return

  await saveDraftMutation(parsed.data)
}

async function handlePublish() {
  if (!selectedId.value) return
  await publishPageMutation({ id: selectedId.value })
}
</script>
