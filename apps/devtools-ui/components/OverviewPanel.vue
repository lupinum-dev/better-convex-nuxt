<script setup lang="ts">
import type {
  QueryRegistryEntry,
  MutationEntry,
  EnhancedAuthState,
  ConnectionState,
  DecisionTraceState,
} from '../../../src/runtime/devtools/types'

defineProps<{
  queries: QueryRegistryEntry[]
  mutations: MutationEntry[]
  authState: EnhancedAuthState | null
  connectionState: ConnectionState | null
  errorCount: number
  decisionTrace?: DecisionTraceState | null
}>()
</script>

<template>
  <div class="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
    <!-- Connection -->
    <NCard class="p-4">
      <div class="flex items-center gap-2 mb-2">
        <NIcon
          icon="i-carbon-wifi"
          :class="connectionState?.isConnected ? 'text-green-500' : 'text-red-500'"
        />
        <span class="text-xs font-medium op-60">Connection</span>
      </div>
      <div class="text-lg font-bold">
        {{ connectionState?.isConnected ? 'Connected' : 'Disconnected' }}
      </div>
    </NCard>

    <!-- Active Queries -->
    <NCard class="p-4">
      <div class="flex items-center gap-2 mb-2">
        <NIcon icon="i-carbon-search" class="text-blue-500" />
        <span class="text-xs font-medium op-60">Queries</span>
      </div>
      <div class="text-lg font-bold">
        {{ queries.length }}
      </div>
      <div class="text-xs op-50">
        {{ queries.filter((q) => q.hasSubscription).length }} subscribed
      </div>
    </NCard>

    <!-- Mutations -->
    <NCard class="p-4">
      <div class="flex items-center gap-2 mb-2">
        <NIcon icon="i-carbon-send" class="text-amber-500" />
        <span class="text-xs font-medium op-60">Mutations</span>
      </div>
      <div class="text-lg font-bold">
        {{ mutations.length }}
      </div>
      <div class="text-xs op-50">
        {{ mutations.filter((m) => m.state === 'pending' || m.state === 'optimistic').length }}
        in-flight
      </div>
    </NCard>

    <!-- Errors -->
    <NCard class="p-4">
      <div class="flex items-center gap-2 mb-2">
        <NIcon
          icon="i-carbon-warning"
          :class="errorCount > 0 ? 'text-red-500' : 'text-green-500'"
        />
        <span class="text-xs font-medium op-60">Errors</span>
      </div>
      <div class="text-lg font-bold" :class="errorCount > 0 ? 'text-red-500' : ''">
        {{ errorCount }}
      </div>
    </NCard>

    <!-- Auth Summary (full width) -->
    <NCard class="p-4 col-span-2 lg:col-span-4">
      <div class="flex items-center gap-2 mb-3">
        <NIcon icon="i-carbon-user" class="text-purple-500" />
        <span class="text-xs font-medium op-60">Authentication</span>
      </div>
      <div v-if="authState?.isAuthenticated" class="flex items-center gap-4">
        <div>
          <div class="font-medium">{{ authState.sessionUser?.displayName || 'Authenticated' }}</div>
          <div class="text-xs op-50">{{ authState.sessionUser?.email || '' }}</div>
        </div>
        <NBadge n="green xs">Valid Token</NBadge>
        <div v-if="authState.expiresInSeconds !== undefined" class="text-xs op-50 font-mono">
          Expires in {{ Math.floor(authState.expiresInSeconds / 60) }}:{{
            (authState.expiresInSeconds % 60).toString().padStart(2, '0')
          }}
        </div>
      </div>
      <div v-else class="op-50 text-sm">Not authenticated</div>
    </NCard>

    <!-- Latest Decision -->
    <NCard v-if="decisionTrace" class="p-4 col-span-2 lg:col-span-4">
      <div class="flex items-center gap-2 mb-3">
        <NIcon
          icon="i-carbon-security"
          :class="
            decisionTrace.lastEventStatus === 'deny' || decisionTrace.lastEventStatus === 'error'
              ? 'text-red-500'
              : 'text-green-500'
          "
        />
        <span class="text-xs font-medium op-60">Latest Decision Trace</span>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs mb-3">
        <NBadge
          :n="
            decisionTrace.lastEventStatus === 'deny' || decisionTrace.lastEventStatus === 'error'
              ? 'red xs'
              : 'green xs'
          "
        >
          {{ decisionTrace.lastEventStatus || 'unknown' }}
        </NBadge>
        <span v-if="decisionTrace.handler" class="font-mono">{{ decisionTrace.handler }}</span>
        <span v-if="decisionTrace.tool" class="op-50">tool: {{ decisionTrace.tool }}</span>
        <span v-if="decisionTrace.operation" class="op-50"
          >operation: {{ decisionTrace.operation }}</span
        >
        <span v-if="decisionTrace.correlationId" class="op-40 font-mono">{{
          decisionTrace.correlationId
        }}</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="rounded bg-gray/5 border border-base px-3 py-2">
          <div class="op-50 uppercase tracking-wide mb-1">Identity</div>
          <div>Principal: {{ decisionTrace.principalKind || '-' }}</div>
          <div>AppIdentity: {{ decisionTrace.actorKind || '-' }}</div>
          <div>Tenant: {{ decisionTrace.tenantId || '-' }}</div>
        </div>
        <div class="rounded bg-gray/5 border border-base px-3 py-2 md:col-span-2">
          <div class="op-50 uppercase tracking-wide mb-1">Reason</div>
          <div class="font-medium">
            {{
              decisionTrace.denialExplanation?.reason ||
              decisionTrace.denialExplanation?.policy ||
              decisionTrace.lastEventName ||
              'No explanation attached'
            }}
          </div>
          <div v-if="decisionTrace.denialExplanation?.suggestedAction" class="op-60 mt-1">
            {{ decisionTrace.denialExplanation?.suggestedAction }}
          </div>
        </div>
      </div>
    </NCard>

    <!-- Recent Errors (if any) -->
    <NCard v-if="errorCount > 0" class="p-4 col-span-2 lg:col-span-4">
      <div class="flex items-center gap-2 mb-3">
        <NIcon icon="i-carbon-warning" class="text-red-500" />
        <span class="text-xs font-medium op-60">Recent Errors</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="q in queries.filter((q) => q.status === 'error')"
          :key="q.id"
          class="flex items-center gap-2 text-xs font-mono p-2 rounded bg-red-500/5"
        >
          <NBadge n="red xs">Query</NBadge>
          <span class="font-medium">{{ q.name }}</span>
          <span class="op-50 truncate">{{ q.error }}</span>
        </div>
        <div
          v-for="m in mutations.filter((m) => m.state === 'error')"
          :key="m.id"
          class="flex items-center gap-2 text-xs font-mono p-2 rounded bg-red-500/5"
        >
          <NBadge n="red xs">{{ m.type }}</NBadge>
          <span class="font-medium">{{ m.name }}</span>
          <span class="op-50 truncate">{{ m.error }}</span>
        </div>
      </div>
    </NCard>
  </div>
</template>
