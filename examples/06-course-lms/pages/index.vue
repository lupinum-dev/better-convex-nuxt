<!--
Why this file exists:
This page keeps the LMS UI small so the lesson-access chain stays visible while you click around.
-->
<template>
  <main class="page">
    <h1>Example 06: Course LMS</h1>
    <p>
      This example shows why role checks are not enough for learning platforms. Students need a
      role, an enrollment, a published course, a published lesson, and satisfied prerequisites.
    </p>

    <ConvexAuthLoading>
      <p>Checking your session...</p>
    </ConvexAuthLoading>

    <ConvexUnauthenticated>
      <form @submit.prevent="handleSignUp">
        <h2>Create account</h2>
        <input v-model="signUpForm.name" placeholder="Name" required />
        <input v-model="signUpForm.email" placeholder="Email" type="email" required />
        <input v-model="signUpForm.password" placeholder="Password" type="password" required />
        <button :disabled="authAction.pending.value">Sign up</button>
      </form>

      <form @submit.prevent="handleSignIn">
        <h2>Sign in</h2>
        <input v-model="signInForm.email" placeholder="Email" type="email" required />
        <input v-model="signInForm.password" placeholder="Password" type="password" required />
        <button :disabled="authAction.pending.value">Sign in</button>
      </form>
    </ConvexUnauthenticated>

    <ConvexAuthenticated>
      <header>
        <p>
          Signed in as <strong>{{ ctx?.displayName || user?.email }}</strong>
          <span v-if="role"> · role: {{ role }}</span>
        </p>
        <button @click="handleSignOut">Sign out</button>
      </header>

      <p v-if="false">Preparing your application user...</p>

      <section v-if="!tenantId">
        <form @submit.prevent="handleCreateWorkspace">
          <h2>Create workspace</h2>
          <input v-model="createWorkspaceForm.name" placeholder="Workspace name" required />
          <input v-model="createWorkspaceForm.slug" placeholder="Slug" required />
          <button :disabled="createWorkspace.pending.value">Create workspace</button>
        </form>

        <form @submit.prevent="handleJoinWorkspace">
          <h2>Join workspace</h2>
          <input v-model="joinWorkspaceForm.slug" placeholder="Workspace slug" required />
          <select v-model="joinWorkspaceForm.role">
            <option value="admin">admin</option>
            <option value="instructor">instructor</option>
            <option value="student">student</option>
          </select>
          <button :disabled="joinWorkspace.pending.value">Join workspace</button>
        </form>

        <ul v-if="workspaceOptions?.length">
          <li v-for="workspace in workspaceOptions" :key="workspace._id">
            {{ workspace.name }} ({{ workspace.slug }})
          </li>
        </ul>
      </section>

      <section v-else>
        <button v-if="canSeed" @click="seedDemoCourse({})">
          Seed demo course
        </button>

        <ul v-if="courses?.length">
          <li v-for="course in courses" :key="course._id">
            <strong>{{ course.title }}</strong> · {{ course.status }}
            <button @click="enrollSelf({ courseId: course._id })">Enroll me</button>

            <button @click="selectedCourseId = course._id">Load lessons</button>

            <ul v-if="selectedCourseId === course._id && lessons?.length">
              <li v-for="lesson in lessons" :key="lesson._id">
                {{ lesson.title }} · {{ lesson.status }}
                <button @click="openLesson(lesson._id)">Open</button>
                <button @click="completeLesson({ lessonId: lesson._id })">Mark complete</button>
              </li>
            </ul>
          </li>
        </ul>

        <pre v-if="selectedLesson">{{ selectedLesson }}</pre>
        <p v-if="lessonError">{{ lessonError }}</p>
      </section>
    </ConvexAuthenticated>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { can, ctx, role, tenantId } = usePermissions()
const canSeed = can('course.seed')

const signUpForm = reactive({ name: '', email: '', password: '' })
const signInForm = reactive({ email: '', password: '' })
const createWorkspaceForm = reactive({ name: '', slug: '' })
const joinWorkspaceForm = reactive({
  slug: '',
  role: 'student' as 'admin' | 'instructor' | 'student',
})

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)
const seedDemoCourse = useConvexMutation(api.courses.seedDemoCourse)
const enrollSelf = useConvexMutation(api.lessons.enrollSelf)
const completeLesson = useConvexMutation(api.lessons.completeLesson)
const selectedLessonId = ref<Id<'lessons'> | null>(null)
const selectedCourseId = ref<Id<'courses'> | null>(null)

const { data: workspaceOptions } = await useConvexQuery(api.workspaces.listWorkspaces, {})
const courseArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: courses } = await useConvexQuery(api.courses.listCourses, courseArgs)
const lessonsArgs = computed(() => (selectedCourseId.value ? { courseId: selectedCourseId.value } : undefined))
const { data: lessons } = await useConvexQuery(api.lessons.listLessonsByCourse, lessonsArgs)

watch(courses, (value) => {
  if (!value?.length) return
  if (!selectedCourseId.value) {
    selectedCourseId.value = value[0]!._id
  }
}, { immediate: true })

const selectedLessonArgs = computed(() => (selectedLessonId.value ? { id: selectedLessonId.value } : undefined))
const { data: selectedLesson, error: selectedLessonError } = await useConvexQuery(
  api.lessons.getLesson,
  selectedLessonArgs,
)

const lessonError = computed(
  () =>
    selectedLessonError.value?.message
    || seedDemoCourse.error.value?.message
    || enrollSelf.error.value?.message
    || completeLesson.error.value?.message
    || '',
)

async function handleSignUp() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(
    () => client.signUp.email(signUpForm),
    { redirectTo: '/' },
  )
}

async function handleSignIn() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(
    () => client.signIn.email(signInForm),
    { redirectTo: '/' },
  )
}

async function handleSignOut() {
  await signOut()
}

async function handleCreateWorkspace() {
  await createWorkspace(createWorkspaceForm)
}

async function handleJoinWorkspace() {
  await joinWorkspace(joinWorkspaceForm)
}

function openLesson(id: Id<'lessons'>) {
  selectedLessonId.value = id
}
</script>

<style scoped>
.page {
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem;
}

form,
section,
header,
ul,
pre {
  margin-bottom: 1rem;
}

input,
select,
button {
  display: block;
  width: 100%;
  max-width: 32rem;
  margin: 0.25rem 0;
  padding: 0.5rem;
}
</style>
