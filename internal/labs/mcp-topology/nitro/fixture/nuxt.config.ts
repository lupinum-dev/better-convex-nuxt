export default defineNuxtConfig({
  buildDir: process.env.BCN_VNEXT_NITRO_BUILD_DIR,
  compatibilityDate: '2026-07-20',
  devtools: { enabled: false },
  nitro: {
    output: {
      dir: process.env.BCN_VNEXT_NITRO_OUTPUT_DIR,
    },
    preset: 'node-server',
  },
})
