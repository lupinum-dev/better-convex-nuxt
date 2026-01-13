import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'purge old demo data',
  { hours: 12 },
  internal.cleanup.purgeOldData
)

export default crons
