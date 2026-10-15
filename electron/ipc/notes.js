import { v } from "../security/validate.js";
import {
  removeStoredFiles,
  withMissingFlags,
} from "../services/attachments.js";

export function registerNoteHandlers(handle, ctx) {
  const { repo, paths } = ctx;

  handle("notes:list", (p = {}) => repo.listNotes(v.obj(p)));

  handle("notes:get", (p) => {
    const { id } = v.obj(p);
    const note = repo.getNote(id);
    note.attachments = withMissingFlags(repo, paths.attachmentsDir, id);
    return note;
  });

  handle("notes:create", (p = {}) => {
    const { folderId = null, title = "", contentHtml = "" } = v.obj(p);
    return repo.createNote({ folderId, title, contentHtml });
  });

  handle("notes:update", (p) => {
    const { id, patch } = v.obj(p);
    return repo.updateNote(id, patch);
  });

  handle("notes:delete", async (p) => {
    const { ids } = v.obj(p);
    const result = repo.deleteNotes(ids);
    await removeStoredFiles(paths.attachmentsDir, result.attachmentFiles);
    return { deleted: result.deleted };
  });

  handle("sidebar:get", () => ({
    counts: repo.counts(),
    folders: repo.listFolders(),
    tags: repo.listTags(),
    boards: repo.listBoards(),
  }));

  handle("folders:create", (p) => repo.createFolder(v.obj(p).name));
  handle("folders:rename", (p) => {
    const { id, name } = v.obj(p);
    return repo.renameFolder(id, name);
  });
  handle("folders:delete", async (p) => {
    const { id, strategy = "move" } = v.obj(p);
    const res = repo.deleteFolder(id, strategy);
    await removeStoredFiles(paths.attachmentsDir, res.attachmentFiles);
    return { movedNotes: res.movedNotes, deletedNotes: res.deletedNotes };
  });

  handle("tags:setForNote", (p) => {
    const { noteId, tags } = v.obj(p);
    return repo.setNoteTags(noteId, tags);
  });
}
