<template>
  <main class="shell">
    <section class="header">
      <p>Team starter</p>
      <h1>Organizations</h1>
    </section>

    <ConvexAuthLoading>
      <section class="empty">Checking session...</section>
    </ConvexAuthLoading>

    <ConvexUnauthenticated>
      <AuthPanel message="Create an account or sign in to manage organizations." />
    </ConvexUnauthenticated>

    <ConvexAuthenticated>
      <OrganizationWorkspace />
    </ConvexAuthenticated>
  </main>
</template>
