<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page: server: false, lazy: true
 *
 * Expected behavior:
 * - SSR: No server fetch, renders with pending=true, hasData=false
 * - Client nav: Instant (non-blocking), shows skeleton for 800ms
 */

const { data, pending, status } = await useConvexQuery(api.notes.listDelayed, {}, {
  server: false,
  lazy: true,
})
</script>

<template>
  <div data-testid="server-false-lazy-true-page" class="test-page">
    <header class="page-header">
      <NuxtLink to="/test-query/hub" class="back-link">&larr; Back</NuxtLink>
      <div class="badge-row">
        <span class="badge server off">server: false</span>
        <span class="badge lazy">lazy: true</span>
      </div>
    </header>

    <h1>Notes</h1>
    <p class="status-line">
      Status: <code>{{ status }}</code>
      <span v-if="pending" class="loading-indicator">Loading...</span>
    </p>

    <!-- Skeleton loading state -->
    <div v-if="pending" class="notes-list">
      <div v-for="i in 5" :key="i" class="note-card skeleton">
        <div class="skeleton-title"></div>
        <div class="skeleton-content"></div>
        <div class="skeleton-content short"></div>
      </div>
    </div>

    <!-- Actual data -->
    <div v-else-if="data" class="notes-list">
      <div v-for="note in data" :key="note._id" class="note-card">
        <h3 class="note-title">{{ note.title }}</h3>
        <p class="note-content">{{ note.content }}</p>
      </div>
      <p v-if="data.length === 0" class="empty-state">No notes yet.</p>
    </div>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.back-link {
  color: #666;
  text-decoration: none;
  font-size: 0.9rem;
}

.back-link:hover {
  color: #333;
}

.badge-row {
  display: flex;
  gap: 8px;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge.server {
  background: #e3f2fd;
  color: #1565c0;
}

.badge.server.off {
  background: #fce4ec;
  color: #c62828;
}

.badge.lazy {
  background: #f3e5f5;
  color: #7b1fa2;
}

h1 {
  margin: 0 0 10px;
  font-size: 1.5rem;
}

.status-line {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 20px;
}

.status-line code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
}

.loading-indicator {
  margin-left: 10px;
  color: #1976d2;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-card {
  padding: 16px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.note-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
}

.note-content {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 40px;
}

/* Skeleton styles */
.note-card.skeleton {
  background: #fafafa;
}

.skeleton-title {
  height: 20px;
  width: 60%;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 12px;
}

.skeleton-content {
  height: 14px;
  width: 100%;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 8px;
}

.skeleton-content.short {
  width: 40%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
