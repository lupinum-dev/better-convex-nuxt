import { defineConfig } from 'evalite/config'

export default defineConfig({
  scoreThreshold: 100,
  testTimeout: 60_000,
  maxConcurrency: 1,
})
