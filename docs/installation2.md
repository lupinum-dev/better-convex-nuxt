1) Make sure you have convex account: 
if not go to https://auth.convex.dev/sign-up

2) create new nuxt minimal app:

npm create nuxt@latest 

(matthias@Matthiass-MBP testing % npm create nuxt@latest

> npx
> create-nuxt


        .d$b.
       i$$A$$L  .d$b
     .$$F` `$$L.$$A$$.
    j$$'    `4$$:` `$$.
   j$$'     .4$:    `$$.
  j$$`     .$$:      `4$L
 :$$:____.d$$:  _____.:$$:
 `4$$$$$$$$P` .i$$$$$$$$P`

┌  Welcome to Nuxt!
│
◇  Templates loaded
│
◇  Which template would you like to use?
│  minimal – Minimal setup for Nuxt 4
│
◇  Where would you like to create your project?
│  better-test
│
◇  Creating project in better-test
│
◇  Downloaded minimal template
│
◇  Which package manager would you like to use?
│  pnpm
│
◇  Initialize git repository?
│  Yes
│
◇  Dependencies installed
│
◐  Initializing git repositoryInitialized empty Git repository in /Users/matthias/Git/testing/better-test/.git/
◇  Git repository initialized
│
◇  Would you like to install any of the official modules?
│  No
│
└  ✨ Nuxt project has been created with the minimal template.

╭── 👉 Next steps ─────╮
│                      │
│   › cd better-test   │
│   › pnpm run dev     │
│                      │
╰──────────────────────╯
matthias@Matthiass-MBP testing %)

----

3) 

Now we add `pnpm add convex better-convex-nuxt`

4) we add convex: {} to nuxt config:

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  + modules: ['better-convex-nuxt'],

  + convex: {
    url: process.env.CONVEX_URL
  },
})

5) INIT convex:

matthias@Matthiass-MBP better-test % npx convex dev
? What would you like to configure? create a new project
? Project name: better-test
? Use cloud or local dev deployment? For more see https://docs.convex.dev/cli/local-deployments cloud deployment
✔ Created project better-test, manage it at https://dashboard.convex.dev/t/matthias-amon-me-com/better-test
✔ Provisioned a dev deployment and saved its:
    name as CONVEX_DEPLOYMENT to .env.local
    URL as CONVEX_URL to .env.local

Write your Convex functions in convex/
Give us feedback at https://convex.dev/community or support@convex.dev
View the Convex dashboard at https://dashboard.convex.dev/d/wooden-toad-296

✔ 14:20:00 Convex functions ready! (1.56s)


6)

Create sample data for your database

In a new terminal window, create a sampleData.jsonl file with some sample data.
sampleData.jsonl

{"text": "Buy groceries", "isCompleted": true}
{"text": "Go for a swim", "isCompleted": true}
{"text": "Integrate Convex", "isCompleted": false}

Add the sample data to your database

Now that your project is ready, add a tasks table with the sample data into your Convex database with the import command.

npx convex import --table tasks sampleData.jsonl

---

matthias@Matthiass-MBP better-test % npx convex import --table tasks sampleData.jsonl
Import change summary:
table | create | delete |
-------------------------
tasks | 3      | 0 of 0 |
Once the import has started, it will run in the background.
Interrupting `npx convex import` will not cancel it.
✔ Added 3 documents to table "tasks".
matthias@Matthiass-MBP better-test % 



7) 

Define a schema

Add a new file schema.ts in the convex/ folder with a description of your data.

This will declare the types of your data for optional typechecking with TypeScript, and it will be also enforced at runtime.

convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
  }),
});

8. Expose a database query

Add a new file tasks.ts in the convex/ folder with a query function that loads the data.

Exporting a query function from this file declares an API function named after the file and the export name, api.tasks.get.
convex/tasks.ts

import { query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});

9)

Display the data in your app

In app.vue use useQuery to subscribe your api.tasks.get API function.
app/app.vue

<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { data, status, error }= useConvexQuery(api.tasks.list, { })
</script>

<template>
  <div>
    {{ status }}
    <p v-if="status === 'pending'">Loading...</p>
    <p v-else-if="error">Error loading tasks: {{ error.message }}</p>
    <p v-for="task in data" :key="task._id">{{ task.text }}</p>
  </div>
</template>


10) Update script to start development server

By default, Convex stores environment variables in .env.local, and Nuxt looks for environment variables in .env.

To use the default npm run dev command, update your package.json to use the --dotenv .env.local flag.
package.json

{
  "name": "nuxt-app",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev --dotenv .env.local",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare"
  },
  "dependencies": {
    "convex": "^1.25.2",
    "convex-nuxt": "^0.1.3",
    "nuxt": "^3.17.6",
    "vue": "^3.5.17",
    "vue-router": "^4.5.1"
  }
}

11) Start the app

Start the app, open http://localhost:3000 in a browser, and see the list of tasks.

npm run dev

