<template>
  <main class="page">
    <section class="shell">
      <header class="toolbar">
        <div>
          <NuxtLink class="back" to="/">← Back to projects</NuxtLink>
          <h1>Workspace admin</h1>
          <p class="hint">
            Three scoped queries run at once here: stats, recent activity, and members.
          </p>
        </div>
      </header>

      <section class="stats-grid">
        <StatsCard label="Active projects" :value="stats?.activeProjects" />
        <StatsCard label="Open tasks" :value="stats?.openTasks" />
        <StatsCard label="Completed today" :value="stats?.completedToday" />
        <StatsCard label="Team members" :value="members?.length" />
      </section>

      <section class="two-up">
        <article class="card">
          <h2>Recent activity</h2>
          <ul class="activity-list">
            <li v-for="event in recentActivity || []" :key="event._id">
              <strong>{{ event.action }}</strong>
              <p>{{ event.description }}</p>
            </li>
          </ul>
        </article>

        <article class="card">
          <h2>Members</h2>
          <MemberRow v-for="member in members || []" :key="member._id" :member="member" />
        </article>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
/**
 * Why this file exists:
 * The admin dashboard proves that multiple scoped queries can compose on one page and that role
 * changes propagate live into the rest of the app without any manual refresh logic.
 */
import { api } from '~/convex/_generated/api'

definePageMeta({
  convexAuth: true,
})

usePermissionGuard({
  permission: 'workspace.audit',
  redirectTo: '/',
})

const { data: stats } = await useConvexQuery(api.dashboard.stats, {})
const { data: recentActivity } = await useConvexQuery(api.dashboard.recentActivity, { limit: 12 })
const { data: members } = await useConvexQuery(api.members.list, {})
</script>

<style scoped>
.page {
  padding: 2rem;
  background: #eef4fb;
  min-height: 100vh;
}

.shell {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

.toolbar,
.card {
  padding: 1rem;
  border: 1px solid #dbe4ef;
  border-radius: 20px;
  background: white;
}

.stats-grid,
.two-up {
  display: grid;
  gap: 1rem;
}

.stats-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.two-up {
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.activity-list li {
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e6edf5;
}

.activity-list p,
.hint,
.back {
  margin: 0.2rem 0 0;
  color: #667085;
}

.back {
  text-decoration: none;
}

@media (max-width: 900px) {
  .two-up {
    grid-template-columns: 1fr;
  }
}
</style>
