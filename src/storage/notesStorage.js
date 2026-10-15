// Renderer-side storage layer. React components never call window.api
// directly; they go through these functions, which makes it easy to change
// the transport (or to mock it in tests) without touching the UI.
import { getApi } from '../services/api.js';

export const storage = {
  loadSidebar: () => getApi().sidebar.get(),
  listNotes: (query) => getApi().notes.list(query),
  getNote: (id) => getApi().notes.get({ id }),
  createNote: (data) => getApi().notes.create(data),
  updateNote: (id, patch) => getApi().notes.update({ id, patch }),
  deleteNotes: (ids) => getApi().notes.remove({ ids }),

  createFolder: (name) => getApi().folders.create({ name }),
  renameFolder: (id, name) => getApi().folders.rename({ id, name }),
  deleteFolder: (id, strategy) => getApi().folders.remove({ id, strategy }),

  setTags: (noteId, tags) => getApi().tags.setForNote({ noteId, tags }),

  getSettings: () => getApi().settings.get(),
  saveSettings: (patch) => getApi().settings.set({ patch }),

  createBoard: (name) => getApi().boards.create({ name }),
  getBoard: (id) => getApi().boards.get({ id }),
  saveBoard: (id, data) => getApi().boards.save({ id, ...data }),
  deleteBoard: (id) => getApi().boards.remove({ id }),
};
