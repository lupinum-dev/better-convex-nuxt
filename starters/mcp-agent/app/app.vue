<template>
  <main class="shell">
    <p>MCP agent starter</p>
    <h1>Service actors call the same Convex functions as the app.</h1>
    <p>
      Configure a service actor credential, then call <code>POST /mcp</code>
      with <code>Authorization: Bearer &lt;secret&gt;</code>.
    </p>
  </main>
</template>

<style>
body {
  margin: 0;
  background: #f8fafc;
  color: #18181b;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

.shell {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px;
}
</style>

