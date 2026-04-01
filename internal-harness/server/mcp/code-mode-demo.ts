import createNote from './tools/create-note'
import deleteNote from './tools/delete-note'
import listNotes from './tools/list-notes'
import searchNotes from './tools/search-notes'
import updateNote from './tools/update-note'

export default defineMcpHandler({
  name: 'notes-agent',
  route: '/mcp/notes-agent',
  experimental_codeMode: true,
  tools: [listNotes, searchNotes, createNote, updateNote, deleteNote],
  browserRedirect: '/demo/mcp-verify',
})
