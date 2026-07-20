import { httpRouter } from 'convex/server'

import { generateReport, renameNote, searchNotes } from './exact_call'

const http = httpRouter()

// Each route has a fixed operation and generated Convex function reference.
// No proof claim is ever used to construct or select a function dynamically.
http.route({ handler: searchNotes, method: 'POST', path: '/exact-call/query/search-notes' })
http.route({ handler: renameNote, method: 'POST', path: '/exact-call/mutation/rename-note' })
http.route({ handler: generateReport, method: 'POST', path: '/exact-call/action/generate-report' })

export default http
