import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.daily(
  'purge soft-deleted projects',
  {
    hourUTC: 3,
    minuteUTC: 0,
  },
  internal.projects.purgeSoftDeleted,
  {},
)

export default crons
