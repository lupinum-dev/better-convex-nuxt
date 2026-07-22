import {
  createBetterConvex,
  useConvexAction,
  useConvexConnectionState,
  useConvexMutation,
  useConvexPaginatedQuery,
  useConvexQuery,
} from 'better-convex-vue'
import { makeFunctionReference } from 'convex/server'
import { createApp, defineComponent, h } from 'vue'

const query = makeFunctionReference<'query'>('notes:list')
const paginatedQuery = makeFunctionReference<'query'>('notes:listPaginated')
const mutation = makeFunctionReference<'mutation'>('notes:rename')
const action = makeFunctionReference<'action'>('notes:report')

const AnonymousConsumer = defineComponent({
  setup() {
    const notes = useConvexQuery(query, 'skip')
    const pages = useConvexPaginatedQuery(paginatedQuery, 'skip', { initialNumItems: 10 })
    const rename = useConvexMutation(mutation)
    const report = useConvexAction(action)
    const connection = useConvexConnectionState()

    return () =>
      h('main', { 'data-consumer': 'better-convex-vue-anonymous' }, [
        h('p', `query:${notes.status.value}`),
        h('p', `pagination:${pages.status.value}`),
        h('p', `mutation:${rename.status.value}`),
        h('p', `action:${report.status.value}`),
        h('p', `connected:${connection.isConnected.value}`),
      ])
  },
})

createApp(AnonymousConsumer)
  .use(createBetterConvex({ convexUrl: 'https://anonymous-consumer.invalid' }))
  .mount('#app')
