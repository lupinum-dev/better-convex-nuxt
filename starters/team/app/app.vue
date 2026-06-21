<template>
  <NuxtPage />
</template>

<style>
body {
  margin: 0;
  background: #f7f8fb;
  color: #18181b;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

button {
  height: 40px;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  background: #18181b;
  color: white;
  font: inherit;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.shell {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px;
}

.header p {
  margin: 0 0 8px;
  color: #64748b;
}

.header h1 {
  margin: 0 0 24px;
}

.empty,
.user {
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: white;
}

.empty {
  color: #475569;
}

.user {
  grid-template-columns: 1fr auto;
  align-items: center;
  color: #18181b;
}

.user button {
  width: fit-content;
  padding: 0 14px;
}

.list,
.items-list {
  display: grid;
  gap: 8px;
}

.list a,
.items-list li {
  padding: 14px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: white;
  color: inherit;
}

.list a {
  display: flex;
  justify-content: space-between;
  text-decoration: none;
}

.items-list {
  padding: 0;
  list-style: none;
}
</style>
