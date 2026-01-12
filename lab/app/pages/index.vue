<template>
  <div>
    <UPageHero
      title="Convex Labs"
      description="Interactive playground to experience better-convex-nuxt in action. Real-time updates, optimistic mutations, pagination, and file storage - all with beautiful Nuxt UI components."
      :links="[{
        label: 'Enter Labs',
        to: '/labs',
        trailingIcon: 'i-lucide-arrow-right',
        size: 'xl'
      }, {
        label: 'View on GitHub',
        to: 'https://github.com/lupinum-dev/better-convex-nuxt',
        target: '_blank',
        icon: 'i-simple-icons-github',
        size: 'xl',
        color: 'neutral',
        variant: 'subtle'
      }]"
    />

    <UPageSection
      id="features"
      title="Experience Convex Features"
      description="Explore interactive demos that showcase the power of real-time databases with Nuxt. Each lab demonstrates a key feature you can use in your own apps."
      :features="[{
        icon: 'i-lucide-radio',
        title: 'Real-time Subscriptions',
        description: 'Watch data sync instantly across browser tabs. useConvexQuery creates live WebSocket subscriptions that update automatically when data changes.'
      }, {
        icon: 'i-lucide-zap',
        title: 'Optimistic Updates',
        description: 'Make your UI feel instant. Predict mutation results locally while the server processes, with automatic rollback on errors.'
      }, {
        icon: 'i-lucide-list',
        title: 'Cursor Pagination',
        description: 'Load data efficiently with useConvexPaginatedQuery. Supports infinite scroll and load-more patterns with real-time updates.'
      }, {
        icon: 'i-lucide-cloud-upload',
        title: 'File Storage',
        description: 'Upload files with progress tracking and generate secure URLs. Integrated storage that works seamlessly with your queries.'
      }, {
        icon: 'i-lucide-shield',
        title: 'Type-safe Permissions',
        description: 'Role-based access control with createPermissions(). Define permissions once, check them everywhere - fully typed.'
      }, {
        icon: 'i-lucide-key',
        title: 'Better Auth Integration',
        description: 'Pre-configured GitHub OAuth with Better Auth. Automatic token sync, SSR session handling, and no auth flash.'
      }]"
    />

    <UPageSection>
      <UPageCTA
        title="Ready to build with Convex + Nuxt?"
        description="Install better-convex-nuxt and start building real-time applications in minutes. Full TypeScript support, SSR compatibility, and beautiful APIs."
        variant="subtle"
        :links="[{
          label: 'Read the Docs',
          to: 'https://github.com/lupinum-dev/better-convex-nuxt#readme',
          target: '_blank',
          trailingIcon: 'i-lucide-arrow-right',
          color: 'neutral'
        }, {
          label: 'npm install',
          to: 'https://www.npmjs.com/package/better-convex-nuxt',
          target: '_blank',
          icon: 'i-simple-icons-npm',
          color: 'neutral',
          variant: 'outline'
        }]"
      />
    </UPageSection>
  </div>
</template>
