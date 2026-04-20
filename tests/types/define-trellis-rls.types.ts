import { defineTrellis } from '../../src/runtime/functions'

defineTrellis(
  { query: () => null as never, mutation: () => null as never },
  {
    // @ts-expect-error custom RLS authoring has been removed from the public contract
    rls: {
      rules: {},
    },
  },
)
