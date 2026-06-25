<script setup lang="ts">
defineProps<{
  projects: Array<{
    id: string
    name: string
    creator: string
    createdAtLabel: string
  }>
  serviceActors: Array<{
    id: string
    name: string
    summary: string
  }>
}>()
</script>

<template>
  <section class="results-layout">
    <div class="panel results-panel">
      <div class="panel-heading">
        <span class="step">A</span>
        <div>
          <h3>Projects</h3>
          <p>Human reads require active organization membership.</p>
        </div>
      </div>

      <ul v-if="projects.length" class="item-list" data-testid="project-list">
        <li v-for="project in projects" :key="project.id">
          <strong>{{ project.name }}</strong>
          <span>{{ project.creator }} · {{ project.createdAtLabel }}</span>
        </li>
      </ul>
      <p v-else class="empty-state" data-testid="empty-projects">No projects yet.</p>
    </div>

    <div class="panel results-panel">
      <div class="panel-heading">
        <span class="step">B</span>
        <div>
          <h3>Service actors</h3>
          <p>Credentials are never returned from Convex.</p>
        </div>
      </div>

      <ul v-if="serviceActors.length" class="item-list" data-testid="service-actor-list">
        <li v-for="actor in serviceActors" :key="actor.id">
          <strong>{{ actor.name }}</strong>
          <span>{{ actor.summary }}</span>
        </li>
      </ul>
      <p v-else class="empty-state" data-testid="empty-service-actors">No service actors yet.</p>
    </div>
  </section>
</template>
