<script setup lang="ts">
interface NavLink {
  to: string
  label: string
  hint?: string
  testId?: string
  featured?: boolean
}

interface NavSection {
  title?: string
  links: NavLink[]
}

interface Props {
  title: string
  description?: string
  sections: NavSection[]
  testIdPrefix?: string
}

defineProps<Props>()
</script>

<template>
  <div class="test-hub">
    <header class="hub-header">
      <h1>{{ title }}</h1>
      <p v-if="description" class="description">{{ description }}</p>
    </header>

    <div v-for="(section, sIndex) in sections" :key="sIndex" class="hub-section">
      <h2 v-if="section.title">{{ section.title }}</h2>
      <nav class="nav-links">
        <NuxtLink
          v-for="link in section.links"
          :key="link.to"
          :to="link.to"
          :data-testid="link.testId || (testIdPrefix ? `${testIdPrefix}-${link.to.split('/').pop()}` : undefined)"
          class="nav-link"
          :class="{ featured: link.featured }"
        >
          <span class="link-label">{{ link.label }}</span>
          <span v-if="link.hint" class="link-hint">{{ link.hint }}</span>
        </NuxtLink>
      </nav>
    </div>

    <slot />
  </div>
</template>

<style scoped>
.test-hub {
  max-width: 700px;
  margin: 0 auto;
}

.hub-header {
  margin-bottom: 24px;
}

.hub-header h1 {
  font-size: 1.5rem;
  margin: 0 0 8px;
  color: #1f2937;
}

.description {
  color: #6b7280;
  margin: 0;
}

.hub-section {
  margin-bottom: 24px;
}

.hub-section h2 {
  font-size: 0.9rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 12px;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.15s;
}

.nav-link:hover {
  border-color: #d1d5db;
  background: #f9fafb;
}

.nav-link.featured {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.nav-link.featured:hover {
  background: #d1fae5;
  border-color: #6ee7b7;
}

.link-label {
  font-weight: 500;
  color: #1f2937;
}

.link-hint {
  font-size: 0.85rem;
  color: #6b7280;
}
</style>
